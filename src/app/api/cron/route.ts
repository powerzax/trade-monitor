import { NextRequest, NextResponse } from "next/server";
import { sql, initDB } from "@/lib/db";
import { runScan } from "@/lib/screener";
import { runCalibration } from "@/lib/calibrate";
import { saveAccuracy } from "@/lib/accuracy";
import { computeHoldings, type Position } from "@/lib/portfolio";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await initDB();

    // ดึง favorites จาก DB
    const favRows = await sql`SELECT symbol, crypto, name FROM favorites`;
    const favorites = favRows.map((r) => ({ symbol: r.symbol, crypto: r.crypto, name: r.name }));

    // เรียก market overview API
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://trade-monitor-two.vercel.app";
    const internal: Record<string, string> = secret ? { Authorization: `Bearer ${secret}` } : {};
    const res = await fetch(`${baseUrl}/api/market-overview`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...internal },
      body: JSON.stringify({ favorites }),
    });

    if (!res.ok) throw new Error("Market overview failed");
    const analysis = await res.json();

    const lastCal = await sql`SELECT created_at FROM analysis_cache WHERE type = 'weights' ORDER BY created_at DESC LIMIT 1`;
    if (!lastCal.length || Date.now() - new Date(lastCal[0].created_at).getTime() > 7 * 86400_000) {
      const cal = await runCalibration();
      await sql`INSERT INTO analysis_cache (symbol, type, result) VALUES ('WEIGHTS', 'weights', ${JSON.stringify(cal)}::jsonb)`;
    }

    await saveAccuracy().catch(() => null);

    const scan = await runScan();
    await sql`INSERT INTO analysis_cache (symbol, type, result) VALUES ('SCREENER', 'screener', ${JSON.stringify(scan)}::jsonb)`;

    // Re-analyse every open holding so the morning view already has hold/sell advice.
    const posRows = await sql`SELECT id, symbol, crypto, name, price::float AS price, qty::float AS qty, side, to_char(bought_at, 'YYYY-MM-DD') AS bought_at FROM positions`;
    const { open } = computeHoldings(posRows as unknown as Position[]);
    const holdingResults: { symbol: string; ok: boolean; action?: string }[] = [];
    for (const h of open) {
      try {
        const sym = h.symbol.replace(/-USD$/, "");
        const [stock, news] = await Promise.all([
          fetch(`${baseUrl}/api/stock?symbol=${sym}&crypto=${h.crypto}`, { headers: internal }).then((r) => r.json()),
          fetch(`${baseUrl}/api/news?symbol=${h.symbol}`, { headers: internal }).then((r) => r.json()).catch(() => ({ items: [] })),
        ]);
        if (stock.error) throw new Error(stock.error);
        const a = await fetch(`${baseUrl}/api/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...internal },
          body: JSON.stringify({ ...stock, news: news.items ?? [], position: h }),
        }).then((r) => r.json());
        holdingResults.push({ symbol: h.symbol, ok: !a.error, action: a.positionAdvice?.actionTH });
      } catch {
        holdingResults.push({ symbol: h.symbol, ok: false });
      }
    }

    // ส่ง Telegram (ถ้ามี token)
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
      const mood = analysis.marketMood === "bullish" ? "🟢" : analysis.marketMood === "bearish" ? "🔴" : analysis.marketMood === "mixed" ? "🟡" : "⚪";
      const fg = analysis.fearGreed ? `\nFear&Greed: ${analysis.fearGreed.score}/100 (${analysis.fearGreed.rating})` : "";

      const topStocks = analysis.stockPicks?.slice(0, 3).map((p: { symbol: string; suggestion: string; score: number }) =>
        `• ${p.symbol} — ${p.suggestion === "Buy" ? "ซื้อได้" : p.suggestion === "Wait" ? "รอจังหวะ" : "หลีกเลี่ยง"} (${p.score}/10)`
      ).join("\n") ?? "";

      const topCrypto = analysis.cryptoPicks?.slice(0, 3).map((p: { symbol: string; suggestion: string; score: number }) =>
        `• ${p.symbol.replace(/-USD$/, "")} — ${p.suggestion === "Buy" ? "ซื้อได้" : p.suggestion === "Wait" ? "รอจังหวะ" : "หลีกเลี่ยง"} (${p.score}/10)`
      ).join("\n") ?? "";

      const favSection = analysis.favoritesAnalysis?.length > 0
        ? `\n\n⭐ *Favorites*\n` + analysis.favoritesAnalysis.map((f: { symbol: string; suggestion: string; keyPoint: string }) =>
          `• ${f.symbol.replace(/-USD$/, "")} — ${f.suggestion === "Buy" ? "ซื้อได้" : f.suggestion === "Wait" ? "รอจังหวะ" : "หลีกเลี่ยง"}\n  ${f.keyPoint}`
        ).join("\n")
        : "";

      const topScan = scan.rows.slice(0, 5).map((r) => `• ${r.ticker.replace(/-USD$/, "")} ${r.score > 0 ? "+" : ""}${r.score}/7`).join("\n");
      const holdSection = holdingResults.length
        ? `\n\n💼 *พอร์ต*\n` + holdingResults.map((h) => `• ${h.symbol.replace(/-USD$/, "")} — ${h.action ?? (h.ok ? "วิเคราะห์แล้ว" : "ผิดพลาด")}`).join("\n")
        : "";
      const message = `📈 *Trade Monitor — รายงานตลาด*
${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}

${mood} *สถานการณ์ตลาด*
${analysis.marketOverview}${fg}

💡 ${analysis.bestOpportunity}
⚠️ ${analysis.topRisk}

🏢 *หุ้น US น่าสนใจ*
${topStocks}

🪙 *Crypto น่าสนใจ*
${topCrypto}${favSection}${holdSection}

🔎 *สแกนเจอสัญญาณดี*
${topScan}`;

      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: "Markdown",
        }),
      });
    }

    return NextResponse.json({ ok: true, time: new Date().toISOString(), scanned: scan.rows.length, holdings: holdingResults });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Cron failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
