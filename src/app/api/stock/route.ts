import { NextRequest, NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  const isCrypto = req.nextUrl.searchParams.get("crypto") === "true";

  if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });

  try {
    const ticker = isCrypto ? `${symbol.toUpperCase()}-USD` : symbol.toUpperCase();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [quote, historical]: [any, any] = await Promise.all([
      yahooFinance.quote(ticker),
      yahooFinance.chart(ticker, {
        period1: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        period2: new Date(),
        interval: "1d",
      }),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quotes = (historical as any).quotes ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candles = quotes
      .filter((q: any) => q.open && q.high && q.low && q.close)
      .map((q: any) => ({
        time: Math.floor(new Date(q.date).getTime() / 1000),
        open: q.open,
        high: q.high,
        low: q.low,
        close: q.close,
        volume: q.volume ?? 0,
      }));

    // Compute indicators from closes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const closes = candles.map((c: any) => c.close as number);
    const indicators = computeIndicators(closes);

    return NextResponse.json({
      symbol: ticker,
      name: quote.longName ?? quote.shortName ?? ticker,
      price: quote.regularMarketPrice,
      change: quote.regularMarketChange,
      changePct: quote.regularMarketChangePercent,
      volume: quote.regularMarketVolume,
      marketCap: quote.marketCap,
      high52w: quote.fiftyTwoWeekHigh,
      low52w: quote.fiftyTwoWeekLow,
      candles,
      indicators,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to fetch data";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function computeIndicators(closes: number[]) {
  const n = closes.length;
  if (n < 26) return null;

  // RSI(14)
  const rsi = computeRSI(closes, 14);

  // MACD (12,26,9)
  const ema12 = computeEMA(closes, 12);
  const ema26 = computeEMA(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = computeEMA(macdLine.slice(25), 9);
  const macdCurrent = macdLine[n - 1];
  const signalCurrent = signalLine[signalLine.length - 1];
  const histogram = macdCurrent - signalCurrent;

  // Bollinger Bands (20, 2)
  const bb = computeBB(closes, 20, 2);

  // MA20, MA50
  const ma20 = avg(closes.slice(n - 20));
  const ma50 = n >= 50 ? avg(closes.slice(n - 50)) : null;

  // Support/Resistance (simple pivot)
  const recentHigh = Math.max(...closes.slice(n - 20));
  const recentLow = Math.min(...closes.slice(n - 20));
  const pivot = (recentHigh + recentLow + closes[n - 1]) / 3;

  return {
    rsi: rsi[rsi.length - 1],
    macd: { macd: macdCurrent, signal: signalCurrent, histogram },
    bb: { upper: bb.upper, middle: bb.middle, lower: bb.lower },
    ma20,
    ma50,
    support: [recentLow, pivot - (recentHigh - recentLow) * 0.382],
    resistance: [recentHigh, pivot + (recentHigh - recentLow) * 0.382],
  };
}

function avg(arr: number[]) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function computeEMA(data: number[], period: number): number[] {
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

function computeRSI(data: number[], period: number): number[] {
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

function computeBB(data: number[], period: number, mult: number) {
  const slice = data.slice(data.length - period);
  const middle = avg(slice);
  const variance = slice.reduce((s, v) => s + (v - middle) ** 2, 0) / period;
  const std = Math.sqrt(variance);
  return { upper: middle + mult * std, middle, lower: middle - mult * std };
}
