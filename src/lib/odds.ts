// Monte Carlo odds for a trade plan: simulate daily closes from the stock's own drift and volatility
// and count which level is touched first within the horizon. Seeded so the same inputs give the same answer.
export interface TradeOdds {
  pTarget: number;
  pStop: number;
  pOpen: number;
  expectedPct: number;
  horizon: number;
}

export function tradeOdds(entry: number, target: number, stop: number, muDailyPct: number, sigmaDailyPct: number, horizon = 10, paths = 2000): TradeOdds | null {
  if (!(entry > 0) || !(target > entry) || !(stop < entry) || !(stop > 0) || !(sigmaDailyPct > 0)) return null;
  const mu = muDailyPct / 100, sigma = sigmaDailyPct / 100;
  let seed = 1234567;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const normal = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());

  let hitT = 0, hitS = 0, sumRet = 0;
  for (let p = 0; p < paths; p++) {
    let price = entry, outcome = 0;
    for (let d = 0; d < horizon; d++) {
      price *= Math.exp(mu - (sigma * sigma) / 2 + sigma * normal());
      if (price <= stop) { outcome = -1; break; }
      if (price >= target) { outcome = 1; break; }
    }
    if (outcome === 1) { hitT++; sumRet += target / entry - 1; }
    else if (outcome === -1) { hitS++; sumRet += stop / entry - 1; }
    else sumRet += price / entry - 1;
  }
  const r = (x: number) => Math.round(x * 1000) / 10;
  return { pTarget: r(hitT / paths), pStop: r(hitS / paths), pOpen: r(1 - (hitT + hitS) / paths), expectedPct: Math.round((sumRet / paths) * 10000) / 100, horizon };
}
