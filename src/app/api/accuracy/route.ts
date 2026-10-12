import { NextResponse } from "next/server";
import { sql, initDB } from "@/lib/db";
import { fetchChart, dayKey } from "@/lib/yahoo";

interface Bar { time: number; high: number; low: number; close: number }

interface Outcome {
  symbol: string;
  date: string;
  suggestion: string;
  score: number | null;
  entry: number;
  ret7: number | null;
  ret14: number | null;
  hit: "tp" | "sl" | null;
  correct: boolean | null;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

async function bars(symbol: string): Promise<Bar[]> {
  try {
    const r = (await fetchChart(symbol, "1d", 150))?.chart?.result?.[0];
    const q = r?.indicators?.quote?.[0] ?? {};
    return (r?.timestamp ?? [])
      .map((t: number, i: number) => ({ time: t, high: q.high?.[i], low: q.low?.[i], close: q.close?.[i] }))
      .filter((b: Bar) => b.close && b.high && b.low);
  } catch {
    return [];
  }
}

function evaluate(row: { symbol: string; created_at: string; suggestion: string; score: number | null; tp1: unknown; sl: unknown; p0: unknown }, series: Bar[]): Outcome | null {
  const t0 = new Date(row.created_at).getTime() / 1000;
  const d0 = dayKey(t0);
  const i0 = series.findLastIndex((b) => dayKey(b.time) <= d0);
  if (i0 < 0) return null;
  const entry = num(row.p0) ?? series[i0].close;
  const after = series.slice(i0 + 1);

  const retAt = (days: number) => {
    const limit = t0 + days * 86400;
    if (limit > Date.now() / 1000) return null;
    const b = after.filter((x) => x.time <= limit).at(-1);
    return b ? Math.round(((b.close - entry) / entry) * 1000) / 10 : null;
  };

  const tp1 = num(row.tp1), sl = num(row.sl);
  let hit: Outcome["hit"] = null;
  for (const b of after.filter((x) => x.time <= t0 + 14 * 86400)) {
    const hitSl = sl != null && b.low <= sl;
    const hitTp = tp1 != null && tp1 > entry && b.high >= tp1;
    if (hitSl) { hit = "sl"; break; }
    if (hitTp) { hit = "tp"; break; }
  }

  const ret7 = retAt(7), ret14 = retAt(14);
  const ret = ret14 ?? ret7;
  const correct =
    row.suggestion === "Buy" ? (hit === "tp" ? true : hit === "sl" ? false : ret == null ? null : ret > 0) :
    row.suggestion === "Avoid" ? (ret == null ? null : ret < 0) :
    null;

  return { symbol: row.symbol, date: d0, suggestion: row.suggestion, score: row.score, entry, ret7, ret14, hit, correct };
}

function summarize(list: Outcome[]) {
  const done = list.filter((o) => o.correct != null);
  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null);
    return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
  };
  return {
    count: list.length,
    evaluated: done.length,
    winRate: done.length ? Math.round((done.filter((o) => o.correct).length / done.length) * 100) : null,
    avgRet7: avg(list.map((o) => o.ret7)),
    avgRet14: avg(list.map((o) => o.ret14)),
    tpHits: list.filter((o) => o.hit === "tp").length,
    slHits: list.filter((o) => o.hit === "sl").length,
  };
}

export async function GET() {
  await initDB();
  const rows = await sql`
    SELECT DISTINCT ON (symbol, (created_at AT TIME ZONE 'Asia/Bangkok')::date)
      symbol, created_at, result->>'suggestion' AS suggestion, (result->>'score')::float AS score,
      result->'targets'->>'tp1' AS tp1, result->>'stopLoss' AS sl, result->>'priceAtAnalysis' AS p0
    FROM analysis_cache
    WHERE type = 'symbol' AND created_at > NOW() - INTERVAL '120 days' AND created_at < NOW() - INTERVAL '1 day'
    ORDER BY symbol, (created_at AT TIME ZONE 'Asia/Bangkok')::date, created_at DESC
  `;

  const symbols = [...new Set(rows.map((r) => r.symbol as string))].slice(0, 30);
  const seriesBySymbol = new Map<string, Bar[]>();
  for (let i = 0; i < symbols.length; i += 6) {
    const chunk = symbols.slice(i, i + 6);
    const res = await Promise.all(chunk.map(bars));
    chunk.forEach((s, j) => seriesBySymbol.set(s, res[j]));
  }

  const outcomes = rows
    .filter((r) => seriesBySymbol.has(r.symbol))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((r) => evaluate(r as any, seriesBySymbol.get(r.symbol)!))
    .filter((o): o is Outcome => o != null)
    .sort((a, b) => b.date.localeCompare(a.date));

  const buys = outcomes.filter((o) => o.suggestion === "Buy");
  return NextResponse.json({
    overall: summarize(outcomes.filter((o) => o.suggestion !== "Wait")),
    buy: summarize(buys),
    wait: summarize(outcomes.filter((o) => o.suggestion === "Wait")),
    avoid: summarize(outcomes.filter((o) => o.suggestion === "Avoid")),
    buyHighScore: summarize(buys.filter((o) => (o.score ?? 0) >= 7)),
    buyLowScore: summarize(buys.filter((o) => (o.score ?? 0) < 7)),
    recent: outcomes.slice(0, 40),
  });
}
