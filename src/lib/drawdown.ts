export interface Snapshot { date: string; value: number; cost: number; at: string }
export interface Flow { at: string; amount: number }

// Time-weighted drawdown: each day's return strips out money added (buys) or taken out (sales) between the
// two snapshots, so topping up or selling never reads as a gain or a loss. Flows are placed by when they were
// recorded in the app (`at`), not by the trade date the user typed, because a snapshot values exactly the
// positions that existed when it ran. Returns the worst peak-to-trough fall of the chained index, in percent.
export function maxDrawdownPct(snaps: Snapshot[], flows: Flow[]) {
  const sorted = [...snaps].sort((a, b) => a.at.localeCompare(b.at));
  let index = 1, peak = 1, worst = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1], cur = sorted[i];
    if (!(prev.value > 0)) continue;
    const net = flows.filter((f) => f.at > prev.at && f.at <= cur.at).reduce((a, f) => a + f.amount, 0);
    index *= (cur.value - net) / prev.value;
    peak = Math.max(peak, index);
    worst = Math.max(worst, 1 - index / peak);
  }
  return Math.round(worst * 1000) / 10;
}
