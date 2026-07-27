"use client";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";

const CandleChart = dynamic(() => import("@/components/CandleChart"), { ssr: false });

const POPULAR = [
  { symbol: "AAPL", label: "AAPL", crypto: false },
  { symbol: "NVDA", label: "NVDA", crypto: false },
  { symbol: "TSLA", label: "TSLA", crypto: false },
  { symbol: "BTC", label: "BTC", crypto: true },
  { symbol: "ETH", label: "ETH", crypto: true },
  { symbol: "SOL", label: "SOL", crypto: true },
];

interface AnalystData {
  recommendation: string | null;
  targetPrice: number | null;
  targetLow: number | null;
  targetHigh: number | null;
  analystCount: number | null;
  strongBuy: number | null;
  buy: number | null;
  hold: number | null;
  sell: number | null;
  strongSell: number | null;
  peRatio: number | null;
  forwardPE: number | null;
  eps: number | null;
  epsNextQuarter: number | null;
  revenueGrowth: number | null;
  profitMargin: number | null;
}

interface StockData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
  marketCap: number;
  high52w: number;
  low52w: number;
  candles: Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>;
  indicators: {
    rsi: number;
    macd: { macd: number; signal: number; histogram: number };
    bb: { upper: number; middle: number; lower: number };
    ma20: number;
    ma50: number | null;
    support: number[];
    resistance: number[];
    volumeRatio: number;
    avgVolume20d: number;
  } | null;
  analystData: AnalystData | null;
  fearGreed: { score: number; rating: string } | null;
}

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

interface AnalysisNewsItem {
  title: string;
  sentiment: "positive" | "negative" | "neutral";
  impact: string;
}

interface Analysis {
  tldr: string;
  trend: "bullish" | "bearish" | "neutral";
  trendTH: string;
  score: number;
  summary: string;
  technicalDetail: string;
  fundamentalDetail: string;
  newsSentiment: "positive" | "negative" | "neutral";
  newsSummaryTH: string;
  newsItems: AnalysisNewsItem[];
  entryStrategy: { first: number; second: number; reason: string };
  targets: { tp1: number; tp2: number; tp1Reason: string; tp2Reason: string };
  stopLoss: number;
  stopLossReason: string;
  riskReward: number;
  signals: string[];
  risks: string[];
  catalysts: string[];
  suggestion: "Buy" | "Wait" | "Avoid";
  suggestionTH: string;
  timeframe: string;
  exitStrategy: string;
}

interface Favorite {
  symbol: string;
  crypto: boolean;
  name?: string;
}

interface PickItem {
  symbol: string;
  name: string;
  suggestion: "Buy" | "Wait" | "Avoid";
  score: number;
  reason: string;
  entry: number;
  changePct: number;
}

interface FavAnalysis {
  symbol: string;
  suggestion: "Buy" | "Wait" | "Avoid";
  score: number;
  status: string;
  keyPoint: string;
}

interface MarketOverview {
  marketOverview: string;
  marketMood: "bullish" | "bearish" | "neutral" | "mixed";
  stockPicks: PickItem[];
  cryptoPicks: PickItem[];
  favoritesAnalysis: FavAnalysis[];
  topRisk: string;
  bestOpportunity: string;
  fearGreed: { score: number; rating: string } | null;
}

const sentimentColor = {
  positive: "text-green-400 bg-green-900/30 border-green-800",
  negative: "text-red-400 bg-red-900/30 border-red-800",
  neutral: "text-slate-400 bg-slate-800/50 border-slate-700",
};
const sentimentLabel = { positive: "บวก", negative: "ลบ", neutral: "กลาง" };

