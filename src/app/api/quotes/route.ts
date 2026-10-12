import { NextRequest, NextResponse } from "next/server";
import { fetchChart, parseCloses } from "@/lib/yahoo";

export async function GET(req: NextRequest) {
  const symbols = (req.nextUrl.searchParams.get("symbols") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 30);
  const quotes = await Promise.all(symbols.map(async (ticker) => {
    try {
      const chart = await fetchChart(ticker, "1d", 45);
      const pts = parseCloses(chart);
      if (pts.length < 2) return null;
      const price = chart?.chart?.result?.[0]?.meta?.regularMarketPrice ?? pts[pts.length - 1].close;
      const prev = pts[pts.length - 2].close;
      return {
        ticker,
        name: chart?.chart?.result?.[0]?.meta?.shortName ?? ticker,
        price,
        changePct: Math.round(((price - prev) / prev) * 10000) / 100,
        spark: pts.slice(-30).map((p) => Math.round(p.close * 100) / 100),
      };
    } catch { return null; }
  }));
  return NextResponse.json({ quotes: quotes.filter(Boolean) });
}
