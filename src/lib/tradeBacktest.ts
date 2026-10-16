import { sql } from "@/lib/db";
import { fetchChart, dayKey } from "@/lib/yahoo";
import { computeIndicators } from "@/lib/indicators";
import { getCalibration } from "@/lib/calibrate";
import { US, CRYPTO } from "@/lib/screener";

export const RR = 1.5;
const HOLD = 10;
const MIN_TRADES = 150;
export const SCORE_LEVELS = [1, 2, 3, 4];
export const REGIMES = ["none", "spy_ma50", "spy_ma20"] as const;
export const STOP_ATRS = [1.5, 2, 2.5];
export type Regime = (typeof REGIMES)[number];

export interface ConfigResult {
  minScore: number;
  regime: Regime;
  stopAtr: number;
  trades: number;
  winRate: number;
  avgPct: number;
  avgR: number;
}

export interface TradeBacktest {
  configs: ConfigResult[];
  best: ConfigResult | null;
  bestWithoutMarket: ConfigResult | null;
  baseline: ConfigResult | null;
  symbols: number;
  minTrades: number;
  holdDays: number;
  rr: number;
}

interface Bar { t: number; h: number; l: number; c: number; v: number }
interface Candidate { i: number; score: number; atr: number; ma20ok: boolean; ma50ok: boolean }

async function history(ticker: string): Promise<Bar[]> {
  try {
    const r = (await fetchChart(ticker, "1d", 760))?.chart?.result?.[0];
    const q = r?.indicators?.quote?.[0] ?? {};
    return (r?.timestamp ?? [])
      .map((t: number, i: number) => ({ t, h: q.high?.[i], l: q.low?.[i], c: q.close?.[i], v: q.volume?.[i] ?? 0 }))
      .filter((b: Bar) => b.c && b.h && b.l);
  } catch {
    return [];
  }
}

// S&P 500 vs its 20/50-day averages by calendar day; weekend days (for coins) use the last trading day.
function marketByDay(spy: Bar[]) {
  const m = new Map<string, { ma20ok: boolean; ma50ok: boolean }>();
  for (let i = 50; i < spy.length; i++) {
    const avg = (n: number) => spy.slice(i - n + 1, i + 1).reduce((a, b) => a + b.c, 0) / n;
    m.set(dayKey(spy[i].t), { ma20ok: spy[i].c > avg(20), ma50ok: spy[i].c > avg(50) });
  }
  const keys = [...m.keys()].sort();
  return (t: number) => {
    const k = dayKey(t);
    if (m.has(k)) return m.get(k)!;
    const prev = keys.filter((x) => x < k).at(-1);
    return prev ? m.get(prev)! : null;
  };
}

// Plays one trade from a signal day's close: stop k×ATR below, target RR×k×ATR above, at most HOLD sessions.
// A bar touching both counts as a loss. Returns the result in R (multiples of the risk) and the exit index.
function play(bars: Bar[], c: Candidate, k: number) {
  const entry = bars[c.i].c, risk = k * c.atr, stop = entry - risk, target = entry + RR * risk;
  for (let j = c.i + 1; j <= Math.min(c.i + HOLD, bars.length - 1); j++) {
    if (bars[j].l <= stop) return { r: -1, pct: (-risk / entry) * 100, exit: j };
    if (bars[j].h >= target) return { r: RR, pct: ((RR * risk) / entry) * 100, exit: j };
  }
  const j = Math.min(c.i + HOLD, bars.length - 1);
  return { r: (bars[j].c - entry) / risk, pct: ((bars[j].c - entry) / entry) * 100, exit: j };
}

export async function runTradeBacktest(): Promise<TradeBacktest> {
  const weights = (await getCalibration())?.weights;
  const spy = await history("SPY");
  const market = marketByDay(spy);
  const tickers = [...US, ...CRYPTO];
  const perSymbol: { bars: Bar[]; cands: Candidate[] }[] = [];

  for (let i = 0; i < tickers.length; i += 6) {
    const series = await Promise.all(tickers.slice(i, i + 6).map(history));
    for (const bars of series) {
      if (bars.length < 200) continue;
      const cands: Candidate[] = [];
      for (let t = 130; t < bars.length - HOLD; t++) {
        const w = bars.slice(t - 129, t + 1);
        const cs = w.map((b) => b.c);
        const weekly: number[] = [];
        for (let k = cs.length - 1; k >= 0; k -= 5) weekly.unshift(cs[k]);
        const ind = computeIndicators(cs, w.map((b) => b.h), w.map((b) => b.l), w.map((b) => b.v), weekly, [], weights);
        if (!ind || ind.confluence.score < SCORE_LEVELS[0] || !(ind.atr > 0)) continue;
        const mk = market(bars[t].t);
        if (!mk) continue;
        cands.push({ i: t, score: ind.confluence.score, atr: ind.atr, ...mk });
      }
      perSymbol.push({ bars, cands });
    }
  }

  const configs: ConfigResult[] = [];
  for (const minScore of SCORE_LEVELS) for (const regime of REGIMES) for (const stopAtr of STOP_ATRS) {
    let n = 0, wins = 0, sumPct = 0, sumR = 0;
    for (const { bars, cands } of perSymbol) {
      let busyUntil = -1;
      for (const c of cands) {
        if (c.i <= busyUntil || c.score < minScore) continue;
        if (regime === "spy_ma50" && !c.ma50ok) continue;
        if (regime === "spy_ma20" && !c.ma20ok) continue;
        const res = play(bars, c, stopAtr);
        busyUntil = res.exit;
        n++; sumPct += res.pct; sumR += res.r;
        if (res.r > 0) wins++;
      }
    }
    if (n) configs.push({
      minScore, regime, stopAtr, trades: n,
      winRate: Math.round((wins / n) * 1000) / 10,
      avgPct: Math.round((sumPct / n) * 100) / 100,
      avgR: Math.round((sumR / n) * 100) / 100,
    });
  }

  const eligible = configs.filter((c) => c.trades >= MIN_TRADES);
  const pick = (list: ConfigResult[]) => list.reduce<ConfigResult | null>((b, c) => (!b || c.avgPct > b.avgPct ? c : b), null);
  const best = pick(eligible);
  return {
    configs,
    best,
    bestWithoutMarket: best ? configs.find((c) => c.minScore === best.minScore && c.stopAtr === best.stopAtr && c.regime === "none") ?? null : null,
    baseline: configs.find((c) => c.minScore === 1 && c.regime === "none" && c.stopAtr === 1.5) ?? null,
    symbols: perSymbol.length,
    minTrades: MIN_TRADES,
    holdDays: HOLD,
    rr: RR,
  };
}

let cached: { at: number; value: TradeBacktest | null } | null = null;

export async function getTradeBacktest(): Promise<TradeBacktest | null> {
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.value;
  try {
    const rows = await sql`SELECT result FROM analysis_cache WHERE type = 'trade_backtest' ORDER BY created_at DESC LIMIT 1`;
    cached = { at: Date.now(), value: (rows[0]?.result as TradeBacktest) ?? null };
  } catch {
    cached = { at: Date.now(), value: null };
  }
  return cached.value;
}

export async function saveTradeBacktest() {
  const result = await runTradeBacktest();
  await sql`INSERT INTO analysis_cache (symbol, type, result) VALUES ('BACKTEST', 'trade_backtest', ${JSON.stringify(result)}::jsonb)`;
  cached = null;
  return result;
}