export default function Home() {
  const [activeTab, setActiveTab] = useState<"overview" | "detail">("overview");
  const [query, setQuery] = useState("");
  const [isCrypto, setIsCrypto] = useState(false);
  const [loading, setLoading] = useState(false);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewData, setOverviewData] = useState<MarketOverview | null>(null);
  const [overviewError, setOverviewError] = useState("");

  useEffect(() => {
    fetch("/api/favorites")
      .then((r) => r.json())
      .then((j) => { if (j.favorites) setFavorites(j.favorites); })
      .catch(() => {});
  }, []);

  async function saveFavorite(fav: Favorite) {
    await fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fav),
    });
    setFavorites((prev) => [...prev.filter((f) => f.symbol !== fav.symbol), fav]);
  }

  async function removeFavorite(symbol: string) {
    await fetch("/api/favorites", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol }),
    });
    setFavorites((prev) => prev.filter((f) => f.symbol !== symbol));
  }

  async function toggleFavorite() {
    if (!data) return;
    const exists = favorites.some((f) => f.symbol === data.symbol);
    if (exists) {
      await removeFavorite(data.symbol);
    } else {
      await saveFavorite({ symbol: data.symbol, crypto: isCrypto, name: data.name });
    }
  }

  const [analyzing, setAnalyzing] = useState(false);
  const [data, setData] = useState<StockData | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState("");

  const isFavorited = data ? favorites.some((f) => f.symbol === data.symbol) : false;

  async function loadOverview(favs: Favorite[]) {
    setOverviewLoading(true);
    setOverviewError("");
    try {
      const res = await fetch("/api/market-overview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorites: favs }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setOverviewData(json);
    } catch (e: unknown) {
      setOverviewError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setOverviewLoading(false);
    }
  }

  async function search(sym: string, crypto: boolean) {
    setLoading(true);
    setError("");
    setData(null);
    setAnalysis(null);
    setNews([]);
    try {
      const ticker = crypto ? `${sym.toUpperCase()}-USD` : sym.toUpperCase();
      const [stockRes, newsRes] = await Promise.all([
        fetch(`/api/stock?symbol=${sym}&crypto=${crypto}`),
        fetch(`/api/news?symbol=${ticker}`),
      ]);
      const stockJson = await stockRes.json();
      if (stockJson.error) throw new Error(stockJson.error);
      const newsJson = await newsRes.json();
      const newsItems: NewsItem[] = newsJson.items ?? [];
      setData(stockJson);
      setNews(newsItems);
      await analyze(stockJson, newsItems);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  async function analyze(stockData: StockData, newsItems: NewsItem[]) {
    setAnalyzing(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...stockData,
          news: newsItems,
          analystData: stockData.analystData,
          fearGreed: stockData.fearGreed,
        }),
      });
      const json = await res.json();
      if (!json.error) setAnalysis(json);
    } finally {
      setAnalyzing(false);
    }
  }

  const trendColor = { bullish: "text-green-400", bearish: "text-red-400", neutral: "text-gray-400" };
  const suggestionStyle = {
    Buy: "bg-green-900/40 text-green-300 border border-green-700",
    Wait: "bg-yellow-900/40 text-yellow-300 border border-yellow-700",
    Avoid: "bg-red-900/40 text-red-300 border border-red-700",
  };

  const moodColor = { bullish: "text-green-400", bearish: "text-red-400", neutral: "text-slate-400", mixed: "text-yellow-400" };
  const moodLabel = { bullish: "🟢 ขาขึ้น", bearish: "🔴 ขาลง", neutral: "⚪ Sideway", mixed: "🟡 ผสม" };
  const suggestionBadge = {
    Buy: "bg-green-900/50 text-green-300 border border-green-700",
    Wait: "bg-yellow-900/50 text-yellow-300 border border-yellow-700",
    Avoid: "bg-red-900/50 text-red-300 border border-red-700",
  };

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-slate-200">
      <header className="border-b border-slate-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-2xl">📈</div>
            <div>
              <h1 className="text-xl font-bold text-white">Trade Monitor</h1>
              <p className="text-xs text-slate-500">US Stocks & Crypto · Swing Trade Analysis</p>
            </div>
          </div>
          <div className="flex bg-slate-800 rounded-lg p-1 gap-1">
            <button
              onClick={() => setActiveTab("overview")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${activeTab === "overview" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}
            >🌐 ภาพรวมตลาด</button>
            <button
              onClick={() => setActiveTab("detail")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${activeTab === "detail" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}
            >🔍 วิเคราะห์รายตัว</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* ===== MARKET OVERVIEW TAB ===== */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white mb-1">วิเคราะห์ภาพรวมตลาด</h2>
                <p className="text-xs text-slate-500">AI วิเคราะห์ตลาดโดยรวม + ตัวที่น่าสนใจ + Favorites ของคุณ</p>
              </div>
              <button
                onClick={() => loadOverview(favorites)}
                disabled={overviewLoading}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-sm font-medium transition flex items-center gap-2"
              >
                {overviewLoading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />กำลังวิเคราะห์...</> : "🔍 วิเคราะห์ตอนนี้"}
              </button>
            </div>

            {overviewError && <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-300 text-sm">{overviewError}</div>}

            {overviewLoading && !overviewData && (
              <div className="text-center py-16 text-slate-500">
                <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p>กำลังดึงข้อมูลตลาดและวิเคราะห์ด้วย AI...</p>
                <p className="text-xs mt-2">อาจใช้เวลา 10-20 วินาที</p>
              </div>
            )}

            {overviewData && (
              <>
                {/* Market Mood */}
                <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    <h3 className="font-semibold text-white">สถานการณ์ตลาดโดยรวม</h3>
                    <span className={`text-sm font-bold ${moodColor[overviewData.marketMood]}`}>{moodLabel[overviewData.marketMood]}</span>
                    {overviewData.fearGreed && (() => {
                      const s = overviewData.fearGreed!.score;
                      const c = s >= 75 ? "text-green-300 border-green-700 bg-green-900/30" : s >= 56 ? "text-emerald-300 border-emerald-700 bg-emerald-900/30" : s >= 45 ? "text-slate-300 border-slate-600 bg-slate-800/50" : s >= 25 ? "text-orange-300 border-orange-700 bg-orange-900/30" : "text-red-300 border-red-700 bg-red-900/30";
                      return <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${c}`}>Fear&Greed: {s}/100 · {overviewData.fearGreed!.rating}</span>;
                    })()}
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed">{overviewData.marketOverview}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                    <div className="bg-green-900/20 border border-green-800/50 rounded-lg p-3">
                      <p className="text-xs text-slate-400 mb-1">💡 โอกาสที่ดีที่สุด</p>
                      <p className="text-sm text-green-300">{overviewData.bestOpportunity}</p>
                    </div>
                    <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-3">
                      <p className="text-xs text-slate-400 mb-1">⚠ ความเสี่ยงหลัก</p>
                      <p className="text-sm text-red-300">{overviewData.topRisk}</p>
                    </div>
                  </div>
                </div>

                {/* Stock Picks */}
                {overviewData.stockPicks?.length > 0 && (
                  <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
                    <h3 className="font-semibold text-white mb-4">🏢 หุ้น US ที่น่าสนใจ</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {overviewData.stockPicks.map((pick) => (
                        <button
                          key={pick.symbol}
                          onClick={() => { const sym = pick.symbol.replace(/-USD$/, ""); setQuery(sym); setIsCrypto(false); setActiveTab("detail"); search(sym, false); }}
                          className="text-left bg-slate-800/60 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-xl p-4 transition group"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <span className="font-bold text-white group-hover:text-blue-300 transition">{pick.symbol}</span>
                              <span className="text-xs text-slate-500 ml-2 block">{pick.name}</span>
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${suggestionBadge[pick.suggestion]}`}>{pick.suggestion === "Buy" ? "ซื้อได้" : pick.suggestion === "Wait" ? "รอจังหวะ" : "หลีกเลี่ยง"}</span>
                          </div>
                          <p className="text-xs text-slate-400 leading-relaxed mb-2">{pick.reason}</p>
                          <div className="flex justify-between text-xs">
                            <span className={pick.changePct >= 0 ? "text-green-400" : "text-red-400"}>{pick.changePct >= 0 ? "+" : ""}{pick.changePct?.toFixed(2)}%</span>
                            <span className="text-slate-500">Score: <span className="text-white">{pick.score}/10</span></span>
                          </div>
                          {pick.entry && <p className="text-xs text-slate-500 mt-1">เข้าได้ที่ <span className="text-blue-400">${pick.entry?.toFixed(2)}</span></p>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Crypto Picks */}
                {overviewData.cryptoPicks?.length > 0 && (
                  <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
                    <h3 className="font-semibold text-white mb-4">🪙 Crypto ที่น่าสนใจ</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {overviewData.cryptoPicks.map((pick) => (
                        <button
                          key={pick.symbol}
                          onClick={() => { const sym = pick.symbol.replace(/-USD$/, ""); setQuery(sym); setIsCrypto(true); setActiveTab("detail"); search(sym, true); }}
                          className="text-left bg-slate-800/60 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-xl p-4 transition group"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <span className="font-bold text-white group-hover:text-orange-300 transition">{pick.symbol.replace(/-USD$/, "")}</span>
                              <span className="text-xs text-slate-500 ml-2 block">{pick.name}</span>
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${suggestionBadge[pick.suggestion]}`}>{pick.suggestion === "Buy" ? "ซื้อได้" : pick.suggestion === "Wait" ? "รอจังหวะ" : "หลีกเลี่ยง"}</span>
                          </div>
                          <p className="text-xs text-slate-400 leading-relaxed mb-2">{pick.reason}</p>
                          <div className="flex justify-between text-xs">
                            <span className={pick.changePct >= 0 ? "text-green-400" : "text-red-400"}>{pick.changePct >= 0 ? "+" : ""}{pick.changePct?.toFixed(2)}%</span>
                            <span className="text-slate-500">Score: <span className="text-white">{pick.score}/10</span></span>
                          </div>
                          {pick.entry && <p className="text-xs text-slate-500 mt-1">เข้าได้ที่ <span className="text-orange-400">${pick.entry?.toFixed(2)}</span></p>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Favorites Analysis */}
                {overviewData.favoritesAnalysis?.length > 0 && (
                  <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
                    <h3 className="font-semibold text-white mb-4">⭐ สถานการณ์ Favorites ของคุณ</h3>
                    <div className="space-y-3">
                      {overviewData.favoritesAnalysis.map((fav) => {
                        const favInfo = favorites.find((f) => f.symbol.replace(/-USD$/, "").toUpperCase() === fav.symbol.replace(/-USD$/, "").toUpperCase());
                        return (
                          <button
                            key={fav.symbol}
                            onClick={() => { const sym = fav.symbol.replace(/-USD$/, ""); setQuery(sym); setIsCrypto(favInfo?.crypto ?? false); setActiveTab("detail"); search(sym, favInfo?.crypto ?? false); }}
                            className="w-full text-left bg-slate-800/50 hover:bg-slate-800 border border-slate-700 rounded-xl p-4 transition"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-yellow-400">⭐</span>
                                <span className="font-bold text-white">{fav.symbol.replace(/-USD$/, "")}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-500">Score: <span className="text-white">{fav.score}/10</span></span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${suggestionBadge[fav.suggestion]}`}>{fav.suggestion === "Buy" ? "ซื้อได้" : fav.suggestion === "Wait" ? "รอจังหวะ" : "หลีกเลี่ยง"}</span>
                              </div>
                            </div>
                            <p className="text-sm text-slate-300 mb-1">{fav.status}</p>
                            <p className="text-xs text-slate-500">🎯 {fav.keyPoint}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {overviewData.favoritesAnalysis?.length === 0 && (
                  <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 text-center text-slate-500 text-sm">
                    <p>ยังไม่มี Favorites — ไปที่ "วิเคราะห์รายตัว" แล้วกด ☆ เพื่อเพิ่ม</p>
                  </div>
                )}
              </>
            )}

            {!overviewData && !overviewLoading && (
              <div className="text-center py-16 text-slate-600">
                <div className="text-5xl mb-4">🌐</div>
                <p className="text-lg text-slate-500">กด "วิเคราะห์ตอนนี้" เพื่อดูภาพรวมตลาด</p>
                <p className="text-sm mt-2 text-slate-600">AI จะวิเคราะห์ตลาด US stocks + crypto และ Favorites ของคุณ</p>
              </div>
            )}
          </div>
        )}

        {/* ===== DETAIL TAB ===== */}
        {activeTab === "detail" && (
          <div className="space-y-6">
        {/* Search */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
          <div className="flex gap-3 mb-4">
            <div className="flex bg-slate-800 rounded-lg p-1 gap-1">
              <button onClick={() => setIsCrypto(false)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${!isCrypto ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}>US Stocks</button>
              <button onClick={() => setIsCrypto(true)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${isCrypto ? "bg-orange-500 text-white" : "text-slate-400 hover:text-white"}`}>Crypto</button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); if (query.trim()) search(query.trim(), isCrypto); }} className="flex flex-1 gap-2">
              <input value={query} onChange={(e) => setQuery(e.target.value.toUpperCase())} placeholder={isCrypto ? "เช่น BTC, ETH, SOL..." : "เช่น AAPL, NVDA, TSLA..."} className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500" />
              <button type="submit" disabled={loading} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium disabled:opacity-50 transition">{loading ? "กำลังโหลด..." : "วิเคราะห์"}</button>
            </form>
          </div>
          {favorites.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-slate-500 mb-2">⭐ Favorites</p>
              <div className="flex flex-wrap gap-2">
                {favorites.map((f) => (
                  <button
                    key={f.symbol}
                    onClick={() => { setQuery(f.symbol.replace(/-USD$/, "")); setIsCrypto(f.crypto); search(f.symbol.replace(/-USD$/, ""), f.crypto); }}
                    className="flex items-center gap-1.5 px-3 py-1 bg-yellow-900/30 hover:bg-yellow-900/50 border border-yellow-700/50 rounded-full text-xs text-yellow-300 transition"
                  >
                    <span>⭐</span>
                    <span>{f.symbol.replace(/-USD$/, "")}</span>
                    {f.name && <span className="text-yellow-500/70 hidden sm:inline">· {f.name.slice(0, 15)}</span>}
                    <span
                      onClick={(e) => { e.stopPropagation(); removeFavorite(f.symbol); }}
                      className="ml-1 text-yellow-600 hover:text-red-400 transition"
                    >×</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <p className="w-full text-xs text-slate-500 mb-1">ยอดนิยม</p>
            {POPULAR.map((p) => (
              <button key={p.symbol} onClick={() => { setQuery(p.symbol); setIsCrypto(p.crypto); search(p.symbol, p.crypto); }} className="px-3 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-full text-xs transition">{p.label}</button>
            ))}
          </div>
        </div>

        {error && <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-300 text-sm">{error}</div>}

        {data && (
          <>
            {/* Quote Header */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-2xl font-bold text-white">{data.symbol}</h2>
                    <span className="text-slate-400 text-sm">{data.name}</span>
                    <button
                      onClick={toggleFavorite}
                      title={isFavorited ? "ลบออกจาก Favorites" : "เพิ่มใน Favorites"}
                      className={`text-xl transition hover:scale-110 ${isFavorited ? "text-yellow-400" : "text-slate-600 hover:text-yellow-400"}`}
                    >
                      {isFavorited ? "⭐" : "☆"}
                    </button>
                  </div>
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="text-4xl font-bold text-white">${data.price?.toFixed(2)}</span>
                    <span className={`text-lg font-medium ${data.change >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {data.change >= 0 ? "+" : ""}{data.change?.toFixed(2)} ({data.changePct?.toFixed(2)}%)
                    </span>
                    {data.fearGreed && (() => {
                      const s = data.fearGreed!.score;
                      const color = s >= 75 ? "text-green-300 border-green-700 bg-green-900/30" : s >= 56 ? "text-emerald-300 border-emerald-700 bg-emerald-900/30" : s >= 45 ? "text-slate-300 border-slate-600 bg-slate-800/50" : s >= 25 ? "text-orange-300 border-orange-700 bg-orange-900/30" : "text-red-300 border-red-700 bg-red-900/30";
                      return <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${color}`}>😱 Fear&Greed: {s}/100</span>;
                    })()}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                  <div className="text-slate-400">Volume <span className="text-white ml-2">{(data.volume / 1e6).toFixed(1)}M</span></div>
                  <div className="text-slate-400">52W H <span className="text-green-400 ml-2">${data.high52w?.toFixed(2)}</span></div>
                  {data.marketCap && <div className="text-slate-400">Mkt Cap <span className="text-white ml-2">${(data.marketCap / 1e9).toFixed(1)}B</span></div>}
                  <div className="text-slate-400">52W L <span className="text-red-400 ml-2">${data.low52w?.toFixed(2)}</span></div>
                </div>
              </div>
            </div>

            {/* Chart */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
              <h3 className="text-sm font-medium text-slate-400 mb-3">กราฟราคา 90 วัน</h3>
              <CandleChart candles={data.candles} indicators={data.indicators} />
            </div>

            {/* Indicators + Analysis */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Technical Indicators */}
              {data.indicators && (
                <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 space-y-4">
                  <h3 className="font-semibold text-white">Technical Indicators</h3>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-400">RSI (14)</span>
                      <span className={data.indicators.rsi > 70 ? "text-red-400" : data.indicators.rsi < 30 ? "text-green-400" : "text-white"}>
                        {data.indicators.rsi?.toFixed(1)}
                        <span className="text-slate-500 ml-1 text-xs">{data.indicators.rsi > 70 ? "Overbought" : data.indicators.rsi < 30 ? "Oversold" : "Normal"}</span>
                      </span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${data.indicators.rsi > 70 ? "bg-red-500" : data.indicators.rsi < 30 ? "bg-green-500" : "bg-blue-500"}`} style={{ width: `${Math.min(data.indicators.rsi, 100)}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-slate-600 mt-0.5"><span>0</span><span>30</span><span>70</span><span>100</span></div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-sm">MACD</span>
                    <span className={data.indicators.macd.histogram > 0 ? "text-green-400 text-sm" : "text-red-400 text-sm"}>
                      {data.indicators.macd.histogram > 0 ? "▲" : "▼"} Hist: {data.indicators.macd.histogram?.toFixed(4)}
                    </span>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm mb-1">Bollinger Bands</p>
                    <div className="text-xs space-y-0.5">
                      <div className="flex justify-between"><span className="text-slate-500">Upper</span><span className="text-purple-300">${data.indicators.bb.upper?.toFixed(2)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Middle (MA20)</span><span className="text-purple-400">${data.indicators.bb.middle?.toFixed(2)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Lower</span><span className="text-purple-300">${data.indicators.bb.lower?.toFixed(2)}</span></div>
                    </div>
                  </div>
                  <div className="flex gap-4 text-sm">
                    <div><span className="text-slate-400">MA20 </span><span className="text-yellow-400">${data.indicators.ma20?.toFixed(2)}</span></div>
                    {data.indicators.ma50 && <div><span className="text-slate-400">MA50 </span><span className="text-orange-400">${data.indicators.ma50?.toFixed(2)}</span></div>}
                  </div>
                  {data.indicators.volumeRatio != null && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Volume Ratio (20d avg)</span>
                      <span className={data.indicators.volumeRatio > 1.5 ? "text-yellow-400 font-medium" : data.indicators.volumeRatio < 0.7 ? "text-slate-400" : "text-white"}>
                        {data.indicators.volumeRatio}x
                        {data.indicators.volumeRatio > 1.5 && <span className="ml-1 text-xs text-yellow-500">⚠ สูงผิดปกติ</span>}
                        {data.indicators.volumeRatio < 0.7 && <span className="ml-1 text-xs text-slate-500">(ต่ำ)</span>}
                      </span>
                    </div>
                  )}
                  <div>
                    <p className="text-slate-400 text-sm mb-1">แนวรับ / แนวต้าน</p>
                    <div className="flex gap-6 text-sm">
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Support</p>
                        {data.indicators.support.map((s, i) => <p key={i} className="text-green-400">${s?.toFixed(2)}</p>)}
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 mb-1">Resistance</p>
                        {data.indicators.resistance.map((r, i) => <p key={i} className="text-red-400">${r?.toFixed(2)}</p>)}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* AI Analysis */}
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-white">AI วิเคราะห์</h3>
                  <span className="text-xs text-slate-500">by LLaMA 3.3 70B</span>
                </div>
                {analyzing && (
                  <div className="flex items-center gap-2 text-slate-400 text-sm">
                    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    กำลังวิเคราะห์ข้อมูลและข่าว...
                  </div>
                )}
                {analysis && (
                  <div className="space-y-4">
                    {/* Header: suggestion + trend + score */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className={`px-4 py-1.5 rounded-full text-sm font-bold ${suggestionStyle[analysis.suggestion]}`}>{analysis.suggestionTH}</span>
                      <span className={`font-medium ${trendColor[analysis.trend]}`}>{analysis.trendTH}</span>
                      <span className="ml-auto text-slate-400 text-sm">Score <span className="text-white font-bold">{analysis.score}/10</span></span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500" style={{ width: `${analysis.score * 10}%` }} />
                    </div>

                    {/* TL;DR */}
                    {analysis.tldr && (
                      <div className="bg-blue-950/50 border border-blue-800/60 rounded-lg p-3">
                        <p className="text-xs text-blue-400 font-medium mb-1">⚡ สรุปสั้น</p>
                        <p className="text-sm text-blue-100 leading-relaxed">{analysis.tldr}</p>
                      </div>
                    )}

                    {/* Summary */}
                    <div>
                      <p className="text-xs text-slate-400 mb-1">ภาพรวม</p>
                      <p className="text-sm text-slate-300 leading-relaxed">{analysis.summary}</p>
                    </div>

                    {/* Technical + Fundamental detail */}
                    {analysis.technicalDetail && (
                      <div className="bg-slate-800/40 rounded-lg p-3 space-y-2">
                        <div>
                          <p className="text-xs text-purple-400 font-medium mb-1">📊 Technical Setup</p>
                          <p className="text-xs text-slate-300 leading-relaxed">{analysis.technicalDetail}</p>
                        </div>
                        {analysis.fundamentalDetail && (
                          <div>
                            <p className="text-xs text-emerald-400 font-medium mb-1">📋 Fundamental</p>
                            <p className="text-xs text-slate-300 leading-relaxed">{analysis.fundamentalDetail}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Entry Strategy */}
                    <div>
                      <p className="text-xs text-slate-400 mb-2">กลยุทธ์การเข้า</p>
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <div className="bg-green-900/30 border border-green-800 rounded-lg p-2 text-center">
                          <p className="text-xs text-slate-400 mb-0.5">เข้าครั้งแรก</p>
                          <p className="text-green-300 font-bold">${analysis.entryStrategy?.first?.toFixed(2)}</p>
                        </div>
                        <div className="bg-green-900/20 border border-green-900 rounded-lg p-2 text-center">
                          <p className="text-xs text-slate-400 mb-0.5">เข้าครั้งสอง</p>
                          <p className="text-green-400 font-bold">${analysis.entryStrategy?.second?.toFixed(2)}</p>
                        </div>
                      </div>
                      {analysis.entryStrategy?.reason && (
                        <p className="text-xs text-slate-400 leading-relaxed">{analysis.entryStrategy.reason}</p>
                      )}
                    </div>

                    {/* Targets */}
                    <div>
                      <p className="text-xs text-slate-400 mb-2">เป้าหมายราคา</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-blue-900/30 border border-blue-800 rounded-lg p-2">
                          <p className="text-xs text-slate-400 mb-0.5">TP1 (conservative)</p>
                          <p className="text-blue-300 font-bold">${analysis.targets?.tp1?.toFixed(2)}</p>
                          {analysis.targets?.tp1Reason && <p className="text-xs text-slate-500 mt-0.5">{analysis.targets.tp1Reason}</p>}
                        </div>
                        <div className="bg-blue-900/20 border border-blue-900 rounded-lg p-2">
                          <p className="text-xs text-slate-400 mb-0.5">TP2 (optimistic)</p>
                          <p className="text-blue-200 font-bold">${analysis.targets?.tp2?.toFixed(2) ?? "-"}</p>
                          {analysis.targets?.tp2Reason && <p className="text-xs text-slate-500 mt-0.5">{analysis.targets.tp2Reason}</p>}
                        </div>
                      </div>
                    </div>

                    {/* Stop Loss */}
                    <div className="bg-red-900/20 border border-red-900 rounded-lg p-3">
                      <div className="flex justify-between items-center mb-1">
                        <p className="text-xs text-slate-400">Cut Loss</p>
                        <p className="text-red-300 font-bold">${analysis.stopLoss?.toFixed(2)}</p>
                      </div>
                      {analysis.stopLossReason && <p className="text-xs text-slate-500">{analysis.stopLossReason}</p>}
                    </div>

                    {/* Risk/Reward + Timeframe */}
                    <div className="flex gap-4 text-sm">
                      <div className="flex-1 bg-slate-800/50 rounded-lg p-2 text-center">
                        <p className="text-xs text-slate-400 mb-0.5">Risk/Reward</p>
                        <p className="text-white font-bold">1 : {analysis.riskReward?.toFixed(2)}</p>
                      </div>
                      <div className="flex-1 bg-slate-800/50 rounded-lg p-2 text-center">
                        <p className="text-xs text-slate-400 mb-0.5">ถือ</p>
                        <p className="text-white font-bold">{analysis.timeframe}</p>
                      </div>
                    </div>

                    {/* Exit Strategy */}
                    {analysis.exitStrategy && (
                      <div className="bg-slate-800/40 rounded-lg p-3">
                        <p className="text-xs text-yellow-400 font-medium mb-1">🚪 กลยุทธ์การออก</p>
                        <p className="text-xs text-slate-300 leading-relaxed">{analysis.exitStrategy}</p>
                      </div>
                    )}

                    {/* Signals */}
                    <div>
                      <p className="text-xs text-slate-400 mb-2">สัญญาณบวก</p>
                      <ul className="space-y-1">
                        {analysis.signals.map((s, i) => <li key={i} className="text-xs text-green-300 flex gap-1.5"><span className="shrink-0">✓</span>{s}</li>)}
                      </ul>
                    </div>

                    {/* Risks */}
                    <div>
                      <p className="text-xs text-slate-400 mb-2">ความเสี่ยง</p>
                      <ul className="space-y-1">
                        {analysis.risks.map((r, i) => <li key={i} className="text-xs text-red-300 flex gap-1.5"><span className="shrink-0">⚠</span>{r}</li>)}
                      </ul>
                    </div>

                    {/* Catalysts */}
                    {analysis.catalysts?.length > 0 && (
                      <div>
                        <p className="text-xs text-slate-400 mb-2">Catalyst (1-2 สัปดาห์)</p>
                        <ul className="space-y-1">
                          {analysis.catalysts.map((c, i) => <li key={i} className="text-xs text-yellow-300 flex gap-1.5"><span className="shrink-0">⚡</span>{c}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Analyst Ratings */}
            {data.analystData && (() => {
              const a = data.analystData!;
              const total = (a.strongBuy ?? 0) + (a.buy ?? 0) + (a.hold ?? 0) + (a.sell ?? 0) + (a.strongSell ?? 0);
              const bullPct = total > 0 ? Math.round(((a.strongBuy ?? 0) + (a.buy ?? 0)) / total * 100) : 0;
              const bearPct = total > 0 ? Math.round(((a.sell ?? 0) + (a.strongSell ?? 0)) / total * 100) : 0;
              const holdPct = 100 - bullPct - bearPct;
              const recColor: Record<string, string> = { buy: "text-green-400", strongbuy: "text-green-300", hold: "text-yellow-400", sell: "text-red-400", strongsell: "text-red-300" };
              return (
                <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
                  <h3 className="font-semibold text-white mb-4">Analyst Ratings (Wall Street)</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <span className={`text-2xl font-bold capitalize ${recColor[a.recommendation?.toLowerCase() ?? ""] ?? "text-white"}`}>{a.recommendation?.toUpperCase() ?? "N/A"}</span>
                        {a.analystCount && <span className="text-xs text-slate-500">{a.analystCount} analysts</span>}
                      </div>
                      {total > 0 && (
                        <div>
                          <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5 mb-1">
                            {bullPct > 0 && <div className="bg-green-500 rounded-l-full" style={{ width: `${bullPct}%` }} />}
                            {holdPct > 0 && <div className="bg-yellow-500" style={{ width: `${holdPct}%` }} />}
                            {bearPct > 0 && <div className="bg-red-500 rounded-r-full" style={{ width: `${bearPct}%` }} />}
                          </div>
                          <div className="flex justify-between text-xs text-slate-500">
                            <span className="text-green-400">Buy {bullPct}%</span>
                            <span className="text-yellow-400">Hold {holdPct}%</span>
                            <span className="text-red-400">Sell {bearPct}%</span>
                          </div>
                          <div className="flex gap-3 mt-2 text-xs text-slate-400">
                            <span>SB:{a.strongBuy ?? 0}</span><span>B:{a.buy ?? 0}</span><span>H:{a.hold ?? 0}</span><span>S:{a.sell ?? 0}</span><span>SS:{a.strongSell ?? 0}</span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="space-y-2 text-sm">
                      <p className="text-xs text-slate-500 mb-2 font-medium">ราคาเป้าหมาย</p>
                      {a.targetPrice && <div className="flex justify-between"><span className="text-slate-400">Mean</span><span className="text-blue-300 font-medium">${a.targetPrice.toFixed(2)}</span></div>}
                      {a.targetLow && <div className="flex justify-between"><span className="text-slate-400">Low</span><span className="text-slate-300">${a.targetLow.toFixed(2)}</span></div>}
                      {a.targetHigh && <div className="flex justify-between"><span className="text-slate-400">High</span><span className="text-slate-300">${a.targetHigh.toFixed(2)}</span></div>}
                      {a.targetPrice && data.price && (
                        <div className="flex justify-between border-t border-slate-800 pt-2 mt-2">
                          <span className="text-slate-400">Upside</span>
                          <span className={a.targetPrice > data.price ? "text-green-400 font-medium" : "text-red-400 font-medium"}>
                            {a.targetPrice > data.price ? "+" : ""}{(((a.targetPrice - data.price) / data.price) * 100).toFixed(1)}%
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="space-y-2 text-sm">
                      <p className="text-xs text-slate-500 mb-2 font-medium">Fundamental</p>
                      {a.peRatio != null && <div className="flex justify-between"><span className="text-slate-400">P/E (TTM)</span><span className="text-white">{a.peRatio.toFixed(1)}</span></div>}
                      {a.forwardPE != null && <div className="flex justify-between"><span className="text-slate-400">Forward P/E</span><span className="text-white">{a.forwardPE.toFixed(1)}</span></div>}
                      {a.eps != null && <div className="flex justify-between"><span className="text-slate-400">EPS (TTM)</span><span className="text-white">${a.eps.toFixed(2)}</span></div>}
                      {a.epsNextQuarter != null && <div className="flex justify-between"><span className="text-slate-400">EPS Next Q (est)</span><span className="text-white">${a.epsNextQuarter.toFixed(2)}</span></div>}
                      {a.revenueGrowth != null && <div className="flex justify-between"><span className="text-slate-400">Revenue Growth</span><span className={a.revenueGrowth >= 0 ? "text-green-400" : "text-red-400"}>{(a.revenueGrowth * 100).toFixed(1)}%</span></div>}
                      {a.profitMargin != null && <div className="flex justify-between"><span className="text-slate-400">Profit Margin</span><span className={a.profitMargin >= 0 ? "text-green-400" : "text-red-400"}>{(a.profitMargin * 100).toFixed(1)}%</span></div>}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* News Section */}
            {(news.length > 0 || analyzing) && (
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-white">ข่าวล่าสุด</h3>
                  {analysis?.newsSentiment && (
                    <span className={`text-xs px-3 py-1 rounded-full border ${sentimentColor[analysis.newsSentiment]}`}>
                      Sentiment: {sentimentLabel[analysis.newsSentiment]}
                    </span>
                  )}
                </div>

                {analysis?.newsSummaryTH && (
                  <p className="text-sm text-slate-300 leading-relaxed mb-4 pb-4 border-b border-slate-800">
                    📰 {analysis.newsSummaryTH}
                  </p>
                )}

                <div className="space-y-3">
                  {news.map((item, i) => {
                    const aiItem = analysis?.newsItems?.[i];
                    return (
                      <div key={i} className="flex gap-3 p-3 bg-slate-800/50 rounded-lg hover:bg-slate-800 transition">
                        <div className="flex-1 min-w-0">
                          {aiItem ? (
                            <p className="text-sm text-white font-medium leading-snug mb-1">{aiItem.title}</p>
                          ) : (
                            <p className="text-sm text-white font-medium leading-snug mb-1 line-clamp-2">{item.title}</p>
                          )}
                          {aiItem?.impact && (
                            <p className="text-xs text-slate-400 mb-1">{aiItem.impact}</p>
                          )}
                          <div className="flex items-center gap-2">
                            {aiItem?.sentiment && (
                              <span className={`text-xs px-2 py-0.5 rounded border ${sentimentColor[aiItem.sentiment]}`}>
                                {sentimentLabel[aiItem.sentiment]}
                              </span>
                            )}
                            {item.pubDate && (
                              <span className="text-xs text-slate-500">
                                {new Date(item.pubDate).toLocaleDateString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                              </span>
                            )}
                          </div>
                        </div>
                        {item.link && (
                          <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-blue-400 transition shrink-0 mt-0.5">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {!data && !loading && (
          <div className="text-center py-20 text-slate-600">
            <div className="text-5xl mb-4">📊</div>
            <p className="text-lg">ค้นหาหุ้นหรือ crypto เพื่อเริ่มวิเคราะห์</p>
            <p className="text-sm mt-2">รองรับ US Stocks (NYSE/NASDAQ) และ Cryptocurrency</p>
          </div>
        )}
          </div>
        )}
      </main>
    </div>
  );
}
