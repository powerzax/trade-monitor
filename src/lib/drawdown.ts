export interface Snapshot { date: string; value: number; cost: number }
export interface Flow { date: string; amount: number }

// Time-weighted drawdown: each day's return strips out money added (buys) or taken out (sales) since the
// previous snapshot, so topping up or selling never reads as a gain or a loss. Returns the worst
// peak-to-trough fall of the chained return index, in percent.
export function maxDrawdownPct(snaps: Snapshot[], flows: Flow[]) {
  const sorted = [...snaps].sort((a, b) => a.date.localeCompare(b.date));
  let index = 1, peak = 1, worst = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1], cur = sorted[i];
    if (!(prev.value > 0)) continue;
    const net = flows.filter((f) => f.date > prev.date && f.date <= cur.date).reduce((a, f) => a + f.amount, 0);
    index *= (cur.value - net) / prev.value;
    peak = Math.max(peak, index);
    worst = Math.max(worst, 1 - index / peak);
  }
  return Math.round(worst * 1000) / 10;
}
