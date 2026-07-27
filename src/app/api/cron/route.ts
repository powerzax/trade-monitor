import { NextResponse } from "next/server";
import { sql, initDB } from "@/lib/db";

export async function GET() {
  try {
    await initDB();

    // ดึง favorites จาก DB
    const favRows = await sql`SELECT symbol, crypto, name FROM favorites`;
    const favorites = favRows.map((r) => ({ symbol: r.symbol, crypto: r.crypto, name: r.name }));

    // เรียก market overview API
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://trade-monitor-two.vercel.app";
    const res = await fetch(`${baseUrl}/api/market-overview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favorites }),
    });

    if (!res.ok) throw new Error("Market overview failed");
    const analysis = await res.json();

    // บันทึกผลลัพธ์ใน DB
    await sql`
      INSERT INTO analysis_cache (type, result)
      VALUES ('market_overview', ${JSON.stringify(analysis)}::jsonb)
    `;

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

      const message = `📈 *Trade Monitor — รายงานตลาด*
${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}

${mood} *สถานการณ์ตลาด*
${analysis.marketOverview}${fg}

💡 ${analysis.bestOpportunity}
⚠️ ${analysis.topRisk}

🏢 *หุ้น US น่าสนใจ*
${topStocks}

🪙 *Crypto น่าสนใจ*
${topCrypto}${favSection}`;

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

    return NextResponse.json({ ok: true, time: new Date().toISOString() });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Cron failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
