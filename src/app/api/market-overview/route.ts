import { NextRequest, NextResponse } from "next/server";

const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  "Accept": "application/json",
};

const DEFAULT_STOCKS = ["AAPL", "NVDA", "TSLA", "MSFT", "AMZN", "META"];
const DEFAULT_CRYPTO = ["BTC", "ETH", "SOL"];

async function fetchQuote(ticker: string) {
  try {
    const period1 = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
    const period2 = Math.floor(Date.now() / 1000);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&period1=${period1}&period2=${period2}&includePrePost=false`;
    const res = await fetch(url, { headers: YF_HEADERS, next: { revalidate: 300 } });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;
    const meta = result.meta;
    const closes: number[] = result.indicators?.quote?.[0]?.close?.filter(Boolean) ?? [];
    const volumes: number[] = result.indicators?.quote?.[0]?.volume?.filter(Boolean) ?? [];
    if (closes.length < 14) return null;

    const price = meta.regularMarketPrice ?? closes[closes.length - 1];
    const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? closes[closes.length - 2];
    const changePct = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;

    const rsi = computeRSI(closes, 14);
    const ema12 = computeEMA(closes, 12);
    const ema26 = computeEMA(closes, 26);
    const macdHist = closes.length >= 26
      ? (ema12[ema12.length - 1] - ema26[ema26.length - 1])
      : 0;
    const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, volumes.length);
    const volRatio = avgVol > 0 ? Math.round((volumes[volumes.length - 1] / avgVol) * 100) / 100 : 1;

    return {
      ticker,
      price,
      changePct: Math.round(changePct * 100) / 100,
      rsi: Math.round(rsi[rsi.length - 1] * 10) / 10,
      macdBullish: macdHist > 0,
      volumeRatio: volRatio,
      name: meta.shortName ?? meta.longName ?? ticker,
    };
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

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const favorites: Array<{ symbol: string; crypto: boolean }> = body.favorites ?? [];

  // Build symbol lists
  const favStocks = favorites.filter((f) => !f.crypto).map((f) => f.symbol.replace(/-USD$/, "").toUpperCase());
  const favCrypto = favorites.filter((f) => f.crypto).map((f) => `${f.symbol.replace(/-USD$/, "").toUpperCase()}-USD`);

  const allStocks = [...new Set([...DEFAULT_STOCKS, ...favStocks])];
  const allCrypto = [...new Set([...DEFAULT_CRYPTO.map((s) => `${s}-USD`), ...favCrypto])];

  const [stockQuotes, cryptoQuotes, fearGreed] = await Promise.all([
    Promise.all(allStocks.map(fetchQuote)),
    Promise.all(allCrypto.map(fetchQuote)),
    fetchFearGreed(),
  ]);

  const stocks = stockQuotes.filter(Boolean) as NonNullable<ReturnType<typeof fetchQuote> extends Promise<infer T> ? T : never>[];
  const cryptos = cryptoQuotes.filter(Boolean) as typeof stocks;
  const favSymbols = favorites.map((f) => f.crypto ? `${f.symbol.replace(/-USD$/, "").toUpperCase()}-USD` : f.symbol.toUpperCase());
  const favQuotes = [...stocks, ...cryptos].filter((q) => q && favSymbols.includes(q.ticker));

  const formatQuote = (q: (typeof stocks)[0]) =>
    `${q.ticker} (${q.name}): $${q.price.toFixed(2)}, ${q.changePct >= 0 ? "+" : ""}${q.changePct}%, RSI=${q.rsi}, MACD=${q.macdBullish ? "Bullish" : "Bearish"}, Vol=${q.volumeRatio}x`;

  const prompt = `คุณเป็นนักวิเคราะห์ตลาดหุ้นและ crypto มืออาชีพสำหรับ Swing Trader ไทย (ถือ 3-14 วัน)

${fearGreed ? `CNN Fear & Greed Index: ${fearGreed.score}/100 (${fearGreed.rating})` : ""}

ข้อมูลหุ้น US:
${stocks.map(formatQuote).join("\n")}

ข้อมูล Crypto:
${cryptos.map(formatQuote).join("\n")}

${favQuotes.length > 0 ? `\nFavorites ของผู้ใช้:\n${favQuotes.map(formatQuote).join("\n")}` : ""}

วิเคราะห์ภาพรวมตลาดและให้คำแนะนำเป็น JSON:
{
  "marketOverview": "สรุปสถานการณ์ตลาดโดยรวม 3-4 ประโยค รวม sentiment, trend หลัก, และ Fear&Greed",
  "marketMood": "bullish" | "bearish" | "neutral" | "mixed",
  "stockPicks": [
    { "symbol": "TICKER", "name": "ชื่อ", "suggestion": "Buy"|"Wait"|"Avoid", "score": 1-10, "reason": "เหตุผล 1 ประโยคภาษาไทย", "entry": ราคาแนะนำเข้า, "changePct": เปลี่ยนแปลง% }
  ],
  "cryptoPicks": [
    { "symbol": "TICKER", "name": "ชื่อ", "suggestion": "Buy"|"Wait"|"Avoid", "score": 1-10, "reason": "เหตุผล 1 ประโยคภาษาไทย", "entry": ราคาแนะนำเข้า, "changePct": เปลี่ยนแปลง% }
  ],
  "favoritesAnalysis": [
    { "symbol": "TICKER", "suggestion": "Buy"|"Wait"|"Avoid", "score": 1-10, "status": "สถานการณ์ปัจจุบัน 1-2 ประโยค", "keyPoint": "จุดสำคัญที่ต้องดู" }
  ],
  "topRisk": "ความเสี่ยงหลักของตลาดตอนนี้ 1 ประโยค",
  "bestOpportunity": "โอกาสที่ดีที่สุดตอนนี้ 1 ประโยค"
}

เรียง stockPicks และ cryptoPicks จากน่าซื้อที่สุดไปน้อยสุด ตอบเฉพาะ JSON เท่านั้น`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 2500,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const result = await res.json();
    const text = result.choices?.[0]?.message?.content ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const analysis = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ ...analysis, fearGreed, stocks, cryptos });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Analysis failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function avg(arr: number[]) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function computeEMA(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  let ema = avg(data.slice(0, period));
  const result: number[] = new Array(period - 1).fill(ema);
  result.push(ema);
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

function computeRSI(data: number[], period: number): number[] {
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = data[i] - data[i - 1];
    if (d > 0) avgGain += d; else avgLoss += -d;
  }
  avgGain /= period; avgLoss /= period;
  const result: number[] = [];
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
