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

async function fetchFundamentals(ticker: string) {
  try {
    const modules = "recommendationTrend,financialData,defaultKeyStatistics,earningsTrend";
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=${modules}`;
    const res = await fetch(url, { headers: YF_HEADERS, next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.quoteSummary?.result?.[0] ?? null;
  } catch { return null; }
}

async function fetchFearGreed() {
  try {
    const res = await fetch("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const score = json?.fear_and_greed?.score;
    const rating = json?.fear_and_greed?.rating;
    return score ? { score: Math.round(score), rating } : null;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  const isCrypto = req.nextUrl.searchParams.get("crypto") === "true";

  if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });

  try {
    const ticker = isCrypto ? `${symbol.toUpperCase()}-USD` : symbol.toUpperCase();

    const [chartData, fundamentals, fearGreed] = await Promise.all([
      fetchYahoo(ticker),
      isCrypto ? null : fetchFundamentals(ticker),
      fetchFearGreed(),
    ]);

    const result = chartData?.chart?.result?.[0];
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
    const volumes = candles.map((c) => c.volume as number);
    const indicators = computeIndicators(closes, volumes);

    const high52w = meta.fiftyTwoWeekHigh ?? Math.max(...closes);
    const low52w = meta.fiftyTwoWeekLow ?? Math.min(...closes);
    const price = meta.regularMarketPrice ?? closes[closes.length - 1];
    const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? closes[closes.length - 2];
    const change = prevClose ? price - prevClose : 0;
    const changePct = prevClose ? (change / prevClose) * 100 : 0;

    // Analyst data
    let analystData = null;
    if (fundamentals) {
      const rec = fundamentals.recommendationTrend?.trend?.[0];
      const fin = fundamentals.financialData;
      const stats = fundamentals.defaultKeyStatistics;
      const earn = fundamentals.earningsTrend?.trend?.[0];

      analystData = {
        recommendation: fin?.recommendationKey ?? null,
        targetPrice: fin?.targetMeanPrice?.raw ?? null,
        targetLow: fin?.targetLowPrice?.raw ?? null,
        targetHigh: fin?.targetHighPrice?.raw ?? null,
        analystCount: fin?.numberOfAnalystOpinions?.raw ?? null,
        strongBuy: rec?.strongBuy ?? null,
        buy: rec?.buy ?? null,
        hold: rec?.hold ?? null,
        sell: rec?.sell ?? null,
        strongSell: rec?.strongSell ?? null,
        peRatio: stats?.trailingPE?.raw ?? null,
        forwardPE: stats?.forwardPE?.raw ?? null,
        eps: stats?.trailingEps?.raw ?? null,
        epsNextQuarter: earn?.earningsEstimate?.avg?.raw ?? null,
        revenueGrowth: fin?.revenueGrowth?.raw ?? null,
        profitMargin: fin?.profitMargins?.raw ?? null,
      };
    }

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
      analystData,
      fearGreed,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to fetch data";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function computeIndicators(closes: number[], volumes: number[]) {
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

  // Volume analysis
  const avgVol = avg(volumes.slice(n - 20));
  const currentVol = volumes[n - 1];
  const volRatio = avgVol > 0 ? currentVol / avgVol : 1;

  return {
    rsi: rsi[rsi.length - 1],
    macd: { macd: macdCurrent, signal: signalCurrent, histogram: macdCurrent - signalCurrent },
    bb: { upper: bb.upper, middle: bb.middle, lower: bb.lower },
    ma20,
    ma50,
    support: [recentLow, pivot - (recentHigh - recentLow) * 0.382],
    resistance: [recentHigh, pivot + (recentHigh - recentLow) * 0.382],
    volumeRatio: Math.round(volRatio * 100) / 100,
    avgVolume20d: Math.round(avgVol),
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
