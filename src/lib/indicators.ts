export type SignalKey =
  | "rsi_oversold" | "rsi_overbought" | "macd_rising" | "macd_falling" | "macd_cross_up" | "macd_cross_down"
  | "above_ma20" | "below_ma20" | "above_ma50" | "below_ma50" | "near_support" | "near_resistance"
  | "volume_bullish" | "volume_bearish" | "weekly_bull" | "weekly_bear"
  | "supertrend_up" | "supertrend_down" | "money_in" | "money_out"
  | "mfi_low" | "mfi_high" | "stochrsi_low" | "stochrsi_high";

export type SignalWeights = Partial<Record<SignalKey, number>>;

export function computeIndicators(
  closes: number[], highs: number[], lows: number[], volumes: number[],
  weeklyCloses: number[], weeklyVolumes: number[], weights?: SignalWeights
) {
  const n = closes.length;
  if (n < 26) return null;

  // --- RSI ---
  const rsiArr = computeRSI(closes, 14);
  const rsi = rsiArr[rsiArr.length - 1];
  const rsiPrev = rsiArr[rsiArr.length - 2] ?? rsi;

  // --- MACD ---
  const ema12 = computeEMA(closes, 12);
  const ema26 = computeEMA(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = computeEMA(macdLine.slice(25), 9);
  const macdCurrent = macdLine[n - 1];
  const macdPrev = macdLine[n - 2];
  const signalCurrent = signalLine[signalLine.length - 1];
  const histCurrent = macdCurrent - signalCurrent;
  const histPrev = macdPrev - signalLine[signalLine.length - 2];

  // --- Bollinger Bands ---
  const bb = computeBB(closes, 20, 2);
  const bbWidth = (bb.upper - bb.lower) / bb.middle; // squeeze indicator

  // --- Moving Averages ---
  const ma20 = avg(closes.slice(n - 20));
  const ma50 = n >= 50 ? avg(closes.slice(n - 50)) : null;
  const ma100 = n >= 100 ? avg(closes.slice(n - 100)) : null;
  const ma200 = n >= 200 ? avg(closes.slice(n - 200)) : null;
  const price = closes[n - 1];

  // EMA slope (trend strength proxy): compare EMA20 now vs 5 days ago
  const ema20 = computeEMA(closes, 20);
  const ema20Slope = ema20.length >= 6
    ? (ema20[ema20.length - 1] - ema20[ema20.length - 6]) / ema20[ema20.length - 6] * 100
    : 0;

  // --- ADX (trend strength) ---
  const adx = n >= 28 ? computeADX(highs, lows, closes, 14) : null;

  // --- Proper Swing S/R ---
  const { support, resistance } = computeSwingSR(highs, lows, closes, 5);

  // --- Volume Analysis ---
  const avgVol20 = avg(volumes.slice(n - 20));
  const volRatio = avgVol20 > 0 ? volumes[n - 1] / avgVol20 : 1;
  // Bullish volume: price up + vol above avg OR price down + vol below avg
  const priceChange = closes[n - 1] - closes[n - 2];
  const volPattern: "bullish" | "bearish" | "neutral" =
    priceChange > 0 && volRatio > 1.2 ? "bullish" :
    priceChange < 0 && volRatio > 1.2 ? "bearish" :
    priceChange > 0 && volRatio < 0.8 ? "weak_bullish" as "neutral" :
    "neutral";

  // --- Weekly Trend ---
  let weeklyTrend: "bullish" | "bearish" | "neutral" = "neutral";
  let weeklyRsi: number | null = null;
  if (weeklyCloses.length >= 20) {
    const wMa20 = avg(weeklyCloses.slice(-20));
    const wPrice = weeklyCloses[weeklyCloses.length - 1];
    const wRsiArr = computeRSI(weeklyCloses, 14);
    weeklyRsi = Math.round(wRsiArr[wRsiArr.length - 1] * 10) / 10;
    weeklyTrend = wPrice > wMa20 ? "bullish" : "bearish";
  }
  const weeklyAvgVol = weeklyVolumes.length >= 10 ? avg(weeklyVolumes.slice(-10)) : null;
  const weeklyVolRatio = weeklyAvgVol && weeklyVolumes.length
    ? weeklyVolumes[weeklyVolumes.length - 1] / weeklyAvgVol : null;

  // --- ATR / Supertrend / money flow / StochRSI ---
  const atrArr = computeATR(highs, lows, closes, 14);
  const atr = atrArr[atrArr.length - 1];
  const atrPct = (atr / price) * 100;
  const atrHist = atrArr.slice(-100).map((a, i, arr) => (a / closes[n - arr.length + i]) * 100).sort((a, b) => a - b);
  const atrMedianPct = atrHist[Math.floor(atrHist.length / 2)] ?? atrPct;
  const st = computeSupertrend(highs, lows, closes, 10, 3);
  const stDir = st.dir[n - 1];
  let stDays = 0;
  for (let i = n - 1; i >= 0 && st.dir[i] === stDir; i--) stDays++;
  const obv = computeOBV(closes, volumes);
  const obvMa = avg(obv.slice(-20));
  const obvSlope = obv[n - 1] - obv[Math.max(0, n - 11)];
  const moneyFlow: "in" | "out" | "neutral" = obv[n - 1] > obvMa && obvSlope > 0 ? "in" : obv[n - 1] < obvMa && obvSlope < 0 ? "out" : "neutral";
  const mfi = computeMFI(highs, lows, closes, volumes, 14);
  const stoch = computeStochRSI(closes, 14, 14, 3);
  const stochK = stoch.k[stoch.k.length - 1] ?? 50;
  const stochPrev = stoch.k[stoch.k.length - 2] ?? stochK;

  // --- Confluence: each signal votes ±1, scaled by its backtested weight ---
  const signals: { key: SignalKey; dir: 1 | -1; label: string }[] = [];
  const add = (key: SignalKey, dir: 1 | -1, label: string) => signals.push({ key, dir, label });

  if (rsi < 40) add("rsi_oversold", 1, `RSI ${rsi.toFixed(0)} oversold`);
  else if (rsi > 65) add("rsi_overbought", -1, `RSI ${rsi.toFixed(0)} overbought`);

  if (histCurrent > 0 && histCurrent > histPrev) add("macd_rising", 1, "MACD hist rising");
  else if (histCurrent < 0 && histCurrent < histPrev) add("macd_falling", -1, "MACD hist falling");

  if (macdCurrent > signalCurrent && macdPrev <= signalLine[signalLine.length - 2]) add("macd_cross_up", 1, "MACD crossover bullish");
  else if (macdCurrent < signalCurrent && macdPrev >= signalLine[signalLine.length - 2]) add("macd_cross_down", -1, "MACD crossover bearish");

  if (price > ma20) add("above_ma20", 1, "Above MA20"); else add("below_ma20", -1, "Below MA20");
  if (ma50) { if (price > ma50) add("above_ma50", 1, "Above MA50"); else add("below_ma50", -1, "Below MA50"); }

  const nearestSupport = support[0];
  const nearestResist = resistance[0];
  if (nearestSupport && price <= nearestSupport * 1.03) add("near_support", 1, "Near support");
  if (nearestResist && price >= nearestResist * 0.97) add("near_resistance", -1, "Near resistance");

  if (volPattern === "bullish") add("volume_bullish", 1, "Bullish volume");
  else if (volPattern === "bearish") add("volume_bearish", -1, "Bearish volume");

  if (weeklyTrend === "bullish") add("weekly_bull", 1, "Weekly trend bullish");
  else if (weeklyTrend === "bearish") add("weekly_bear", -1, "Weekly trend bearish");

  if (stDir === 1) add("supertrend_up", 1, "Supertrend ขาขึ้น"); else add("supertrend_down", -1, "Supertrend ขาลง");
  if (moneyFlow === "in") add("money_in", 1, "เงินไหลเข้า (OBV)"); else if (moneyFlow === "out") add("money_out", -1, "เงินไหลออก (OBV)");
  if (mfi != null && mfi < 25) add("mfi_low", 1, `MFI ${mfi.toFixed(0)} ต่ำ`); else if (mfi != null && mfi > 75) add("mfi_high", -1, `MFI ${mfi.toFixed(0)} สูง`);
  if (stochK < 20 && stochK > stochPrev) add("stochrsi_low", 1, "StochRSI กลับตัวจากโซนต่ำ");
  else if (stochK > 80 && stochK < stochPrev) add("stochrsi_high", -1, "StochRSI กลับตัวจากโซนสูง");

  const weighted = signals.map((x) => ({ ...x, weight: weights?.[x.key] ?? 1 }));
  const confluence = weighted.reduce((a, x) => a + x.dir * x.weight, 0) + (rsi > rsiPrev ? 0.5 : -0.5);
  const confluenceDetails = weighted
    .filter((x) => x.weight > 0.05)
    .map((x) => `${x.label} ${x.dir > 0 ? "+" : "-"}${x.weight === 1 ? "1" : x.weight.toFixed(1)}`);

  // ADX trend strength
  const trendStrength = adx
    ? adx >= 40 ? "strong" : adx >= 25 ? "moderate" : "weak"
    : "unknown";

  const confluenceScore = Math.round(Math.max(-7, Math.min(7, confluence)));
  const confluenceSignal: "strong_buy" | "buy" | "neutral" | "sell" | "strong_sell" =
    confluenceScore >= 4 ? "strong_buy" :
    confluenceScore >= 2 ? "buy" :
    confluenceScore <= -4 ? "strong_sell" :
    confluenceScore <= -2 ? "sell" : "neutral";

  return {
    rsi: Math.round(rsi * 10) / 10,
    rsiDirection: rsi > rsiPrev ? "rising" : "falling",
    macd: { macd: macdCurrent, signal: signalCurrent, histogram: histCurrent },
    bb: { upper: bb.upper, middle: bb.middle, lower: bb.lower, width: Math.round(bbWidth * 1000) / 10 },
    ma20,
    ma50,
    ma100,
    ma200,
    ema20Slope: Math.round(ema20Slope * 100) / 100,
    support,
    resistance,
    volumeRatio: Math.round(volRatio * 100) / 100,
    avgVolume20d: Math.round(avgVol20),
    volumePattern: volPattern,
    adx: adx ? Math.round(adx * 10) / 10 : null,
    trendStrength,
    weekly: { trend: weeklyTrend, rsi: weeklyRsi, volRatio: weeklyVolRatio ? Math.round(weeklyVolRatio * 100) / 100 : null },
    atr: Math.round(atr * 100) / 100,
    atrPct: Math.round(atrPct * 100) / 100,
    supertrend: { dir: stDir, days: stDays, line: Math.round(st.line[n - 1] * 100) / 100 },
    moneyFlow,
    mfi: mfi != null ? Math.round(mfi * 10) / 10 : null,
    stochRsi: Math.round(stochK * 10) / 10,
    stopZone: { upper: Math.round((price - 1.5 * atr) * 100) / 100, lower: Math.round((price - 2.5 * atr) * 100) / 100 },
    plain: {
      trend: { state: stDir === 1 ? "up" : "down", days: stDays },
      flow: moneyFlow,
      timing: stochK < 20 || rsi < 35 ? "good" : stochK > 80 || rsi > 68 ? "hot" : stochK < 50 && stochK > stochPrev ? "ok" : "wait",
      volatility: { level: atrPct > atrMedianPct * 1.3 ? "high" : atrPct < atrMedianPct * 0.75 ? "low" : "normal", atr: Math.round(atr * 100) / 100, stopDistance: Math.round(1.5 * atr * 100) / 100 },
    },
    confluence: { score: confluenceScore, signal: confluenceSignal, details: confluenceDetails, signals: weighted.map(({ key, dir, weight }) => ({ key, dir, weight })) },
  };
}

// Swing high/low based Support & Resistance
export function computeSwingSR(highs: number[], lows: number[], closes: number[], lookback = 5) {
  const n = highs.length;
  const swingHighs: number[] = [];
  const swingLows: number[] = [];

  for (let i = lookback; i < n - lookback; i++) {
    const h = highs[i];
    const l = lows[i];
    if (highs.slice(i - lookback, i).every(v => v <= h) && highs.slice(i + 1, i + lookback + 1).every(v => v <= h)) {
      swingHighs.push(h);
    }
    if (lows.slice(i - lookback, i).every(v => v >= l) && lows.slice(i + 1, i + lookback + 1).every(v => v >= l)) {
      swingLows.push(l);
    }
  }

  const price = closes[n - 1];
  // Support: swing lows below current price, sorted descending (closest first)
  const support = swingLows
    .filter(v => v < price)
    .sort((a, b) => b - a)
    .slice(0, 3);

  // Resistance: swing highs above current price, sorted ascending (closest first)
  const resistance = swingHighs
    .filter(v => v > price)
    .sort((a, b) => a - b)
    .slice(0, 3);

  // Fallback if not enough swing points
  if (support.length === 0) support.push(Math.min(...lows.slice(n - 20)));
  if (resistance.length === 0) resistance.push(Math.max(...highs.slice(n - 20)));

  return { support, resistance };
}

// ADX (Average Directional Index) — measures trend strength 0-100
export function computeADX(highs: number[], lows: number[], closes: number[], period = 14): number {
  const n = highs.length;
  const trArr: number[] = [];
  const dmPlusArr: number[] = [];
  const dmMinusArr: number[] = [];

  for (let i = 1; i < n; i++) {
    const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
    const dmPlus = highs[i] - highs[i - 1] > lows[i - 1] - lows[i] ? Math.max(highs[i] - highs[i - 1], 0) : 0;
    const dmMinus = lows[i - 1] - lows[i] > highs[i] - highs[i - 1] ? Math.max(lows[i - 1] - lows[i], 0) : 0;
    trArr.push(tr);
    dmPlusArr.push(dmPlus);
    dmMinusArr.push(dmMinus);
  }

  const smoothTR = computeEMA(trArr, period);
  const smoothPlus = computeEMA(dmPlusArr, period);
  const smoothMinus = computeEMA(dmMinusArr, period);

  const diPlus = smoothPlus.map((v, i) => smoothTR[i] ? (v / smoothTR[i]) * 100 : 0);
  const diMinus = smoothMinus.map((v, i) => smoothTR[i] ? (v / smoothTR[i]) * 100 : 0);
  const dx = diPlus.map((v, i) => {
    const sum = v + diMinus[i];
    return sum ? (Math.abs(v - diMinus[i]) / sum) * 100 : 0;
  });

  const adxArr = computeEMA(dx.slice(period), period);
  return adxArr[adxArr.length - 1];
}

export function avg(arr: number[]) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function computeEMA(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [];
  let ema = avg(data.slice(0, period));
  result.push(...new Array(period - 1).fill(ema));
  result.push(ema);
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

export function computeRSI(data: number[], period: number): number[] {
  const result: number[] = [];
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = data[i] - data[i - 1];
    if (d > 0) avgGain += d; else avgLoss += -d;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period; i < data.length; i++) {
    if (i > period) {
      const d = data[i] - data[i - 1];
      avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
      avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
    }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs));
  }
  return result;
}

