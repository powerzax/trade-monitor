import { NextRequest, NextResponse } from "next/server";
import { fetchChart, fetchQuoteSummary, fetchMarketRegime, dayKey } from "@/lib/yahoo";
import { computeIndicators, computeProjection } from "@/lib/indicators";

async function fetchYahoo(ticker: string, interval = "1d", days = 180) {
  return fetchChart(ticker, interval, days);
}

async function fetchFundamentals(ticker: string) {
  return fetchQuoteSummary(ticker, "recommendationTrend,financialData,defaultKeyStatistics,earningsTrend,calendarEvents");
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

    const [chartData, weeklyData, fundamentals, fearGreed, regime] = await Promise.all([
      fetchYahoo(ticker, "1d", 180),
      fetchYahoo(ticker, "1wk", 365).catch(() => null),
      isCrypto ? null : fetchFundamentals(ticker),
      fetchFearGreed(),
      fetchMarketRegime(),
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
    const highs = candles.map((c) => c.high as number);
    const lows = candles.map((c) => c.low as number);
    const volumes = candles.map((c) => c.volume as number);

    // Weekly data
    const weeklyResult = weeklyData?.chart?.result?.[0];
    const weeklyCandles = weeklyResult ? (() => {
      const wts: number[] = weeklyResult.timestamp ?? [];
      const wq = weeklyResult.indicators?.quote?.[0] ?? {};
      return wts.map((t: number, i: number) => ({
        time: t, open: wq.open?.[i], high: wq.high?.[i],
        low: wq.low?.[i], close: wq.close?.[i], volume: wq.volume?.[i] ?? 0,
      })).filter((c) => c.open && c.close);
    })() : [];
    const weeklyCloses = weeklyCandles.map((c) => c.close as number);
    const weeklyVolumes = weeklyCandles.map((c) => c.volume as number);

    const indicators = computeIndicators(closes, highs, lows, volumes, weeklyCloses, weeklyVolumes);

    const high52w = meta.fiftyTwoWeekHigh ?? Math.max(...closes);
    const low52w = meta.fiftyTwoWeekLow ?? Math.min(...closes);
    const price = meta.regularMarketPrice ?? closes[closes.length - 1];
    const prevClose = closes[closes.length - 2];
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

    // Beta vs S&P 500 from overlapping daily log returns
    let beta: number | null = null;
    {
      const xs: number[] = [], ys: number[] = [];
      for (let i = 1; i < candles.length; i++) {
        const m = regime.spyReturns.get(dayKey(candles[i].time));
        if (m === undefined) continue;
        xs.push(m);
        ys.push(Math.log((candles[i].close as number) / (candles[i - 1].close as number)));
      }
      if (xs.length >= 40) {
        const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
        const my = ys.reduce((a, b) => a + b, 0) / ys.length;
        let cov = 0, vx = 0;
        for (let i = 0; i < xs.length; i++) { cov += (xs[i] - mx) * (ys[i] - my); vx += (xs[i] - mx) ** 2; }
        beta = vx ? Math.round((cov / vx) * 100) / 100 : null;
      }
    }

    const earnTs: number | undefined = fundamentals?.calendarEvents?.earnings?.earningsDate?.[0]?.raw;
    const earnings = earnTs && earnTs * 1000 > Date.now() - 86400000
      ? { date: new Date(earnTs * 1000).toISOString().slice(0, 10), daysUntil: Math.ceil((earnTs * 1000 - Date.now()) / 86400000) }
      : null;

    const projection = computeProjection(
      candles.map((c) => ({ time: c.time, close: c.close as number })),
      indicators?.confluence?.score ?? 0,
      regime.regime,
      beta ?? 1,
      isCrypto,
      earnTs ?? null,
    );

    return NextResponse.json({
      beta,
      earnings,
      projection,
      market: { spy: regime.spy, qqq: regime.qqq, vix: regime.vix, regime: regime.regime },
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

