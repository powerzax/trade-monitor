import { fetchChart } from "@/lib/yahoo";
import { computeIndicators, type SignalWeights } from "@/lib/indicators";
import { getCalibration } from "@/lib/calibrate";

export const US = [
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "AVGO", "TSLA", "BRK-B", "LLY",
  "JPM", "V", "MA", "UNH", "XOM", "COST", "HD", "PG", "JNJ", "NFLX",
  "ABBV", "BAC", "CRM", "ORCL", "AMD", "KO", "PEP", "MRK", "CVX", "WMT",
  "ADBE", "TMO", "CSCO", "ACN", "MCD", "LIN", "ABT", "QCOM", "INTU", "TXN",
  "DIS", "IBM", "AMAT", "CAT", "GE", "NOW", "UBER", "PLTR", "MU", "ISRG",
  "GS", "BKNG", "SPGI", "AXP", "LRCX", "PANW", "ANET", "SHOP", "COIN", "SMCI",
];
export const CRYPTO = ["BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "DOGE", "AVAX", "LINK", "DOT"].map((c) => `${c}-USD`);

export interface ScanRow {
  ticker: string;
  crypto: boolean;
  name: string;
  price: number;
  changePct: number;
  perf20d: number;
  score: number;
  signal: string;
  rsi: number;
  adx: number | null;
  details: string[];
  spark: number[];
}

async function scanOne(ticker: string, weights?: SignalWeights): Promise<ScanRow | null> {
  try {
    const chart = await fetchChart(ticker, "1d", 180);
    const r = chart?.chart?.result?.[0];
    const q = r?.indicators?.quote?.[0] ?? {};
    const bars = (r?.timestamp ?? [])
      .map((_: number, i: number) => ({ h: q.high?.[i], l: q.low?.[i], c: q.close?.[i], v: q.volume?.[i] ?? 0 }))
      .filter((b: { c: number; h: number; l: number }) => b.c && b.h && b.l);
    if (bars.length < 60) return null;
    const closes = bars.map((b: { c: number }) => b.c);
    const ind = computeIndicators(closes, bars.map((b: { h: number }) => b.h), bars.map((b: { l: number }) => b.l), bars.map((b: { v: number }) => b.v), [], [], weights);
    if (!ind) return null;
    const n = closes.length;
    const price = r.meta?.regularMarketPrice ?? closes[n - 1];
    return {
      ticker,
      crypto: ticker.endsWith("-USD"),
      name: r.meta?.shortName ?? ticker,
      price,
      changePct: Math.round(((price - closes[n - 2]) / closes[n - 2]) * 10000) / 100,
      perf20d: Math.round(((closes[n - 1] - closes[n - 21]) / closes[n - 21]) * 1000) / 10,
      score: ind.confluence.score,
      signal: ind.confluence.signal,
      rsi: ind.rsi,
      adx: ind.adx,
      details: ind.confluence.details,
      spark: closes.slice(-30).map((c: number) => Math.round(c * 100) / 100),
    };
  } catch {
    return null;
  }
}

export async function runScan() {
  const all = [...US, ...CRYPTO];
  const weights = (await getCalibration())?.weights;
  const rows: ScanRow[] = [];
  for (let i = 0; i < all.length; i += 6) {
    const res = await Promise.all(all.slice(i, i + 6).map((t) => scanOne(t, weights)));
    rows.push(...res.filter((x): x is ScanRow => x != null));
  }
  rows.sort((a, b) => b.score - a.score || (b.adx ?? 0) - (a.adx ?? 0));
  return { scanned: all.length, rows };
}
