import { NextRequest, NextResponse } from "next/server";
import { fetchChart, fetchQuoteSummary, fetchMarketRegime, dayKey, parseCloses } from "@/lib/yahoo";
import { computeIndicators, computeProjection, computeSupertrend } from "@/lib/indicators";
import { getCalibration } from "@/lib/calibrate";
import { getTradeBacktest } from "@/lib/tradeBacktest";

async function fetchYahoo(ticker: string, interval = "1d", days = 180) {
  return fetchChart(ticker, interval, days);
}

async function fetchFundamentals(ticker: string) {
  return fetchQuoteSummary(ticker, "recommendationTrend,financialData,defaultKeyStatistics,earningsTrend,calendarEvents,assetProfile");
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

const SECTOR_ETF: Record<string, [string, string]> = {
  "Technology": ["XLK", "เทคโนโลยี"],
  "Communication Services": ["XLC", "สื่อสาร/อินเทอร์เน็ต"],
  "Consumer Cyclical": ["XLY", "สินค้าฟุ่มเฟือย"],
  "Consumer Defensive": ["XLP", "สินค้าจำเป็น"],
  "Energy": ["XLE", "พลังงาน"],
  "Financial Services": ["XLF", "การเงิน"],
  "Healthcare": ["XLV", "สุขภาพ"],
  "Industrials": ["XLI", "อุตสาหกรรม"],
  "Basic Materials": ["XLB", "วัตถุดิบ"],
  "Real Estate": ["XLRE", "อสังหาฯ"],
  "Utilities": ["XLU", "สาธารณูปโภค"],
};

const pctChange = (c: number[], n: number) => c.length > n ? Math.round(((c[c.length - 1] - c[c.length - 1 - n]) / c[c.length - 1 - n]) * 1000) / 10 : null;

async function sectorStrength(ticker: string, isCrypto: boolean, profile: { sector?: string; industry?: string } | undefined, closes: number[]) {
  let etf: string | null = null, label = "";
  if (isCrypto) {
    if (ticker === "BTC-USD") return null;
    etf = "BTC-USD"; label = "Bitcoin";
  } else if (profile?.industry?.startsWith("Semiconductor")) {
    etf = "SMH"; label = "กลุ่มชิป";
  } else if (profile?.sector && SECTOR_ETF[profile.sector]) {
    [etf, label] = SECTOR_ETF[profile.sector];
    label = `กลุ่ม${label}`;
  }
  if (!etf) return null;
  try {
    const ec = parseCloses(await fetchChart(etf, "1d", 180)).map((p) => p.close);
    const s20 = pctChange(closes, 20), e20 = pctChange(ec, 20), s60 = pctChange(closes, 60), e60 = pctChange(ec, 60);
    return {
      sector: profile?.sector ?? (isCrypto ? "Crypto" : null),
      industry: profile?.industry ?? null,
      etf, label,
      stockPerf20d: s20, sectorPerf20d: e20, rs20: s20 != null && e20 != null ? Math.round((s20 - e20) * 10) / 10 : null,
      stockPerf60d: s60, sectorPerf60d: e60, rs60: s60 != null && e60 != null ? Math.round((s60 - e60) * 10) / 10 : null,
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  const isCrypto = req.nextUrl.searchParams.get("crypto") === "true";

  if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });

  try {
    const ticker = isCrypto ? `${symbol.toUpperCase()}-USD` : symbol.toUpperCase();

    const [chartData, weeklyData, fundamentals, fearGreed, regime, calibration] = await Promise.all([
      fetchYahoo(ticker, "1d", 400),
      fetchYahoo(ticker, "1wk", 365).catch(() => null),
      isCrypto ? null : fetchFundamentals(ticker),
      fetchFearGreed(),
      fetchMarketRegime(),
      getCalibration(),
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

    const indicators = computeIndicators(closes, highs, lows, volumes, weeklyCloses, weeklyVolumes, calibration?.weights);
    // Size the stop zone with the stop distance that tested best on two years of trades (default 1.5×ATR).
    const stopAtr = (await getTradeBacktest())?.best?.stopAtr ?? 1.5;
    if (indicators?.atr) {
      const last = closes[closes.length - 1];
      indicators.stopZone = { upper: Math.round((last - stopAtr * indicators.atr) * 100) / 100, lower: Math.round((last - (stopAtr + 1) * indicators.atr) * 100) / 100 };
      indicators.plain.volatility.stopDistance = Math.round(stopAtr * indicators.atr * 100) / 100;
    }

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

    // Supertrend line for the chart, and arrows where the trend flipped or the score crossed ±3,
    // each tagged with what price did over the next 10 sessions.
    const st = computeSupertrend(highs, lows, closes, 10, 3);
    const supertrend = candles.map((c, i) => ({ time: c.time, value: Math.round(st.line[i] * 100) / 100, dir: st.dir[i] })).slice(20);
    const markers: { time: number; dir: 1 | -1; kind: "trend" | "score"; fwd10: number | null }[] = [];
    const fwd = (i: number) => i + 10 < closes.length ? Math.round(((closes[i + 10] - closes[i]) / closes[i]) * 1000) / 10 : null;
    for (let i = 21; i < candles.length; i++) {
      if (st.dir[i] !== st.dir[i - 1]) markers.push({ time: candles[i].time, dir: st.dir[i], kind: "trend", fwd10: fwd(i) });
    }
    let prevScore = 0, lastScoreAt = -99;
    for (let i = Math.max(60, candles.length - 260); i < candles.length; i++) {
      const sc = computeIndicators(closes.slice(0, i + 1), highs.slice(0, i + 1), lows.slice(0, i + 1), volumes.slice(0, i + 1), [], [], calibration?.weights)?.confluence.score ?? 0;
      const fresh = i - lastScoreAt >= 10;
      if (fresh && sc >= 3 && prevScore < 3) { markers.push({ time: candles[i].time, dir: 1, kind: "score", fwd10: fwd(i) }); lastScoreAt = i; }
      if (fresh && sc <= -3 && prevScore > -3) { markers.push({ time: candles[i].time, dir: -1, kind: "score", fwd10: fwd(i) }); lastScoreAt = i; }
      prevScore = sc;
    }
    markers.sort((a, b) => a.time - b.time);

    const sector = await sectorStrength(ticker, isCrypto, fundamentals?.assetProfile, closes);

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
      stopAtr,
      earnings,
      sector,
      supertrend,
      markers,
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

