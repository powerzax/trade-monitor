import { NextRequest, NextResponse } from "next/server";
import { sql, initDB } from "@/lib/db";
import { runScan } from "@/lib/screener";
import { runCalibration } from "@/lib/calibrate";
import { saveAccuracy } from "@/lib/accuracy";
import { computeHoldings, type Position } from "@/lib/portfolio";
import { takeSnapshot } from "@/lib/snapshot";

export const maxDuration = 300;

// One analysis is ~5-6k tokens against an 8k tokens/minute cap, so AI calls are spaced a minute apart and the
// morning run is limited to a few symbols that fit inside the 300s function limit.
const AI_SLOTS = 3;
const AI_GAP_MS = 65_000;
const DEADLINE_MS = 280_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  let lastAiAt = 0;
  try {
    await initDB();

    // First, and isolated: a failure later in the run must not cost the day's portfolio snapshot.
    const snapshot = await takeSnapshot().catch((e) => ({ saved: false, reason: e instanceof Error ? e.message : "error" }));

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

    lastAiAt = Date.now();
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

    // Pick up to AI_SLOTS symbols: holdings whose advice is oldest (skipping any analysed in the last 20h), then
    // top scanner picks not analysed for 7 days, which also grows the data the accuracy stats learn from.
    const posRows = await sql`SELECT id, symbol, crypto, name, price::float AS price, qty::float AS qty, side, to_char(bought_at, 'YYYY-MM-DD') AS bought_at FROM positions`;
    const { open } = computeHoldings(posRows as unknown as Position[]);
    const lastRows = await sql`SELECT symbol, MAX(created_at) AS at FROM analysis_cache WHERE type = 'symbol' GROUP BY symbol`;
    const lastAt = new Map(lastRows.map((r) => [r.symbol as string, new Date(r.at).getTime()]));
    const ageH = (sym: string) => (Date.now() - (lastAt.get(sym) ?? 0)) / 3600_000;

    const queue: { symbol: string; crypto: boolean; holding?: (typeof open)[number] }[] = [];
    for (const h of [...open].sort((a, b) => ageH(b.symbol) - ageH(a.symbol))) {
      if (queue.length < AI_SLOTS && ageH(h.symbol) >= 20) queue.push({ symbol: h.symbol, crypto: h.crypto, holding: h });
    }
    const held = new Set(open.map((h) => h.symbol));
    for (const r of scan.rows) {
      if (queue.length >= AI_SLOTS) break;
      if (r.score >= 2 && !held.has(r.ticker) && ageH(r.ticker) >= 24 * 7) queue.push({ symbol: r.ticker, crypto: r.crypto });
    }

    const holdingResults: { symbol: string; ok: boolean; action?: string; note?: string }[] = [];
    for (const item of queue) {
      const sym = item.symbol.replace(/-USD$/, "");
      try {
        const [stock, news] = await Promise.all([
          fetch(`${baseUrl}/api/stock?symbol=${sym}&crypto=${item.crypto}`, { headers: internal }).then((r) => r.json()),
          fetch(`${baseUrl}/api/news?symbol=${item.symbol}`, { headers: internal }).then((r) => r.json()).catch(() => ({ items: [] })),
        ]);
        if (stock.error) throw new Error(stock.error);

        let a: { error?: string; rateLimited?: boolean; retryAfter?: number; positionAdvice?: { actionTH?: string } } = {};
        for (let attempt = 0; attempt < 2; attempt++) {
          const wait = Math.max(0, lastAiAt + AI_GAP_MS - Date.now()) + (attempt ? (a.retryAfter ?? 60) * 1000 : 0);
          if (Date.now() - started + wait + 15_000 > DEADLINE_MS) { a = { error: "out of time" }; break; }
          await sleep(wait);
          a = await fetch(`${baseUrl}/api/analyze`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...internal },
            body: JSON.stringify({ ...stock, news: news.items ?? [], position: item.holding ?? null }),
          }).then((r) => r.json());
          lastAiAt = Date.now();
          if (!a.rateLimited) break;
        }
        holdingResults.push({ symbol: item.symbol, ok: !a.error, action: a.positionAdvice?.actionTH, note: a.error });
        if (a.error === "out of time") break;
      } catch (e) {
        holdingResults.push({ symbol: item.symbol, ok: false, note: e instanceof Error ? e.message : "error" });
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
        ? `\n\n🤖 *วิเคราะห์เช้านี้*\n` + holdingResults.map((h) => `• ${h.symbol.replace(/-USD$/, "")} — ${h.action ?? (h.ok ? "วิเคราะห์แล้ว" : "ผิดพลาด")}`).join("\n")
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

    return NextResponse.json({ ok: true, time: new Date().toISOString(), seconds: Math.round((Date.now() - started) / 1000), snapshot, scanned: scan.rows.length, analysed: holdingResults });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Cron failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
