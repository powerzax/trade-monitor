import { NextRequest, NextResponse } from "next/server";
import { rateLimitInfo, RATE_LIMIT_MESSAGE } from "@/lib/groq";
import { sql, initDB } from "@/lib/db";
import { fetchMarketRegime } from "@/lib/yahoo";

const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  "Accept": "application/json",
};

const DEFAULT_STOCKS = ["AAPL", "NVDA", "TSLA", "MSFT", "AMZN", "META"];
const DEFAULT_CRYPTO = ["BTC", "ETH", "SOL"];

async function fetchQuote(ticker: string) {
  try {
    const period1 = Math.floor((Date.now() - 120 * 24 * 60 * 60 * 1000) / 1000);
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
    if (closes.length < 35) return null;
    const n = closes.length;

    const price = meta.regularMarketPrice ?? closes[n - 1];
    const prevClose = closes[n - 2];
    const changePct = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;

    const rsi = computeRSI(closes, 14);
    const ema12 = computeEMA(closes, 12);
    const ema26 = computeEMA(closes, 26);
    const macdLine = ema12.map((v, i) => v - ema26[i]);
    const signal = computeEMA(macdLine.slice(25), 9);
    const macdHist = macdLine[n - 1] - signal[signal.length - 1];
    const ma20 = avg(closes.slice(-20));
    const ma50 = n >= 50 ? avg(closes.slice(-50)) : null;
    const avgVol = avg(volumes.slice(-20));
    const volRatio = avgVol > 0 ? Math.round((volumes[volumes.length - 1] / avgVol) * 100) / 100 : 1;
    const pct = (a: number, b: number) => Math.round(((a - b) / b) * 1000) / 10;

    return {
      ticker,
      price,
      changePct: Math.round(changePct * 100) / 100,
      perf5d: pct(closes[n - 1], closes[n - 6]),
      perf20d: pct(closes[n - 1], closes[n - 21]),
      rsi: Math.round(rsi[rsi.length - 1] * 10) / 10,
      macdBullish: macdHist > 0,
      aboveMa20: price > ma20,
      aboveMa50: ma50 ? price > ma50 : null,
      volumeRatio: volRatio,
      spark: closes.slice(-30).map((c) => Math.round(c * 100) / 100),
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

export async function GET() {
  await initDB();
  const rows = await sql`SELECT result, created_at FROM analysis_cache WHERE type = 'market_overview' ORDER BY created_at DESC LIMIT 1`;
  if (!rows.length) return NextResponse.json({ overview: null });
  return NextResponse.json({ overview: { ...rows[0].result, createdAt: rows[0].created_at } });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const favorites: Array<{ symbol: string; crypto: boolean }> = body.favorites ?? [];

  // Build symbol lists
  const favStocks = favorites.filter((f) => !f.crypto).map((f) => f.symbol.replace(/-USD$/, "").toUpperCase());
  const favCrypto = favorites.filter((f) => f.crypto).map((f) => `${f.symbol.replace(/-USD$/, "").toUpperCase()}-USD`);

  const allStocks = [...new Set([...DEFAULT_STOCKS, ...favStocks])];
  const allCrypto = [...new Set([...DEFAULT_CRYPTO.map((s) => `${s}-USD`), ...favCrypto])];

  const [stockQuotes, cryptoQuotes, fearGreed, regime] = await Promise.all([
    Promise.all(allStocks.map(fetchQuote)),
    Promise.all(allCrypto.map(fetchQuote)),
    fetchFearGreed(),
    fetchMarketRegime(),
  ]);
  const market = { spy: regime.spy, qqq: regime.qqq, vix: regime.vix, regime: regime.regime };

  const stocks = stockQuotes.filter(Boolean) as NonNullable<ReturnType<typeof fetchQuote> extends Promise<infer T> ? T : never>[];
  const cryptos = cryptoQuotes.filter(Boolean) as typeof stocks;
  const favSymbols = favorites.map((f) => f.crypto ? `${f.symbol.replace(/-USD$/, "").toUpperCase()}-USD` : f.symbol.toUpperCase());
  const favQuotes = [...stocks, ...cryptos].filter((q) => q && favSymbols.includes(q.ticker));

  const formatQuote = (q: (typeof stocks)[0]) =>
    `${q.ticker} (${q.name}): $${q.price.toFixed(2)}, วันนี้ ${q.changePct >= 0 ? "+" : ""}${q.changePct}%, 5 วัน ${q.perf5d}%, 20 วัน ${q.perf20d}%, RSI=${q.rsi}, MACD hist=${q.macdBullish ? "บวก" : "ลบ"}, ${q.aboveMa20 ? "เหนือ" : "ใต้"} MA20${q.aboveMa50 == null ? "" : q.aboveMa50 ? ", เหนือ MA50" : ", ใต้ MA50"}, Vol=${q.volumeRatio}x`;

  await initDB();
  const prevRows = await sql`SELECT result, created_at FROM analysis_cache WHERE type = 'market_overview' ORDER BY created_at DESC LIMIT 1`;
  const prev = prevRows[0];
  const prevSection = prev
    ? `\nผลวิเคราะห์รอบก่อน (${new Date(prev.created_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}):\n- Mood: ${prev.result.marketMood}\n- สรุป: ${prev.result.marketOverview}\n- หุ้นเด่น: ${(prev.result.stockPicks ?? []).slice(0, 3).map((p: { symbol: string; suggestion: string }) => `${p.symbol}(${p.suggestion})`).join(", ")}\n- Crypto เด่น: ${(prev.result.cryptoPicks ?? []).slice(0, 3).map((p: { symbol: string; suggestion: string }) => `${p.symbol}(${p.suggestion})`).join(", ")}\n`
    : "";

  const prompt = `คุณเป็นนักวิเคราะห์ตลาดหุ้นและ crypto มืออาชีพสำหรับ Swing Trader ไทย (ถือ 3-14 วัน)

${fearGreed ? `CNN Fear & Greed Index: ${fearGreed.score}/100 (${fearGreed.rating})` : ""}
ดัชนีหลัก: S&P 500 ${market.spy ? `${market.spy.changePct}% วันนี้ / ${market.spy.perf20d}% ใน 20 วัน / ${market.spy.aboveMa50 ? "เหนือ" : "ใต้"} MA50` : "N/A"} | Nasdaq ${market.qqq ? `${market.qqq.changePct}% / ${market.qqq.perf20d}% ใน 20 วัน` : "N/A"} | VIX ${market.vix ?? "N/A"} | สภาวะ: ${market.regime}

ข้อมูลหุ้น US:
${stocks.map(formatQuote).join("\n")}

ข้อมูล Crypto:
${cryptos.map(formatQuote).join("\n")}

${favQuotes.length > 0 ? `\nFavorites ของผู้ใช้:\n${favQuotes.map(formatQuote).join("\n")}` : ""}
${prevSection}

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
  "bestOpportunity": "โอกาสที่ดีที่สุดตอนนี้ 1 ประโยค",
  "changesSinceLast": "เทียบกับผลรอบก่อน อะไรเปลี่ยนไปบ้าง 1-2 ประโยค (ถ้าไม่มีรอบก่อนให้เป็น null)",
  "actionPlan": ["สิ่งที่ควรทำวันนี้ข้อ 1", "ข้อ 2", "ข้อ 3"]
}

เรียง stockPicks และ cryptoPicks จากน่าซื้อที่สุดไปน้อยสุด ตัวเลขทุกตัว (score, entry, changePct) ต้องเป็น number ล้วน ตอบเฉพาะ JSON เท่านั้น`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        reasoning_effort: "low",
        max_tokens: 6000,
        temperature: 0.3,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      const rl = await rateLimitInfo(res);
      if (rl.limited) return NextResponse.json({ error: RATE_LIMIT_MESSAGE, rateLimited: true, retryAfter: rl.retryAfter }, { status: 429 });
      throw new Error(await res.text());
    }
    const result = await res.json();
    const text = result.choices?.[0]?.message?.content ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const analysis = JSON.parse(jsonMatch[0]);
    const num = (v: unknown) => {
      if (typeof v === "number") return v;
      const m = String(v ?? "").replace(/,/g, "").match(/-?\d+(\.\d+)?/);
      return m ? Number(m[0]) : null;
    };
    for (const p of [...(analysis.stockPicks ?? []), ...(analysis.cryptoPicks ?? [])]) {
      p.score = num(p.score); p.entry = num(p.entry); p.changePct = num(p.changePct);
    }
    for (const f of analysis.favoritesAnalysis ?? []) f.score = num(f.score);
    const full = { ...analysis, fearGreed, stocks, cryptos, market };
    const saved = await sql`INSERT INTO analysis_cache (symbol, type, result) VALUES ('MARKET_OVERVIEW', 'market_overview', ${JSON.stringify(full)}::jsonb) RETURNING created_at`;
    return NextResponse.json({ ...full, createdAt: saved[0].created_at });
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