export function computeBB(data: number[], period: number, mult: number) {
  const slice = data.slice(data.length - period);
  const middle = avg(slice);
  const variance = slice.reduce((s, v) => s + (v - middle) ** 2, 0) / period;
  return { upper: middle + mult * Math.sqrt(variance), middle, lower: middle - mult * Math.sqrt(variance) };
}

// Probability cone for the next N sessions: lognormal around a small drift that leans with
// the confluence score and the broad-market regime. Earnings add a one-off jump variance.
export function computeProjection(
  pts: { time: number; close: number }[],
  confluence: number,
  regime: "risk_on" | "risk_off" | "neutral",
  beta: number,
  isCrypto: boolean,
  earningsTs: number | null,
  horizon = 10,
) {
  const n = pts.length;
  if (n < 30) return null;
  const rets: number[] = [];
  for (let i = Math.max(1, n - 60); i < n; i++) rets.push(Math.log(pts[i].close / pts[i - 1].close));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sigma = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1));
  const regimeTilt = regime === "risk_on" ? 1 : regime === "risk_off" ? -1 : 0;
  const mu = sigma * (0.12 * (confluence / 7) + 0.04 * regimeTilt * Math.max(0.5, Math.min(beta, 2)));

  const last = pts[n - 1];
  const z = { p10: -1.2816, p25: -0.6745, p75: 0.6745, p90: 1.2816 };
  const points = [{ time: last.time, p10: last.close, p25: last.close, p50: last.close, p75: last.close, p90: last.close }];
  let t = last.time;
  let jumpVar = 0;
  for (let k = 1; k <= horizon; k++) {
    do { t += 86400; } while (!isCrypto && [0, 6].includes(new Date(t * 1000).getUTCDay()));
    if (earningsTs && !jumpVar && t >= earningsTs) jumpVar = (sigma * 2.5) ** 2;
    const sd = Math.sqrt(sigma * sigma * k + jumpVar);
    const center = Math.log(last.close) + mu * k;
    const at = (zz: number) => Math.round(Math.exp(center + zz * sd) * 100) / 100;
    points.push({ time: t, p10: at(z.p10), p25: at(z.p25), p50: at(0), p75: at(z.p75), p90: at(z.p90) });
  }
  return {
    horizon,
    sigmaDaily: Math.round(sigma * 10000) / 100,
    muDaily: Math.round(mu * 10000) / 100,
    earningsInHorizon: jumpVar > 0,
    points,
  };
}

