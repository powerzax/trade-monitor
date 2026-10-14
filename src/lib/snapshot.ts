import { sql } from "@/lib/db";
import { fetchChart } from "@/lib/yahoo";
import { computeHoldings, type Position } from "@/lib/portfolio";

import type { Snapshot } from "@/lib/drawdown";

const bangkokDate = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

// Values open holdings at the latest price and upserts today's (Bangkok) row. Skips the day if any price is missing,
// so a partial valuation never shows up as a fake drop.
export async function takeSnapshot() {
  const rows = await sql`SELECT id, symbol, crypto, name, price::float AS price, qty::float AS qty, side, to_char(bought_at, 'YYYY-MM-DD') AS bought_at FROM positions`;
  const { open } = computeHoldings(rows as unknown as Position[]);
  if (!open.length) return { saved: false, reason: "no holdings" };

  const prices = await Promise.all(open.map(async (h) => {
    try {
      const r = (await fetchChart(h.symbol, "1d", 10))?.chart?.result?.[0];
      const closes: number[] = (r?.indicators?.quote?.[0]?.close ?? []).filter((c: number | null) => c != null);
      return Number(r?.meta?.regularMarketPrice ?? closes.at(-1)) || null;
    } catch {
      return null;
    }
  }));
  if (prices.some((p) => p == null)) return { saved: false, reason: "missing price" };

  const value = open.reduce((a, h, i) => a + h.qty * prices[i]!, 0);
  const cost = open.reduce((a, h) => a + h.cost, 0);
  const date = bangkokDate();
  await sql`
    INSERT INTO portfolio_snapshots (date, value_usd, cost_usd) VALUES (${date}, ${value}, ${cost})
    ON CONFLICT (date) DO UPDATE SET value_usd = EXCLUDED.value_usd, cost_usd = EXCLUDED.cost_usd, created_at = NOW()
  `;
  return { saved: true, date, value: Math.round(value * 100) / 100, cost: Math.round(cost * 100) / 100 };
}

export async function getSnapshots(days = 365): Promise<Snapshot[]> {
  const rows = await sql`
    SELECT to_char(date, 'YYYY-MM-DD') AS date, value_usd::float AS value, cost_usd::float AS cost,
           to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at
    FROM portfolio_snapshots WHERE date > CURRENT_DATE - ${days}::int ORDER BY date`;
  return rows as Snapshot[];
}
