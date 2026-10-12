export function computeIndicators(
  closes: number[], highs: number[], lows: number[], volumes: number[],
  weeklyCloses: number[], weeklyVolumes: number[]
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

  // --- Confluence Score (-7 to +7, positive = bullish) ---
  let confluence = 0;
  const confluenceDetails: string[] = [];

  // RSI signal
  if (rsi < 40) { confluence++; confluenceDetails.push(`RSI ${rsi.toFixed(0)} (oversold +1)`); }
  else if (rsi > 65) { confluence--; confluenceDetails.push(`RSI ${rsi.toFixed(0)} (overbought -1)`); }

  // RSI direction
  if (rsi > rsiPrev) { confluence += 0.5; }
  else { confluence -= 0.5; }

  // MACD histogram rising/falling
  if (histCurrent > 0 && histCurrent > histPrev) { confluence++; confluenceDetails.push("MACD hist rising +1"); }
  else if (histCurrent < 0 && histCurrent < histPrev) { confluence--; confluenceDetails.push("MACD hist falling -1"); }

  // MACD crossover
  if (macdCurrent > signalCurrent && macdPrev <= signalLine[signalLine.length - 2]) {
    confluence++; confluenceDetails.push("MACD crossover bullish +1");
  } else if (macdCurrent < signalCurrent && macdPrev >= signalLine[signalLine.length - 2]) {
    confluence--; confluenceDetails.push("MACD crossover bearish -1");
  }

  // Price vs MA20/MA50
  if (price > ma20) { confluence++; confluenceDetails.push("Above MA20 +1"); }
  else { confluence--; confluenceDetails.push("Below MA20 -1"); }
  if (ma50 && price > ma50) { confluence++; confluenceDetails.push("Above MA50 +1"); }
  else if (ma50) { confluence--; }

  // Near support/resistance
  const nearestSupport = support[0];
  const nearestResist = resistance[0];
  if (nearestSupport && price <= nearestSupport * 1.03) {
    confluence++; confluenceDetails.push("Near support +1");
  }
  if (nearestResist && price >= nearestResist * 0.97) {
    confluence--; confluenceDetails.push("Near resistance -1");
  }

  // Volume pattern
  if (volPattern === "bullish") { confluence++; confluenceDetails.push("Bullish volume +1"); }
  else if (volPattern === "bearish") { confluence--; confluenceDetails.push("Bearish volume -1"); }

  // Weekly trend alignment
  if (weeklyTrend === "bullish") { confluence++; confluenceDetails.push("Weekly trend bullish +1"); }
  else if (weeklyTrend === "bearish") { confluence--; confluenceDetails.push("Weekly trend bearish -1"); }

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
    confluence: { score: confluenceScore, signal: confluenceSignal, details: confluenceDetails },
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