export function computeATR(highs: number[], lows: number[], closes: number[], period = 14): number[] {
  const tr = highs.map((h, i) => i === 0 ? h - lows[i] : Math.max(h - lows[i], Math.abs(h - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  const out: number[] = [];
  let a = avg(tr.slice(0, period));
  for (let i = 0; i < tr.length; i++) {
    if (i >= period) a = (a * (period - 1) + tr[i]) / period;
    out.push(a);
  }
  return out;
}

// Supertrend: an ATR band that flips sides when price closes through it; dir 1 = up, -1 = down.
export function computeSupertrend(highs: number[], lows: number[], closes: number[], period = 10, mult = 3) {
  const atr = computeATR(highs, lows, closes, period);
  const n = closes.length;
  const line: number[] = new Array(n);
  const dir: (1 | -1)[] = new Array(n);
  let upper = 0, lower = 0;
  for (let i = 0; i < n; i++) {
    const mid = (highs[i] + lows[i]) / 2;
    const bu = mid + mult * atr[i], bl = mid - mult * atr[i];
    if (i === 0) { upper = bu; lower = bl; dir[0] = 1; line[0] = bl; continue; }
    upper = bu < upper || closes[i - 1] > upper ? bu : upper;
    lower = bl > lower || closes[i - 1] < lower ? bl : lower;
    dir[i] = dir[i - 1] === 1 ? (closes[i] < lower ? -1 : 1) : (closes[i] > upper ? 1 : -1);
    line[i] = dir[i] === 1 ? lower : upper;
  }
  return { line, dir };
}

export function computeOBV(closes: number[], volumes: number[]): number[] {
  const out = [0];
  for (let i = 1; i < closes.length; i++) out.push(out[i - 1] + (closes[i] > closes[i - 1] ? volumes[i] : closes[i] < closes[i - 1] ? -volumes[i] : 0));
  return out;
}

export function computeMFI(highs: number[], lows: number[], closes: number[], volumes: number[], period = 14): number | null {
  const n = closes.length;
  if (n <= period || volumes.slice(-period).every((v) => !v)) return null;
  let pos = 0, neg = 0;
  for (let i = n - period; i < n; i++) {
    const tp = (highs[i] + lows[i] + closes[i]) / 3, prev = (highs[i - 1] + lows[i - 1] + closes[i - 1]) / 3;
    if (tp > prev) pos += tp * volumes[i]; else if (tp < prev) neg += tp * volumes[i];
  }
  return neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
}

export function computeStochRSI(closes: number[], rsiPeriod = 14, stochPeriod = 14, smooth = 3) {
  const rsi = computeRSI(closes, rsiPeriod);
  const raw: number[] = [];
  for (let i = stochPeriod - 1; i < rsi.length; i++) {
    const w = rsi.slice(i - stochPeriod + 1, i + 1);
    const lo = Math.min(...w), hi = Math.max(...w);
    raw.push(hi === lo ? 50 : ((rsi[i] - lo) / (hi - lo)) * 100);
  }
  const k = raw.map((_, i) => avg(raw.slice(Math.max(0, i - smooth + 1), i + 1)));
  return { k };
}
