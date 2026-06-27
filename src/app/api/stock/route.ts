import { NextRequest, NextResponse } from "next/server";

const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  "Accept": "application/json",
};

async function fetchYahoo(ticker: string) {
  const period1 = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);
  const period2 = Math.floor(Date.now() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&period1=${period1}&period2=${period2}&includePrePost=false`;
  const res = await fetch(url, { headers: YF_HEADERS, next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`Yahoo Finance error: ${res.status}`);
  return res.json();
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  const isCrypto = req.nextUrl.searchParams.get("crypto") === "true";

  if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });

  try {
    const ticker = isCrypto ? `${symbol.toUpperCase()}-USD` : symbol.toUpperCase();
    const data = await fetchYahoo(ticker);

    const result = data?.chart?.result?.[0];
    if (!result) throw new Error("No data returned");

    const meta = result.meta;
    const timestamps: number[] = result.timestamp ?? [];
    const ohlcv = result.indicators?.quote?.[0] ?? {};

    const candles = timestamps
      .map((t: number, i: number) => ({
        time: t,
        open: ohlcv.open?.[i],
        high: ohlcv.high?.[i],
        low: ohlcv.low?.[i],
        close: ohlcv.close?.[i],
        volume: ohlcv.volume?.[i] ?? 0,
      }))
      .filter((c) => c.open && c.high && c.low && c.close);

    const closes = candles.map((c) => c.close as number);
    const indicators = computeIndicators(closes);

    // 52-week high/low from meta
    const high52w = meta.fiftyTwoWeekHigh ?? Math.max(...closes);
    const low52w = meta.fiftyTwoWeekLow ?? Math.min(...closes);

    const price = meta.regularMarketPrice ?? closes[closes.length - 1];
    const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? closes[closes.length - 2];
    const change = prevClose ? price - prevClose : 0;
    const changePct = prevClose ? (change / prevClose) * 100 : 0;

    return NextResponse.json({
      symbol: ticker,
      name: meta.longName ?? meta.shortName ?? ticker,
      price,
      change,
      changePct,
      volume: meta.regularMarketVolume,
      marketCap: meta.marketCap,
      high52w,
      low52w,
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

  const rsi = computeRSI(closes, 14);

  const ema12 = computeEMA(closes, 12);
  const ema26 = computeEMA(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = computeEMA(macdLine.slice(25), 9);
  const macdCurrent = macdLine[n - 1];
  const signalCurrent = signalLine[signalLine.length - 1];

  const bb = computeBB(closes, 20, 2);
  const ma20 = avg(closes.slice(n - 20));
  const ma50 = n >= 50 ? avg(closes.slice(n - 50)) : null;

  const recentHigh = Math.max(...closes.slice(n - 20));
  const recentLow = Math.min(...closes.slice(n - 20));
  const pivot = (recentHigh + recentLow + closes[n - 1]) / 3;

  return {
    rsi: rsi[rsi.length - 1],
    macd: { macd: macdCurrent, signal: signalCurrent, histogram: macdCurrent - signalCurrent },
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
  return { upper: middle + mult * Math.sqrt(variance), middle, lower: middle - mult * Math.sqrt(variance) };
}
