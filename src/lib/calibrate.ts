import { sql } from "@/lib/db";
import { fetchChart } from "@/lib/yahoo";
import { computeIndicators, type SignalKey, type SignalWeights } from "@/lib/indicators";
import { US, CRYPTO } from "@/lib/screener";

const HORIZON = 10;

export interface SignalStat { count: number; hitRate: number; avgRet: number; edge: number; weight: number }
export interface Calibration {
  weights: SignalWeights;
  stats: Partial<Record<SignalKey, SignalStat>>;
  baseUp: number;
  samples: number;
  symbols: number;
  horizonDays: number;
}

async function history(ticker: string) {
  try {
    const r = (await fetchChart(ticker, "1d", 760))?.chart?.result?.[0];
    const q = r?.indicators?.quote?.[0] ?? {};
    return (r?.timestamp ?? [])
      .map((_: number, i: number) => ({ h: q.high?.[i], l: q.low?.[i], c: q.close?.[i], v: q.volume?.[i] ?? 0 }))
      .filter((b: { c: number; h: number; l: number }) => b.c && b.h && b.l) as { h: number; l: number; c: number; v: number }[];
  } catch {
    return [];
  }
}

// Replays every symbol day by day: for each signal that fired, did the next 10 sessions move its way?
// A signal's weight grows with its edge over the base rate and shrinks toward 0 when it misleads.
export async function runCalibration(): Promise<Calibration> {
  const tickers = [...US, ...CRYPTO];
  const tally = new Map<SignalKey, { count: number; wins: number; sum: number }>();
  let ups = 0, samples = 0, symbols = 0;

  for (let i = 0; i < tickers.length; i += 6) {
    const series = await Promise.all(tickers.slice(i, i + 6).map(history));
    for (const bars of series) {
      if (bars.length < 200) continue;
      symbols++;
      const c = bars.map((b) => b.c), h = bars.map((b) => b.h), l = bars.map((b) => b.l), v = bars.map((b) => b.v);
      for (let t = 130; t < bars.length - HORIZON; t += 2) {
        const from = t - 129;
        const cs = c.slice(from, t + 1);
        const weekly: number[] = [];
        for (let k = cs.length - 1; k >= 0; k -= 5) weekly.unshift(cs[k]);
        const ind = computeIndicators(cs, h.slice(from, t + 1), l.slice(from, t + 1), v.slice(from, t + 1), weekly, []);
        if (!ind) continue;
        const fwd = c[t + HORIZON] / c[t] - 1;
        samples++;
        if (fwd > 0) ups++;
        for (const s of ind.confluence.signals) {
          const e = tally.get(s.key) ?? { count: 0, wins: 0, sum: 0 };
          e.count++;
          if (s.dir * fwd > 0) e.wins++;
          e.sum += s.dir * fwd;
          tally.set(s.key, e);
        }
      }
    }
  }

  const baseUp = samples ? ups / samples : 0.5;
  const weights: SignalWeights = {};
  const stats: Calibration["stats"] = {};
  for (const [key, e] of tally) {
    const bullish = !/oversold|overbought/.test(key) ? !/falling|down|below|resistance|bearish|bear$/.test(key) : key === "rsi_oversold";
    const hitRate = e.wins / e.count;
    const edge = hitRate - (bullish ? baseUp : 1 - baseUp);
    const weight = e.count < 60 ? 1 : Math.round(Math.max(0, Math.min(2.5, 1 + edge * 10)) * 100) / 100;
    weights[key] = weight;
    stats[key] = { count: e.count, hitRate: Math.round(hitRate * 1000) / 10, avgRet: Math.round((e.sum / e.count) * 10000) / 100, edge: Math.round(edge * 1000) / 10, weight };
  }
  return { weights, stats, baseUp: Math.round(baseUp * 1000) / 10, samples, symbols, horizonDays: HORIZON };
}

let cached: { at: number; value: Calibration | null } | null = null;

export async function getCalibration(): Promise<Calibration | null> {
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.value;
  try {
    const rows = await sql`SELECT result FROM analysis_cache WHERE type = 'weights' ORDER BY created_at DESC LIMIT 1`;
    cached = { at: Date.now(), value: (rows[0]?.result as Calibration) ?? null };
  } catch {
    cached = { at: Date.now(), value: null };
  }
  return cached.value;
}
