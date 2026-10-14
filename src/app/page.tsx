"use client";
import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";

const CandleChart = dynamic(() => import("@/components/CandleChart"), { ssr: false });
import type { ProjectionPoint, PriceLine, ChartMarker } from "@/components/CandleChart";
import { computeHoldings, type Position } from "@/lib/portfolio";
import { Term } from "@/components/Term";
import { LotRow } from "@/components/LotRow";
import { JournalCard } from "@/components/JournalCard";
import { SetupBadge, type SetupStat } from "@/components/SetupBadge";
import { OddsOutOfTen } from "@/components/OddsOutOfTen";
import { Scorecard } from "@/components/Scorecard";
import { PositionSizer } from "@/components/PositionSizer";
import { ConcentrationWarnings } from "@/components/ConcentrationWarnings";
import { EarningsBanner } from "@/components/EarningsBanner";

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
    volumePattern?: string;
    adx?: number | null;
    trendStrength?: string;
    weekly?: { trend: string; rsi: number | null; volRatio: number | null };
    confluence?: { score: number; signal: string; details: string[] };
    atr?: number;
    atrPct?: number;
    supertrend?: { dir: number; days: number; line: number };
    moneyFlow?: "in" | "out" | "neutral";
    mfi?: number | null;
    stochRsi?: number;
    stopZone?: { upper: number; lower: number };
    plain?: {
      trend: { state: "up" | "down"; days: number };
      flow: "in" | "out" | "neutral";
      timing: "good" | "ok" | "wait" | "hot";
      volatility: { level: "low" | "normal" | "high"; atr: number; stopDistance: number };
    };
  } | null;
  analystData: AnalystData | null;
  beta?: number | null;
  earnings?: { date: string; daysUntil: number } | null;
  supertrend?: { time: number; value: number; dir: number }[];
  markers?: ChartMarker[];
  sector?: { label: string; etf: string; rs20: number | null; rs60: number | null; stockPerf20d: number | null; sectorPerf20d: number | null } | null;
  projection?: { horizon: number; sigmaDaily: number; muDaily: number; earningsInHorizon: boolean; points: ProjectionPoint[] } | null;
  market?: {
    spy: { changePct: number; perf20d: number; aboveMa50: boolean } | null;
    qqq: { changePct: number; perf20d: number; aboveMa50: boolean } | null;
    vix: number | null;
    regime: "risk_on" | "risk_off" | "neutral";
  };
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
  setup?: string | null;
  setupTH?: string | null;
  setupReason?: string | null;
  changeFromLast?: string | null;
  odds?: { pTarget: number; pStop: number; pOpen: number; expectedPct: number; horizon: number } | null;
  oneLiner?: string;
  confidenceNote?: string;
  positionAdvice?: {
    action: "Hold" | "TakeProfit" | "CutLoss" | "AddMore";
    actionTH: string;
    reason: string;
    stopForPosition: number | null;
    targetForPosition: number | null;
  };
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

interface HistoryItem {
  id: number;
  created_at: string;
  suggestion: string;
  suggestion_th: string;
  score: number;
  tldr: string;
  trend_th: string;
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
  changesSinceLast?: string | null;
  actionPlan?: string[];
  stocks?: Quote[];
  cryptos?: Quote[];
  createdAt?: string;
}

interface ScanRow {
  ticker: string;
  crypto: boolean;
  name: string;
  price: number;
  changePct: number;
  perf20d: number;
  score: number;
  signal: string;
  rsi: number;
  adx: number | null;
  details: string[];
  spark: number[];
}

interface ScanResult {
  scanned: number;
  rows: ScanRow[];
  createdAt: string;
}

interface AccStats {
  count: number;
  evaluated: number;
  winRate: number | null;
  avgRet7: number | null;
  avgRet14: number | null;
  tpHits: number;
  slHits: number;
}

interface AccuracyData {
  overall: AccStats;
  buy: AccStats;
  wait: AccStats;
  avoid: AccStats;
  buyHighScore: AccStats;
  buyLowScore: AccStats;
  recent: { symbol: string; date: string; suggestion: string; score: number | null; entry: number; ret7: number | null; ret14: number | null; hit: "tp" | "sl" | null; correct: boolean | null }[];
}

interface Quote {
  ticker: string;
  name: string;
  price: number;
  changePct: number;
  perf5d?: number;
  perf20d?: number;
  spark?: number[];
}

function Sparkline({ values, className = "" }: { values?: number[]; className?: string }) {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${30 - ((v - min) / (max - min || 1)) * 28 - 1}`).join(" ");
  const up = values[values.length - 1] >= values[0];
  const c = up ? "#6ee7b7" : "#f472b6";
  const id = `sg-${up ? "u" : "d"}`;
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={className}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c} stopOpacity="0.35" /><stop offset="100%" stopColor={c} stopOpacity="0" /></linearGradient></defs>
      <polygon points={`0,30 ${pts} 100,30`} fill={`url(#${id})`} />
      <polyline points={pts} fill="none" stroke={c} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

const sentimentColor = {
  positive: "text-green-400 bg-green-900/30 border-green-800",
  negative: "text-red-400 bg-red-900/30 border-red-800",
  neutral: "text-slate-400 bg-white/[0.04] border-slate-700",
};
const sentimentLabel = { positive: "บวก", negative: "ลบ", neutral: "กลาง" };

function normCdf(x: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

// Chance the price ends above `level` at the end of the projection, read off the lognormal cone.
function probAbove(points: ProjectionPoint[] | undefined, level: number) {
  const last = points?.[points.length - 1];
  if (!last || !(level > 0)) return null;
  const sd = (Math.log(last.p90) - Math.log(last.p50)) / 1.2816;
  if (!(sd > 0)) return null;
  return 1 - normCdf((Math.log(level) - Math.log(last.p50)) / sd);
}

function money(v: number, digits = 2) {
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function fmt(v: unknown, digits = 2): string {
  if (v == null || v === "") return "-";
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n.toFixed(digits) : String(v);
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<"overview" | "detail" | "portfolio" | "accuracy">("overview");
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [setupStats, setSetupStats] = useState<Record<string, SetupStat> | null>(null);

  useEffect(() => {
    fetch("/api/accuracy?latest=1").then((r) => r.json()).then((j) => setSetupStats(j?.bySetup ?? null)).catch(() => {});
  }, []);
  const [scanning, setScanning] = useState(false);
  const [accuracy, setAccuracy] = useState<AccuracyData | null>(null);
  const [accuracyLoading, setAccuracyLoading] = useState(false);

  useEffect(() => {
    fetch("/api/screener").then((r) => r.json()).then((j) => setScan(j.scan)).catch(() => {});
  }, []);

  useEffect(() => {
    if (activeTab !== "accuracy" || accuracy || accuracyLoading) return;
    setAccuracyLoading(true);
    fetch("/api/accuracy").then((r) => r.json()).then(setAccuracy).catch(() => {}).finally(() => setAccuracyLoading(false));
  }, [activeTab, accuracy, accuracyLoading]);

  async function runScanNow() {
    setScanning(true);
    try {
      const j = await fetch("/api/screener", { method: "POST" }).then((r) => r.json());
      if (j.scan) setScan(j.scan);
    } finally {
      setScanning(false);
    }
  }
  const [positions, setPositions] = useState<Position[]>([]);
  const [posQuotes, setPosQuotes] = useState<Record<string, Quote>>({});
  const [posForm, setPosForm] = useState({ symbol: "", crypto: false, price: "", qty: "", side: "buy" as "buy" | "sell", mode: "unit" as "unit" | "total", boughtAt: new Date().toISOString().slice(0, 10) });
  const [formQuote, setFormQuote] = useState<{ ticker: string; price: number } | null>(null);

  useEffect(() => {
    const sym = posForm.symbol.trim().toUpperCase().replace(/-USD$/, "");
    if (!sym) { setFormQuote(null); return; }
    const ticker = posForm.crypto ? `${sym}-USD` : sym;
    const t = setTimeout(() => {
      fetch(`/api/quotes?symbols=${encodeURIComponent(ticker)}`).then((r) => r.json())
        .then((j) => { const q = j.quotes?.[0]; setFormQuote(q ? { ticker, price: q.price } : null); })
        .catch(() => setFormQuote(null));
    }, 500);
    return () => clearTimeout(t);
  }, [posForm.symbol, posForm.crypto]);

  const formUnitPrice = (() => {
    const p = Number(posForm.price), q = Number(posForm.qty);
    if (!(p > 0)) return null;
    if (posForm.mode === "total") return q > 0 ? p / q : null;
    return p;
  })();
  const formGap = formQuote && formUnitPrice ? ((formUnitPrice - formQuote.price) / formQuote.price) * 100 : null;
  const [holdingAdvice, setHoldingAdvice] = useState<Record<string, { action: string; actionTH: string; at: string }>>({});
  const [posError, setPosError] = useState("");

  const portfolio = useMemo(() => computeHoldings(positions), [positions]);
  const posPrices = useMemo(() => Object.fromEntries(Object.entries(posQuotes).map(([k, q]) => [k, q.price])), [posQuotes]);
  const holdings = portfolio.open;

  useEffect(() => {
    fetch("/api/positions").then((r) => r.json()).then((j) => setPositions(j.positions ?? [])).catch(() => {});
  }, []);

  const holdingSymbols = holdings.map((h) => h.symbol).sort().join(",");
  useEffect(() => {
    if (!holdingSymbols) return;
    fetch(`/api/quotes?symbols=${encodeURIComponent(holdingSymbols)}`)
      .then((r) => r.json())
      .then((j) => setPosQuotes(Object.fromEntries((j.quotes ?? []).map((q: Quote) => [q.ticker, q]))))
      .catch(() => {});
    Promise.all(holdingSymbols.split(",").map((sym) =>
      fetch(`/api/analysis-cache?symbol=${encodeURIComponent(sym)}`).then((r) => r.json()).then((j) => [sym, j.cache] as const).catch(() => [sym, null] as const)
    )).then((list) => {
      const out: Record<string, { action: string; actionTH: string; at: string }> = {};
      for (const [sym, c] of list) if (c?.result?.positionAdvice) out[sym] = { action: c.result.positionAdvice.action, actionTH: c.result.positionAdvice.actionTH, at: c.createdAt };
      setHoldingAdvice(out);
    });
  }, [holdingSymbols]);

  async function addPosition(e: React.FormEvent) {
    e.preventDefault();
    setPosError("");
    if (!formUnitPrice) return setPosError(posForm.mode === "total" ? "กรอกยอดเงินรวมและจำนวนให้ครบ" : "กรอกราคาให้ถูกต้อง");
    const res = await fetch("/api/positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...posForm, price: formUnitPrice }),
    });
    const j = await res.json();
    if (j.error) return setPosError(j.error);
    setPositions(j.positions ?? []);
    setPosForm((f) => ({ ...f, symbol: "", price: "", qty: "" }));
  }

  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  async function applyPositions(res: Response): Promise<string | null> {
    const j = await res.json().catch(() => ({ error: "เชื่อมต่อไม่ได้" }));
    if (j.error) return j.error;
    setPositions(j.positions ?? []);
    return null;
  }

  async function savePosition(patch: { id: number; price: number; qty: number; boughtAt: string }) {
    return applyPositions(await fetch("/api/positions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }));
  }

  async function deletePosition(id: number) {
    return applyPositions(await fetch(`/api/positions?id=${id}`, { method: "DELETE" }));
  }

  async function removeHolding(symbol: string) {
    await applyPositions(await fetch(`/api/positions?symbol=${encodeURIComponent(symbol)}`, { method: "DELETE" }));
    setConfirmRemove(null);
  }

  function openSymbol(ticker: string, crypto: boolean) {
    const sym = ticker.replace(/-USD$/, "");
    setQuery(sym); setIsCrypto(crypto); setActiveTab("detail"); search(sym, crypto);
  }
  const [query, setQuery] = useState("");
  const [isCrypto, setIsCrypto] = useState(false);
  const [loading, setLoading] = useState(false);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewData, setOverviewData] = useState<MarketOverview | null>(null);
  const [overviewError, setOverviewError] = useState("");

  useEffect(() => {
    fetch("/api/market-overview")
      .then((r) => r.json())
      .then((j) => { if (j.overview) setOverviewData(j.overview); })
      .catch(() => {});
    try {
      const tab = localStorage.getItem("tm.tab");
      const last = JSON.parse(localStorage.getItem("tm.last") ?? "null");
      if (tab === "detail" || tab === "portfolio" || tab === "accuracy") setActiveTab(tab);
      if (last?.symbol) { setQuery(last.symbol); setIsCrypto(!!last.crypto); search(last.symbol, !!last.crypto); }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try { localStorage.setItem("tm.tab", activeTab); } catch {}
  }, [activeTab]);

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
  const [analysisCachedAt, setAnalysisCachedAt] = useState<Date | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [proMode, setProMode] = useState(false);

  useEffect(() => {
    try { setProMode(localStorage.getItem("tm.pro") === "1"); } catch {}
  }, []);

  function toggleMode() {
    setProMode((v) => {
      try { localStorage.setItem("tm.pro", v ? "0" : "1"); } catch {}
      return !v;
    });
  }
  const [chat, setChat] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    try { setShowDetails(localStorage.getItem("tm.details") === "1"); } catch {}
  }, []);

  function toggleDetails() {
    setShowDetails((v) => {
      try { localStorage.setItem("tm.details", v ? "0" : "1"); } catch {}
      return !v;
    });
  }

  async function askAI(question: string) {
    const q = question.trim();
    if (!q || !data || chatLoading) return;
    const next = [...chat, { role: "user" as const, content: q }];
    setChat(next);
    setChatInput("");
    setChatLoading(true);
    const h = holdings.find((x) => x.symbol === data.symbol);
    const ind = data.indicators;
    const context = {
      symbol: data.symbol, name: data.name, price: data.price, changeTodayPct: Number(data.changePct?.toFixed(2)),
      indicators: ind && { rsi: ind.rsi, macdHist: ind.macd.histogram, ma20: ind.ma20, ma50: ind.ma50, support: ind.support, resistance: ind.resistance, volumeRatio: ind.volumeRatio, adx: ind.adx, weekly: ind.weekly, confluence: ind.confluence && { score: ind.confluence.score, signals: ind.confluence.details } },
      market: data.market, beta: data.beta, earnings: data.earnings, sector: data.sector,
      projection10d: data.projection?.points.at(-1),
      analysis: analysis && { suggestion: analysis.suggestion, score: analysis.score, tldr: analysis.tldr, entry: analysis.entryStrategy, targets: analysis.targets, stopLoss: analysis.stopLoss, riskReward: analysis.riskReward, risks: analysis.risks, signals: analysis.signals, positionAdvice: analysis.positionAdvice },
      myPosition: h ? { avgCost: h.avgCost, qty: h.qty, pnlPct: ((data.price - h.avgCost) / h.avgCost) * 100 } : null,
    };
    try {
      const j = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ context, messages: next }) }).then((r) => r.json());
      setChat([...next, { role: "assistant", content: j.reply ?? `ผิดพลาด: ${j.error}` }]);
    } catch {
      setChat([...next, { role: "assistant", content: "เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง" }]);
    } finally {
      setChatLoading(false);
    }
  }

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
    try { localStorage.setItem("tm.last", JSON.stringify({ symbol: sym, crypto })); } catch {}
    setLoading(true);
    setError("");
    setData(null);
    setAnalysis(null);
    setAnalysisCachedAt(null);
    setNews([]);
    setHistory([]);
    setShowHistory(false);
    setChat([]);
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

      // Load cache + history independently so failures don't break the main flow
      const [cacheJson, histJson] = await Promise.all([
        fetch(`/api/analysis-cache?symbol=${ticker}`).then(r => r.json()).catch(() => ({ cache: null })),
        fetch(`/api/analysis-history?symbol=${ticker}`).then(r => r.json()).catch(() => ({ history: [] })),
      ]);
      setHistory(histJson.history ?? []);

      if (cacheJson.cache) {
        setAnalysis(cacheJson.cache.result);
        setAnalysisCachedAt(new Date(cacheJson.cache.createdAt));
      } else {
        await analyze(stockJson, newsItems);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  async function analyze(stockData: StockData, newsItems: NewsItem[]) {
    setAnalyzing(true);
    setAnalysisCachedAt(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...stockData,
          position: holdings.find((h) => h.symbol === stockData.symbol) ?? null,
          news: newsItems,
          analystData: stockData.analystData,
          fearGreed: stockData.fearGreed,
        }),
      });
      const json = await res.json();
      if (!json.error) {
        setAnalysis(json);
        // รีโหลด history หลังวิเคราะห์ใหม่
        fetch(`/api/analysis-history?symbol=${stockData.symbol}`)
          .then(r => r.json()).then(j => setHistory(j.history ?? [])).catch(() => {});
      }
    } finally {
      setAnalyzing(false);
    }
  }

  function formatTimeAgo(date: Date) {
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return `${diff} วินาทีที่แล้ว`;
    if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} ชั่วโมงที่แล้ว`;
    return `${Math.floor(diff / 86400)} วันที่แล้ว`;
  }

  function formatThaiDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  async function deleteHistory(id: number) {
    await fetch(`/api/analysis-cache?id=${id}`, { method: "DELETE" });
    setHistory(prev => prev.filter(h => h.id !== id));
  }

  async function deleteByDate(symbol: string, date: string) {
    await fetch(`/api/analysis-cache?symbol=${symbol}&date=${date}`, { method: "DELETE" });
    setHistory(prev => prev.filter(h => {
      const d = new Date(h.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
      return d !== date;
    }));
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
    <div className="min-h-screen overflow-x-clip text-slate-200">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[#0a0915]/60 backdrop-blur-xl px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 sm:py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="assistant-orb relative grid h-9 w-9 shrink-0 place-items-center rounded-full text-base sm:h-10 sm:w-10 sm:text-lg"><span className="assistant-orb-ring" />📈</div>
            <div>
              <h1 className="whitespace-nowrap text-lg sm:text-xl font-bold bg-gradient-to-r from-white via-violet-200 to-violet-400 bg-clip-text text-transparent">Trade Monitor</h1>
              <p className="hidden text-xs text-slate-500 sm:block">US Stocks & Crypto · Swing Trade Analysis</p>
            </div>
          </div>
          <div className="hidden sm:flex glass backdrop-blur-lg rounded-xl p-1 gap-1">
            <button
              onClick={() => setActiveTab("overview")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${activeTab === "overview" ? "glass-accent text-white" : "text-slate-400 hover:text-white"}`}
            >🌐<span className="hidden sm:inline"> ภาพรวมตลาด</span></button>
            <button
              onClick={() => setActiveTab("detail")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${activeTab === "detail" ? "glass-accent text-white" : "text-slate-400 hover:text-white"}`}
            >🔍<span className="hidden sm:inline"> วิเคราะห์รายตัว</span></button>
            <button
              onClick={() => setActiveTab("portfolio")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${activeTab === "portfolio" ? "glass-accent text-white" : "text-slate-400 hover:text-white"}`}
            >💼<span className="hidden sm:inline"> พอร์ตของฉัน</span>{holdings.length > 0 && <span className="ml-1.5 rounded-full bg-white/15 px-1.5 text-[10px]">{holdings.length}</span>}</button>
            <button
              onClick={() => setActiveTab("accuracy")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${activeTab === "accuracy" ? "glass-accent text-white" : "text-slate-400 hover:text-white"}`}
            >🎯<span className="hidden sm:inline"> ความแม่น AI</span></button>
          </div>
        </div>
        {(() => {
          const quotes = [...(overviewData?.stocks ?? []), ...(overviewData?.cryptos ?? [])];
          if (!quotes.length) return null;
          const row = (k: string) => quotes.map((q) => {
            const sym = q.ticker.replace(/-USD$/, "");
            const crypto = q.ticker.endsWith("-USD");
            return (
              <button key={k + q.ticker} onClick={() => { setQuery(sym); setIsCrypto(crypto); setActiveTab("detail"); search(sym, crypto); }} className="flex shrink-0 items-center gap-2 px-4 text-xs hover:text-white transition">
                <span className="font-semibold text-slate-200">{sym}</span>
                <Sparkline values={q.spark?.slice(-15)} className="h-4 w-12" />
                <span className="font-mono text-slate-300">${q.price < 10 ? q.price.toFixed(3) : q.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                <span className={`font-mono ${q.changePct >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{q.changePct >= 0 ? "▲" : "▼"}{Math.abs(q.changePct).toFixed(2)}%</span>
              </button>
            );
          });
          return (
            <div className="ticker ticker-mask -mx-4 mt-3 -mb-3 sm:-mx-6 sm:-mb-4 overflow-hidden border-t border-white/5 py-2">
              <div className="ticker-track flex w-max" style={{ animationDuration: `${quotes.length * 5}s` }}>{row("a")}{row("b")}</div>
            </div>
          );
        })()}
      </header>

      <main className="route-reveal max-w-7xl mx-auto px-4 pt-6 pb-28 sm:pb-6 space-y-6">

        {/* ===== MARKET OVERVIEW TAB ===== */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <Scorecard
              cost={holdings.reduce((a, h) => a + h.cost, 0)}
              value={holdings.every((h) => posQuotes[h.symbol]) ? holdings.reduce((a, h) => a + h.qty * posQuotes[h.symbol].price, 0) : null}
            />
            <div className="card spotlight p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white mb-1">วิเคราะห์ภาพรวมตลาด</h2>
                <p className="text-xs text-slate-500">AI วิเคราะห์ตลาดโดยรวม + ตัวที่น่าสนใจ + Favorites ของคุณ</p>
                {overviewData?.createdAt && (
                  <p className="text-xs text-violet-300/80 mt-1.5 flex items-center gap-1.5">
                    <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-violet-400" /></span>
                    วิเคราะห์ล่าสุด {formatTimeAgo(new Date(overviewData.createdAt))} · {formatThaiDate(overviewData.createdAt)}
                  </p>
                )}
              </div>
              <button
                onClick={() => loadOverview(favorites)}
                disabled={overviewLoading}
                className="px-6 py-2.5 glass-accent hover:brightness-110 rounded-xl disabled:opacity-50 rounded-lg text-sm font-medium transition flex items-center gap-2"
              >
                {overviewLoading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />กำลังวิเคราะห์...</> : overviewData ? "🔄 วิเคราะห์ใหม่" : "🔍 วิเคราะห์ตอนนี้"}
              </button>
            </div>

            {/* Screener */}
            <div className="card spotlight p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-white">🔎 สแกนหาตัวน่าเข้า</h3>
                  <p className="text-xs text-slate-500">ไล่คำนวณ Confluence Score หุ้นใหญ่ 60 ตัว + Crypto 10 ตัว ด้วยสูตรเดียวกับหน้ารายตัว (ไม่ใช้โควตา AI){scan?.createdAt && <> · สแกนล่าสุด {formatTimeAgo(new Date(scan.createdAt))}</>}</p>
                </div>
                <button onClick={runScanNow} disabled={scanning} className="glass rounded-xl px-4 py-2 text-sm text-violet-200 hover:bg-violet-500/20 disabled:opacity-50 transition">{scanning ? "กำลังสแกน..." : scan ? "🔄 สแกนใหม่" : "🔎 สแกนตอนนี้"}</button>
              </div>
              {scan ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  {scan.rows.slice(0, 10).map((r, i) => (
                    <button key={r.ticker} onClick={() => openSymbol(r.ticker, r.crypto)} title={r.details.join(" · ")} className="glass spotlight relative overflow-hidden rounded-xl p-3 text-left transition hover:bg-violet-500/10">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white"><span className="mr-1.5 font-mono text-xs text-slate-500">#{i + 1}</span>{r.ticker.replace(/-USD$/, "")}</span>
                        <span className={`font-mono text-sm font-bold ${r.score >= 2 ? "text-emerald-300" : r.score <= -2 ? "text-rose-300" : "text-violet-200"}`}>{r.score > 0 ? "+" : ""}{r.score}</span>
                      </div>
                      <Sparkline values={r.spark} className="my-1.5 h-8 w-full" />
                      <div className="flex justify-between font-mono text-[11px] text-slate-400">
                        <span>RSI {r.rsi}</span>
                        <span className={r.perf20d >= 0 ? "text-emerald-300" : "text-rose-300"}>20d {r.perf20d >= 0 ? "+" : ""}{r.perf20d}%</span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">ยังไม่มีผลสแกน กด &quot;สแกนตอนนี้&quot; หรือรอรอบอัตโนมัติ 07:00 น.</p>
              )}
            </div>

            {overviewError && <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-300 text-sm">{overviewError}</div>}

            {overviewLoading && !overviewData && (
              <div className="text-center py-16 text-slate-500">
                <div className="assistant-orb relative mx-auto mb-5 h-14 w-14 rounded-full"><span className="assistant-orb-ring" /></div>
                <p>กำลังดึงข้อมูลตลาดและวิเคราะห์ด้วย AI...</p>
                <p className="text-xs mt-2">อาจใช้เวลา 10-20 วินาที</p>
              </div>
            )}

            {overviewData && (
              <div className={`space-y-6 transition-opacity ${overviewLoading ? "opacity-50 pointer-events-none" : ""}`}>
                {/* Market Mood */}
                <div className="card spotlight glow-ring p-5 rounded-2xl relative overflow-hidden">
                  <span className="glow-ring-edge" />
                  {overviewLoading && <div className="assistant-scan" />}
                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    <h3 className="font-semibold text-white">สถานการณ์ตลาดโดยรวม</h3>
                    <span className={`text-sm font-bold ${moodColor[overviewData.marketMood]}`}>{moodLabel[overviewData.marketMood]}</span>
                    {overviewData.fearGreed && (() => {
                      const s = overviewData.fearGreed!.score;
                      const c = s >= 75 ? "text-green-300 border-green-700 bg-green-900/30" : s >= 56 ? "text-emerald-300 border-emerald-700 bg-emerald-900/30" : s >= 45 ? "text-slate-300 border-slate-600 bg-white/[0.04]" : s >= 25 ? "text-orange-300 border-orange-700 bg-orange-900/30" : "text-red-300 border-red-700 bg-red-900/30";
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
                  {(overviewData.changesSinceLast || overviewData.actionPlan?.length) && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
                      {overviewData.changesSinceLast && (
                        <div className="rounded-xl border border-violet-400/25 bg-violet-500/10 p-3">
                          <p className="text-xs text-violet-300 mb-1">🔁 เปลี่ยนไปจากรอบก่อน</p>
                          <p className="text-sm text-slate-200">{overviewData.changesSinceLast}</p>
                        </div>
                      )}
                      {overviewData.actionPlan?.length ? (
                        <div className="rounded-xl border border-sky-400/25 bg-sky-500/10 p-3">
                          <p className="text-xs text-sky-300 mb-1.5">🎯 แผนวันนี้</p>
                          <ol className="space-y-1">
                            {overviewData.actionPlan.map((a, i) => (
                              <li key={i} className="text-sm text-slate-200 flex gap-2"><span className="font-mono text-sky-300">{i + 1}.</span>{a}</li>
                            ))}
                          </ol>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>

                {/* Stock Picks */}
                {overviewData.stockPicks?.length > 0 && (
                  <div className="card spotlight p-5">
                    <h3 className="font-semibold text-white mb-4">🏢 หุ้น US ที่น่าสนใจ</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {overviewData.stockPicks.map((pick) => (
                        <button
                          key={pick.symbol}
                          onClick={() => { const sym = pick.symbol.replace(/-USD$/, ""); setQuery(sym); setIsCrypto(false); setActiveTab("detail"); search(sym, false); }}
                          className="text-left glass spotlight holo rounded-2xl p-4 transition group overflow-hidden"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <span className="font-bold text-white group-hover:text-violet-300 transition">{pick.symbol}</span>
                              <span className="text-xs text-slate-500 ml-2 block">{pick.name}</span>
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${suggestionBadge[pick.suggestion]}`}>{pick.suggestion === "Buy" ? "ซื้อได้" : pick.suggestion === "Wait" ? "รอจังหวะ" : "หลีกเลี่ยง"}</span>
                          </div>
                          <Sparkline values={[...(overviewData.stocks ?? []), ...(overviewData.cryptos ?? [])].find((q) => q.ticker.replace(/-USD$/, "") === pick.symbol.replace(/-USD$/, ""))?.spark} className="h-10 w-full mb-2" />
                          <p className="text-xs text-slate-400 leading-relaxed mb-2">{pick.reason}</p>
                          <div className="flex justify-between text-xs">
                            <span className={pick.changePct >= 0 ? "text-green-400" : "text-red-400"}>{pick.changePct >= 0 ? "+" : ""}{fmt(pick.changePct)}%</span>
                            <span className="text-slate-500">Score: <span className="text-white">{pick.score}/10</span></span>
                          </div>
                          {pick.entry && <p className="text-xs text-slate-500 mt-1">เข้าได้ที่ <span className="text-violet-300">${fmt(pick.entry)}</span></p>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Crypto Picks */}
                {overviewData.cryptoPicks?.length > 0 && (
                  <div className="card spotlight p-5">
                    <h3 className="font-semibold text-white mb-4">🪙 Crypto ที่น่าสนใจ</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {overviewData.cryptoPicks.map((pick) => (
                        <button
                          key={pick.symbol}
                          onClick={() => { const sym = pick.symbol.replace(/-USD$/, ""); setQuery(sym); setIsCrypto(true); setActiveTab("detail"); search(sym, true); }}
                          className="text-left glass spotlight holo rounded-2xl p-4 transition group overflow-hidden"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <span className="font-bold text-white group-hover:text-orange-300 transition">{pick.symbol.replace(/-USD$/, "")}</span>
                              <span className="text-xs text-slate-500 ml-2 block">{pick.name}</span>
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${suggestionBadge[pick.suggestion]}`}>{pick.suggestion === "Buy" ? "ซื้อได้" : pick.suggestion === "Wait" ? "รอจังหวะ" : "หลีกเลี่ยง"}</span>
                          </div>
                          <Sparkline values={[...(overviewData.stocks ?? []), ...(overviewData.cryptos ?? [])].find((q) => q.ticker.replace(/-USD$/, "") === pick.symbol.replace(/-USD$/, ""))?.spark} className="h-10 w-full mb-2" />
                          <p className="text-xs text-slate-400 leading-relaxed mb-2">{pick.reason}</p>
                          <div className="flex justify-between text-xs">
                            <span className={pick.changePct >= 0 ? "text-green-400" : "text-red-400"}>{pick.changePct >= 0 ? "+" : ""}{fmt(pick.changePct)}%</span>
                            <span className="text-slate-500">Score: <span className="text-white">{pick.score}/10</span></span>
                          </div>
                          {pick.entry && <p className="text-xs text-slate-500 mt-1">เข้าได้ที่ <span className="text-orange-400">${fmt(pick.entry)}</span></p>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Favorites Analysis */}
                {overviewData.favoritesAnalysis?.length > 0 && (
                  <div className="card spotlight p-5">
                    <h3 className="font-semibold text-white mb-4">⭐ สถานการณ์ Favorites ของคุณ</h3>
                    <div className="space-y-3">
                      {overviewData.favoritesAnalysis.map((fav) => {
                        const favInfo = favorites.find((f) => f.symbol.replace(/-USD$/, "").toUpperCase() === fav.symbol.replace(/-USD$/, "").toUpperCase());
                        return (
                          <button
                            key={fav.symbol}
                            onClick={() => { const sym = fav.symbol.replace(/-USD$/, ""); setQuery(sym); setIsCrypto(favInfo?.crypto ?? false); setActiveTab("detail"); search(sym, favInfo?.crypto ?? false); }}
                            className="w-full text-left glass spotlight rounded-2xl p-4 transition"
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
                  <div className="card spotlight p-5 text-center text-slate-500 text-sm">
                    <p>ยังไม่มี Favorites — ไปที่ &quot;วิเคราะห์รายตัว&quot; แล้วกด ☆ เพื่อเพิ่ม</p>
                  </div>
                )}
              </div>
            )}

            {!overviewData && !overviewLoading && (
              <div className="text-center py-16 text-slate-600">
                <div className="text-5xl mb-4">🌐</div>
                <p className="text-lg text-slate-500">กด &quot;วิเคราะห์ตอนนี้&quot; เพื่อดูภาพรวมตลาด</p>
                <p className="text-sm mt-2 text-slate-600">AI จะวิเคราะห์ตลาด US stocks + crypto และ Favorites ของคุณ</p>
              </div>
            )}
          </div>
        )}

        {/* ===== PORTFOLIO TAB ===== */}
        {activeTab === "portfolio" && (() => {
          const rows = holdings.map((h) => {
            const q = posQuotes[h.symbol];
            const price = q?.price ?? null;
            const value = price != null ? price * h.qty : null;
            const pnl = value != null ? value - h.cost : null;
            const pnlPct = pnl != null ? (pnl / h.cost) * 100 : null;
            const dayPnl = price != null && q ? h.qty * price * (q.changePct / (100 + q.changePct)) : null;
            return { h, q, price, value, pnl, pnlPct, dayPnl };
          }).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
          const totalCost = rows.reduce((a, r) => a + r.h.cost, 0);
          const totalValue = rows.reduce((a, r) => a + (r.value ?? r.h.cost), 0);
          const totalPnl = totalValue - totalCost;
          const totalPct = totalCost ? (totalPnl / totalCost) * 100 : 0;
          const dayPnl = rows.reduce((a, r) => a + (r.dayPnl ?? 0), 0);
          const up = totalPnl >= 0;
          return (
            <div className="space-y-6">
              {/* Portfolio hero */}
              <div className="card spotlight glow-ring relative overflow-hidden rounded-2xl p-6">
                <span className="glow-ring-edge" />
                <div className="page-header-grid pointer-events-none absolute inset-y-0 right-0 w-1/2" />
                <p className="text-xs uppercase tracking-widest text-slate-400">มูลค่าพอร์ตรวม</p>
                <div className="mt-1 flex flex-wrap items-end gap-x-6 gap-y-2">
                  <span className="font-mono text-4xl sm:text-5xl font-bold bg-gradient-to-r from-white via-violet-100 to-violet-300 bg-clip-text text-transparent">{money(totalValue)}</span>
                  <span className={`font-mono text-lg font-semibold ${up ? "text-emerald-300" : "text-rose-300"}`}>{up ? "▲" : "▼"} {money(totalPnl)} ({totalPct >= 0 ? "+" : ""}{totalPct.toFixed(2)}%)</span>
                </div>
                <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div className="glass rounded-xl p-3"><p className="text-xs text-slate-400">ต้นทุนรวม</p><p className="font-mono text-white">{money(totalCost)}</p></div>
                  <div className="glass rounded-xl p-3"><p className="text-xs text-slate-400">วันนี้</p><p className={`font-mono ${dayPnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{dayPnl >= 0 ? "+" : ""}{money(dayPnl)}</p></div>
                  <div className="glass rounded-xl p-3"><p className="text-xs text-slate-400">กำไรที่ขายแล้ว</p><p className={`font-mono ${portfolio.realizedTotal >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{portfolio.realizedTotal >= 0 ? "+" : ""}{money(portfolio.realizedTotal)}</p></div>
                  <div className="glass rounded-xl p-3"><p className="text-xs text-slate-400">ถือ {holdings.length} ตัว · กำไร / ขาดทุน</p><p className="font-mono text-white"><span className="text-emerald-300">{rows.filter((r) => (r.pnl ?? 0) > 0).length}</span> / <span className="text-rose-300">{rows.filter((r) => (r.pnl ?? 0) < 0).length}</span></p></div>
                </div>
                {totalValue > 0 && (
                  <div className="mt-5">
                    <p className="mb-2 text-xs text-slate-400">สัดส่วนพอร์ต</p>
                    <div className="flex h-2.5 overflow-hidden rounded-full bg-white/5">
                      {rows.map((r, i) => (
                        <div key={r.h.symbol} title={r.h.symbol} className="grow-x h-full" style={{ width: `${((r.value ?? r.h.cost) / totalValue) * 100}%`, background: `hsl(${265 - i * 38} 80% ${68 - (i % 2) * 10}%)`, animationDelay: `${i * 80}ms` }} />
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                      {rows.map((r, i) => (
                        <span key={r.h.symbol} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: `hsl(${265 - i * 38} 80% ${68 - (i % 2) * 10}%)` }} />{r.h.symbol.replace(/-USD$/, "")} {(((r.value ?? r.h.cost) / totalValue) * 100).toFixed(1)}%</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <ConcentrationWarnings items={rows.map((r) => ({ symbol: r.h.symbol, value: r.value ?? r.h.cost }))} />

              {/* Add position */}
              <form onSubmit={addPosition} className="card spotlight p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-semibold text-white">{posForm.side === "buy" ? "➕ บันทึกการซื้อ" : "➖ บันทึกการขาย"}</h3>
                  <div className="flex glass rounded-xl p-1 gap-1">
                    <button type="button" onClick={() => setPosForm((f) => ({ ...f, side: "buy" }))} className={`px-4 py-1.5 rounded-lg text-sm transition ${posForm.side === "buy" ? "bg-emerald-500/80 text-white shadow-lg shadow-emerald-500/30" : "text-slate-400"}`}>ซื้อ</button>
                    <button type="button" onClick={() => setPosForm((f) => ({ ...f, side: "sell" }))} className={`px-4 py-1.5 rounded-lg text-sm transition ${posForm.side === "sell" ? "bg-rose-500/80 text-white shadow-lg shadow-rose-500/30" : "text-slate-400"}`}>ขาย</button>
                  </div>
                </div>
                {posForm.side === "sell" && holdings.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2 text-xs">
                    <span className="text-slate-500">เลือกตัวที่ถือ:</span>
                    {holdings.map((h) => (
                      <button type="button" key={h.symbol} onClick={() => setPosForm((f) => ({ ...f, symbol: h.symbol.replace(/-USD$/, ""), crypto: h.crypto, qty: String(h.qty), price: posQuotes[h.symbol] ? String(posQuotes[h.symbol].price) : f.price }))} className="glass rounded-full px-3 py-1 hover:bg-rose-500/20 transition">
                        {h.symbol.replace(/-USD$/, "")} <span className="text-slate-500">({h.qty.toLocaleString(undefined, { maximumFractionDigits: 6 })})</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
                  <div className="col-span-2 lg:col-span-1 flex glass rounded-xl p-1 gap-1 h-fit">
                    <button type="button" onClick={() => setPosForm((f) => ({ ...f, crypto: false }))} className={`flex-1 px-3 py-1.5 rounded-lg text-sm transition ${!posForm.crypto ? "glass-accent text-white" : "text-slate-400"}`}>หุ้น US</button>
                    <button type="button" onClick={() => setPosForm((f) => ({ ...f, crypto: true }))} className={`flex-1 px-3 py-1.5 rounded-lg text-sm transition ${posForm.crypto ? "bg-gradient-to-br from-amber-400 to-orange-600 text-white" : "text-slate-400"}`}>Crypto</button>
                  </div>
                  <label className="text-xs text-slate-400">ชื่อ<input value={posForm.symbol} onChange={(e) => setPosForm((f) => ({ ...f, symbol: e.target.value.toUpperCase() }))} placeholder={posForm.crypto ? "BTC" : "NVDA"} className="mt-1 w-full glass rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/60" /></label>
                  <label className="text-xs text-slate-400">{posForm.mode === "total" ? (posForm.side === "buy" ? "ยอดเงินที่จ่ายรวม ($)" : "ยอดเงินที่ได้รวม ($)") : posForm.side === "buy" ? "ราคาที่ซื้อ ต่อหน่วย ($)" : "ราคาที่ขาย ต่อหน่วย ($)"}<input type="number" step="any" min="0" value={posForm.price} onChange={(e) => setPosForm((f) => ({ ...f, price: e.target.value }))} placeholder="0.00" className="mt-1 w-full glass rounded-xl px-3 py-2 font-mono text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/60" /></label>
                  <label className="text-xs text-slate-400">จำนวน<input type="number" step="any" min="0" value={posForm.qty} onChange={(e) => setPosForm((f) => ({ ...f, qty: e.target.value }))} placeholder="0" className="mt-1 w-full glass rounded-xl px-3 py-2 font-mono text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/60" /></label>
                  <label className="text-xs text-slate-400">{posForm.side === "buy" ? "วันที่ซื้อ" : "วันที่ขาย"}<input type="date" value={posForm.boughtAt} onChange={(e) => setPosForm((f) => ({ ...f, boughtAt: e.target.value }))} className="mt-1 w-full glass rounded-xl px-3 py-2 text-sm text-white [color-scheme:dark] focus:outline-none focus:ring-2 focus:ring-violet-500/60" /></label>
                  <button type="submit" className={`col-span-2 lg:col-span-1 rounded-xl px-5 py-2 text-sm font-medium hover:brightness-110 transition ${posForm.side === "buy" ? "glass-accent" : "bg-gradient-to-br from-rose-400 to-rose-600 shadow-lg shadow-rose-500/30"}`}>{posForm.side === "buy" ? "บันทึกซื้อ" : "บันทึกขาย"}</button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                  <div className="flex glass rounded-full p-0.5">
                    <button type="button" onClick={() => setPosForm((f) => ({ ...f, mode: "unit" }))} className={`rounded-full px-3 py-1 transition ${posForm.mode === "unit" ? "glass-accent text-white" : "text-slate-400"}`}>กรอกราคาต่อหน่วย</button>
                    <button type="button" onClick={() => setPosForm((f) => ({ ...f, mode: "total" }))} className={`rounded-full px-3 py-1 transition ${posForm.mode === "total" ? "glass-accent text-white" : "text-slate-400"}`}>กรอกยอดเงินรวม</button>
                  </div>
                  {formQuote && (
                    <span className="text-slate-400">
                      ราคาตลาด {formQuote.ticker.replace(/-USD$/, "")} ตอนนี้ <span className="font-mono text-slate-200">{money(formQuote.price)}</span>
                      {posForm.mode === "unit" && <button type="button" onClick={() => setPosForm((f) => ({ ...f, price: String(formQuote.price) }))} className="ml-2 text-violet-300 underline-offset-2 hover:underline">ใช้ราคานี้</button>}
                    </span>
                  )}
                </div>
                {formUnitPrice && Number(posForm.qty) > 0 && (
                  <p className="mt-2 text-xs text-slate-400">
                    {posForm.mode === "total"
                      ? <>คิดเป็นราคาต่อหน่วย <span className="font-mono text-violet-200">{money(formUnitPrice)}</span></>
                      : <>มูลค่ารายการนี้ <span className="font-mono text-violet-200">{money(formUnitPrice * Number(posForm.qty))}</span></>}
                  </p>
                )}
                {formGap != null && Math.abs(formGap) > 50 && (
                  <div className="mt-3 rounded-xl border border-amber-300/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
                    ⚠ ราคาต่อหน่วยที่ได้ ({money(formUnitPrice!)}) {formGap < 0 ? "ต่ำกว่า" : "สูงกว่า"}ราคาตลาด {Math.abs(formGap).toFixed(0)}%
                    {posForm.mode === "unit" ? " คุณกรอกยอดเงินรวมหรือเปล่า? ถ้าใช่ กด \"กรอกยอดเงินรวม\" ด้านบน" : " ตรวจจำนวนหน่วยอีกครั้ง"}
                  </div>
                )}
                {posError && <p className="mt-3 text-sm text-rose-300">{posError}</p>}
              </form>

              {/* Holdings */}
              {rows.length === 0 ? (
                <div className="card p-10 text-center text-slate-400">
                  <div className="text-4xl mb-3">💼</div>
                  <p>ยังไม่มีรายการ บันทึกการซื้อด้านบนเพื่อเริ่มติดตามพอร์ต</p>
                  <p className="mt-1 text-xs text-slate-500">ซื้อตัวเดิมหลายครั้งได้ ระบบจะคิดต้นทุนเฉลี่ยให้ ขายแล้วจะคิดกำไรที่ได้จริง</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {rows.map(({ h, q, price, value, pnl, pnlPct }) => {
                    const good = (pnl ?? 0) >= 0;
                    return (
                      <div key={h.symbol} className="card spotlight holo relative overflow-hidden rounded-2xl p-5">
                        <span className="holo-sheen" />
                        <div className="flex items-start justify-between gap-3">
                          <button onClick={() => openSymbol(h.symbol, h.crypto)} className="text-left group">
                            <p className="text-xl font-bold text-white group-hover:text-violet-300 transition">{h.symbol.replace(/-USD$/, "")} <span className="text-xs font-normal text-slate-500">{q?.name ?? h.name ?? ""}</span></p>
                            <p className="font-mono text-sm text-slate-400">{h.qty.toLocaleString(undefined, { maximumFractionDigits: 6 })} หน่วย · ต้นทุนเฉลี่ย {money(h.avgCost)}</p>
                          </button>
                          <div className="text-right">
                            <p className="font-mono text-lg text-white">{value != null ? money(value) : "…"}</p>
                            {pnl != null && <p className={`font-mono text-sm ${good ? "text-emerald-300" : "text-rose-300"}`}>{good ? "+" : ""}{money(pnl)} ({pnlPct! >= 0 ? "+" : ""}{pnlPct!.toFixed(2)}%)</p>}
                          </div>
                        </div>
                        {holdingAdvice[h.symbol] && (() => {
                          const a = holdingAdvice[h.symbol];
                          const tone = a.action === "CutLoss" ? "border-rose-400/40 bg-rose-500/15 text-rose-200" : a.action === "TakeProfit" ? "border-amber-300/40 bg-amber-400/15 text-amber-200" : a.action === "AddMore" ? "border-sky-300/40 bg-sky-400/15 text-sky-200" : "border-emerald-300/40 bg-emerald-400/15 text-emerald-200";
                          return <p className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${tone}`}>🤖 {a.actionTH} <span className="opacity-60">· {formatTimeAgo(new Date(a.at))}</span></p>;
                        })()}
                        <div className="relative mt-3">
                          <Sparkline values={q?.spark} className="h-14 w-full" />
                          {q?.spark && (() => {
                            const min = Math.min(...q.spark), max = Math.max(...q.spark);
                            if (h.avgCost < min || h.avgCost > max) return null;
                            const y = 100 - ((h.avgCost - min) / (max - min || 1)) * 93 - 3;
                            return <div className="absolute inset-x-0 border-t border-dashed border-amber-300/70" style={{ top: `${y}%` }}><span className="absolute -top-4 right-0 text-[10px] text-amber-200">ต้นทุน</span></div>;
                          })()}
                        </div>
                        <div className="mt-3 flex items-center justify-between text-xs">
                          <span className="text-slate-400">ราคาตอนนี้ <span className="font-mono text-slate-200">{price != null ? money(price) : "…"}</span>{q && <span className={q.changePct >= 0 ? "text-emerald-300" : "text-rose-300"}> {q.changePct >= 0 ? "▲" : "▼"}{Math.abs(q.changePct).toFixed(2)}%</span>}</span>
                          <button onClick={() => openSymbol(h.symbol, h.crypto)} className="glass rounded-full px-3 py-1 text-violet-200 hover:bg-violet-500/20 transition">🔮 วิเคราะห์แนวโน้ม</button>
                        </div>
                        <details className="mt-3 text-sm">
                          <summary className="cursor-pointer select-none text-xs text-violet-300/90 hover:text-violet-200">📝 แก้ไข / ลบ รายการซื้อขาย ({h.lots.length})</summary>
                          <div className="mt-2 space-y-1.5">
                            {h.lots.map((l) => (
                              <LotRow key={`${l.id}-${l.price}-${l.qty}-${l.bought_at}`} lot={l} money={money} onSave={savePosition} onDelete={deletePosition} />
                            ))}
                            <div className="flex justify-end pt-1">
                              {confirmRemove === h.symbol ? (
                                <span className="flex items-center gap-2 text-xs">
                                  <span className="text-rose-200">ลบ {h.symbol.replace(/-USD$/, "")} ทั้งหมด {h.lots.length} รายการ?</span>
                                  <button onClick={() => setConfirmRemove(null)} className="glass rounded-lg px-2.5 py-1 text-slate-300">ไม่</button>
                                  <button onClick={() => removeHolding(h.symbol)} className="rounded-lg bg-rose-500/80 px-2.5 py-1 text-white">ลบทั้งหมด</button>
                                </span>
                              ) : (
                                <button onClick={() => setConfirmRemove(h.symbol)} className="text-xs text-slate-500 hover:text-rose-300 transition">🗑 ลบ {h.symbol.replace(/-USD$/, "")} ออกจากพอร์ตทั้งตัว</button>
                              )}
                            </div>
                          </div>
                        </details>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Sales history vs AI */}
              {portfolio.sales.length > 0 && (
                <div className="card spotlight p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold text-white">🧾 ประวัติการขาย</h3>
                    {(() => {
                      const judged = portfolio.sales.filter((x) => x.ai_action || x.ai_suggestion);
                      const agree = judged.filter((x) => x.ai_action === "CutLoss" || x.ai_action === "TakeProfit" || (!x.ai_action && x.ai_suggestion === "Avoid")).length;
                      return judged.length ? <span className="text-xs text-slate-400">ขายตรงกับ AI {agree}/{judged.length} ครั้ง</span> : null;
                    })()}
                  </div>
                  <div className="space-y-2">
                    {portfolio.sales.map((x) => {
                      const aiSaysSell = x.ai_action === "CutLoss" || x.ai_action === "TakeProfit" || (!x.ai_action && x.ai_suggestion === "Avoid");
                      const aiLabel = x.ai_action_th ?? (x.ai_suggestion === "Buy" ? "ซื้อได้" : x.ai_suggestion === "Wait" ? "รอจังหวะ" : x.ai_suggestion === "Avoid" ? "หลีกเลี่ยง" : null);
                      return (
                        <div key={x.id} className="space-y-2 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-semibold text-white">{x.symbol.replace(/-USD$/, "")} <span className="font-mono text-xs font-normal text-slate-500">ทุน {money(x.avgCostAtSale)}</span></p>
                            <div className="flex flex-wrap items-center gap-2">
                              {aiLabel && <span className={`rounded-full border px-2.5 py-0.5 text-xs ${aiSaysSell ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-200" : "border-amber-300/30 bg-amber-400/10 text-amber-200"}`}>AI ตอนนั้น: {aiLabel} {aiSaysSell ? "✓ ตรง" : "↔ สวน"}</span>}
                              <span className={`font-mono font-semibold ${x.realized >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{x.realized >= 0 ? "+" : ""}{money(x.realized)} ({x.realizedPct >= 0 ? "+" : ""}{x.realizedPct.toFixed(1)}%)</span>
                            </div>
                          </div>
                          <LotRow key={`${x.id}-${x.price}-${x.qty}-${x.bought_at}`} lot={x} money={money} onSave={savePosition} onDelete={deletePosition} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <JournalCard positions={positions} prices={posPrices} />
            </div>
          );
        })()}

        {/* ===== ACCURACY TAB ===== */}
        {activeTab === "accuracy" && (
          <div className="space-y-6">
            <div className="card spotlight glow-ring relative overflow-hidden rounded-2xl p-6">
              <span className="glow-ring-edge" />
              <div className="page-header-grid pointer-events-none absolute inset-y-0 right-0 w-1/2" />
              <h2 className="text-lg font-bold text-white">🎯 AI แม่นแค่ไหน</h2>
              <p className="mt-1 text-xs text-slate-400">ระบบย้อนกลับไปเช็กทุกคำแนะนำที่เก่ากว่า 1 วัน ว่าราคาหลัง 7 และ 14 วันไปทางไหน และชน TP1 หรือ Stop Loss ก่อน (นับวันละครั้งต่อตัว)</p>
              {accuracyLoading && <div className="mt-6 flex items-center gap-3 text-sm text-slate-400"><div className="assistant-orb relative h-8 w-8 rounded-full"><span className="assistant-orb-ring" /></div>กำลังย้อนเช็กราคา...</div>}
              {accuracy && (
                <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {([
                    ["ความแม่นรวม", accuracy.overall.winRate != null ? `${accuracy.overall.winRate}%` : "–", `${accuracy.overall.evaluated} คำแนะนำที่วัดผลได้`],
                    ["แนะนำ 'ซื้อได้' แล้วขึ้น", accuracy.buy.winRate != null ? `${accuracy.buy.winRate}%` : "–", `ชน TP1 ${accuracy.buy.tpHits} · ชน SL ${accuracy.buy.slHits}`],
                    ["ผลตอบแทนเฉลี่ย 'ซื้อได้'", accuracy.buy.avgRet14 != null ? `${accuracy.buy.avgRet14 >= 0 ? "+" : ""}${accuracy.buy.avgRet14}%` : "–", `14 วัน · 7 วัน ${accuracy.buy.avgRet7 ?? "–"}%`],
                    ["คะแนน ≥7 vs <7", `${accuracy.buyHighScore.winRate ?? "–"}% / ${accuracy.buyLowScore.winRate ?? "–"}%`, "อัตราถูกเมื่อ AI มั่นใจสูง vs ต่ำ"],
                  ] as const).map(([label, value, sub]) => (
                    <div key={label} className="glass rounded-xl p-4">
                      <p className="text-xs text-slate-400">{label}</p>
                      <p className="mt-1 font-mono text-2xl font-bold text-white">{value}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{sub}</p>
                    </div>
                  ))}
                </div>
              )}
              {accuracy && accuracy.overall.evaluated < 10 && (
                <p className="mt-4 text-xs text-amber-200/80">ข้อมูลยังน้อย ({accuracy.overall.evaluated} รายการ) ตัวเลขยังเชื่อถือไม่ได้ จะแม่นขึ้นเมื่อสะสมเกิน 20–30 รายการ ซึ่ง cron 07:00 น. จะช่วยเพิ่มให้ทุกวัน</p>
              )}
            </div>

            {accuracy && accuracy.recent.length > 0 && (
              <div className="card spotlight p-5">
                <h3 className="mb-4 font-semibold text-white">คำแนะนำย้อนหลัง</h3>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead><tr className="text-left text-xs text-slate-500">
                      <th className="pb-2 font-normal">วันที่</th><th className="pb-2 font-normal">ตัว</th><th className="pb-2 font-normal">AI บอก</th>
                      <th className="pb-2 text-right font-normal">ราคาตอนนั้น</th><th className="pb-2 text-right font-normal">7 วัน</th><th className="pb-2 text-right font-normal">14 วัน</th><th className="pb-2 text-center font-normal">ผล</th>
                    </tr></thead>
                    <tbody>
                      {accuracy.recent.map((r, i) => (
                        <tr key={i} className="border-t border-white/5">
                          <td className="py-2 text-slate-400">{new Date(r.date + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short" })}</td>
                          <td className="py-2"><button onClick={() => openSymbol(r.symbol, r.symbol.endsWith("-USD"))} className="font-semibold text-white hover:text-violet-300">{r.symbol.replace(/-USD$/, "")}</button></td>
                          <td className="py-2"><span className={`rounded-full px-2 py-0.5 text-xs ${suggestionBadge[r.suggestion as "Buy" | "Wait" | "Avoid"] ?? ""}`}>{r.suggestion === "Buy" ? "ซื้อได้" : r.suggestion === "Wait" ? "รอจังหวะ" : "หลีกเลี่ยง"}{r.score != null && ` ${r.score}`}</span></td>
                          <td className="py-2 text-right font-mono text-slate-300">{money(r.entry)}</td>
                          {[r.ret7, r.ret14].map((v, j) => <td key={j} className={`py-2 text-right font-mono ${v == null ? "text-slate-600" : v >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{v == null ? "รอ" : `${v >= 0 ? "+" : ""}${v}%`}</td>)}
                          <td className="py-2 text-center">{r.hit === "tp" ? "🎯 TP" : r.hit === "sl" ? "🛑 SL" : r.correct === true ? "✅" : r.correct === false ? "❌" : <span className="text-slate-600">–</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== DETAIL TAB ===== */}
        {activeTab === "detail" && (
          <div className="space-y-6">
        {/* Search */}
        <div className="card spotlight p-5">
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="flex glass backdrop-blur-lg rounded-xl p-1 gap-1 sm:w-auto">
              <button onClick={() => setIsCrypto(false)} className={`flex-1 sm:flex-none px-4 py-1.5 rounded-md text-sm font-medium transition ${!isCrypto ? "glass-accent text-white" : "text-slate-400 hover:text-white"}`}>US Stocks</button>
              <button onClick={() => setIsCrypto(true)} className={`flex-1 sm:flex-none px-4 py-1.5 rounded-md text-sm font-medium transition ${isCrypto ? "bg-gradient-to-br from-amber-400 to-orange-600 text-white shadow-lg shadow-orange-500/30" : "text-slate-400 hover:text-white"}`}>Crypto</button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); if (query.trim()) search(query.trim(), isCrypto); }} className="flex min-w-0 flex-1 gap-2">
              <input value={query} onChange={(e) => setQuery(e.target.value.toUpperCase())} placeholder={isCrypto ? "เช่น BTC, ETH, SOL..." : "เช่น AAPL, NVDA, TSLA..."} className="min-w-0 flex-1 glass rounded-xl px-4 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/60" />
              <button type="submit" disabled={loading} className="px-5 py-2 glass-accent hover:brightness-110 rounded-xl text-sm font-medium disabled:opacity-50 transition">{loading ? "กำลังโหลด..." : "วิเคราะห์"}</button>
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
              <button key={p.symbol} onClick={() => { setQuery(p.symbol); setIsCrypto(p.crypto); search(p.symbol, p.crypto); }} className="px-3 py-1 glass hover:bg-violet-500/20 hover:border-violet-400/40 rounded-full text-xs transition">{p.label}</button>
            ))}
          </div>
        </div>

        {error && <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 text-red-300 text-sm">{error}</div>}

        {data && (
          <>
            {/* 5-second summary */}
            {(() => {
              const sug = analysis?.suggestion ?? (data.indicators?.confluence ? (data.indicators.confluence.score >= 2 ? "Buy" : data.indicators.confluence.score <= -2 ? "Avoid" : "Wait") : null);
              const light = sug === "Buy" ? { c: "#34d399", glow: "rgba(52,211,153,0.55)", label: analysis?.suggestionTH ?? "เอียงซื้อ" } : sug === "Avoid" ? { c: "#fb7185", glow: "rgba(251,113,133,0.55)", label: analysis?.suggestionTH ?? "เอียงขาย" } : { c: "#fbbf24", glow: "rgba(251,191,36,0.5)", label: analysis?.suggestionTH ?? "รอจังหวะ" };
              const h = holdings.find((x) => x.symbol === data.symbol);
              const line = analysis?.oneLiner || analysis?.tldr;
              return (
                <div className="card spotlight glow-ring relative overflow-hidden rounded-2xl p-5 sm:p-6">
                  <span className="glow-ring-edge" />
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-4 sm:flex-col sm:gap-2">
                      <div className="relative grid h-14 w-14 shrink-0 place-items-center rounded-full sm:h-20 sm:w-20" style={{ background: `radial-gradient(circle at 35% 30%, #fff8, ${light.c} 45%, #0008 100%)`, boxShadow: `0 0 40px ${light.glow}, inset 0 0 0 1px #fff4` }}>
                        {analyzing && <span className="absolute inset-0 animate-ping rounded-full" style={{ background: light.glow }} />}
                        <span className="text-2xl">{sug === "Buy" ? "▲" : sug === "Avoid" ? "▼" : "◆"}</span>
                      </div>
                      <p className="text-lg font-bold sm:text-center" style={{ color: light.c }}>{light.label}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs uppercase tracking-widest text-slate-400">สรุป 5 วินาที · {data.symbol.replace(/-USD$/, "")}</p>
                      <p className="mt-1 text-xl font-semibold leading-snug text-white sm:text-2xl">
                        {analyzing && !line ? "กำลังให้ AI สรุป..." : line ?? "ยังไม่มีผลวิเคราะห์ กดวิเคราะห์เพื่อรับคำแนะนำ"}
                      </p>
                      {analysis?.confidenceNote && <p className="mt-2 text-sm text-slate-400">💭 {analysis.confidenceNote}</p>}
                      {analysis?.changeFromLast && <p className="mt-1 text-sm text-violet-300/90">🔁 {analysis.changeFromLast}</p>}
                      <SetupBadge setup={analysis?.setup} reason={analysis?.setupReason} stat={analysis?.setup ? setupStats?.[analysis.setup] : null} />
                      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {[
                          ["จุดเข้า", analysis?.entryStrategy?.first, "text-emerald-200"],
                          ["เป้า TP1", analysis?.targets?.tp1, "text-sky-200"],
                          ["Stop Loss", h && analysis?.positionAdvice?.stopForPosition != null ? analysis.positionAdvice.stopForPosition : analysis?.stopLoss, "text-rose-200"],
                          [h ? "กำไร/ขาดทุนของคุณ" : "คะแนน AI", h ? null : analysis?.score, "text-violet-200"],
                        ].map(([label, v, tone], i) => (
                          <div key={i} className="glass rounded-xl px-3 py-2">
                            <p className="text-[11px] text-slate-400">{label as string}</p>
                            {i === 3 && h ? (
                              <p className={`font-mono text-base font-semibold ${data.price >= h.avgCost ? "text-emerald-300" : "text-rose-300"}`}>{data.price >= h.avgCost ? "+" : ""}{(((data.price - h.avgCost) / h.avgCost) * 100).toFixed(1)}%</p>
                            ) : (
                              <p className={`font-mono text-base font-semibold ${tone as string}`}>{v == null ? "–" : i === 3 ? `${v}/10` : `$${fmt(v)}`}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  {analysis?.odds && (() => {
                    const o = analysis.odds;
                    return (
                      <div className="mt-4">
                        <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-xs">
                          <span className="text-slate-400">🎲 ถ้าเข้าตามแผน ใน {o.horizon} วันทำการ (จำลอง 2,000 แบบจากความผันผวนจริง)</span>
                          <span className={`font-mono font-semibold ${o.expectedPct >= 0 ? "text-emerald-300" : "text-rose-300"}`}>คาดหวัง {o.expectedPct >= 0 ? "+" : ""}{o.expectedPct}%</span>
                        </div>
                        <div className="flex h-3 overflow-hidden rounded-full text-[0px]">
                          <div className="grow-x bg-emerald-400/80" style={{ width: `${o.pTarget}%` }} />
                          <div className="bg-white/15" style={{ width: `${o.pOpen}%` }} />
                          <div className="bg-rose-400/80" style={{ width: `${o.pStop}%` }} />
                        </div>
                        <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-[11px]">
                          <span className="text-emerald-300">ถึง TP1 ก่อน {o.pTarget}%</span>
                          <span className="text-slate-400">ยังไม่ถึงทั้งคู่ {o.pOpen}%</span>
                          <span className="text-rose-300">โดน Stop ก่อน {o.pStop}%</span>
                        </div>
                        <OddsOutOfTen pTarget={o.pTarget} pStop={o.pStop} pOpen={o.pOpen} />
                      </div>
                    );
                  })()}
                  <EarningsBanner earnings={data.earnings} />
                  <div className="mt-5 flex flex-wrap gap-2">
                    <button onClick={toggleDetails} className="glass rounded-full px-4 py-1.5 text-sm text-slate-200 hover:bg-violet-500/20 transition">{showDetails ? "▲ ซ่อนรายละเอียด" : "▼ ดูรายละเอียดทั้งหมด"}</button>
                    {!analyzing && <button onClick={() => analyze(data, news)} className="glass rounded-full px-4 py-1.5 text-sm text-violet-200 hover:bg-violet-500/20 transition">🔄 วิเคราะห์ใหม่</button>}
                    <a href="#ask-ai" className="glass rounded-full px-4 py-1.5 text-sm text-sky-200 hover:bg-sky-500/20 transition">💬 ถาม AI</a>
                  </div>
                </div>
              );
            })()}

            <PositionSizer
              symbol={data.symbol}
              crypto={data.symbol.endsWith("-USD")}
              entry={Number(analysis?.entryStrategy?.first) > 0 ? Number(analysis!.entryStrategy!.first) : null}
              stop={Number(analysis?.stopLoss) > 0 ? Number(analysis!.stopLoss) : null}
              target={Number(analysis?.targets?.tp1) > 0 ? Number(analysis!.targets!.tp1) : null}
            />

            {/* Quote Header */}
            <div className="card spotlight glow-ring p-5 rounded-2xl">
              <span className="glow-ring-edge" />
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
                      const color = s >= 75 ? "text-green-300 border-green-700 bg-green-900/30" : s >= 56 ? "text-emerald-300 border-emerald-700 bg-emerald-900/30" : s >= 45 ? "text-slate-300 border-slate-600 bg-white/[0.04]" : s >= 25 ? "text-orange-300 border-orange-700 bg-orange-900/30" : "text-red-300 border-red-700 bg-red-900/30";
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
              {data.indicators?.confluence && (() => {
                const c = data.indicators.confluence;
                const pct = ((c.score + 7) / 14) * 100;
                const label: Record<string, string> = { strong_buy: "แรงซื้อชัดเจน", buy: "เอียงซื้อ", neutral: "เป็นกลาง", sell: "เอียงขาย", strong_sell: "แรงขายชัดเจน" };
                const tone = c.score >= 2 ? "text-emerald-300" : c.score <= -2 ? "text-rose-300" : "text-violet-200";
                return (
                  <div className="mt-5 pt-5 border-t border-white/5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] items-center">
                    <div>
                      <div className="flex items-baseline justify-between mb-2">
                        <span className="text-xs uppercase tracking-widest text-slate-400"><Term id="confluence">Confluence Score</Term></span>
                        <span className={`font-mono text-2xl font-bold ${tone}`}>{c.score > 0 ? "+" : ""}{c.score}<span className="text-sm text-slate-500">/7</span> <span className="text-sm font-sans">{label[c.signal]}</span></span>
                      </div>
                      <div className="relative h-2.5 rounded-full bg-gradient-to-r from-rose-500/70 via-violet-500/40 to-emerald-400/80">
                        <div className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_16px_rgba(196,181,253,0.9)] ring-4 ring-violet-500/40 transition-all duration-700" style={{ left: `${pct}%` }} />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {c.details.map((d, i) => (
                          <span key={i} className={`text-[11px] px-2 py-0.5 rounded-full border ${d.includes(" +") ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-rose-400/30 bg-rose-400/10 text-rose-200"}`}>{d}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex sm:flex-col gap-2 text-xs">
                      {data.indicators.weekly && <span className="glass rounded-lg px-3 py-1.5"><Term id="weekly">Weekly</Term> <b className={data.indicators.weekly.trend === "bullish" ? "text-emerald-300" : "text-rose-300"}>{data.indicators.weekly.trend === "bullish" ? "▲ ขาขึ้น" : "▼ ขาลง"}</b></span>}
                      {data.indicators.adx != null && <span className="glass rounded-lg px-3 py-1.5"><Term id="adx" value={data.indicators.adx}>ADX</Term> <b className="text-violet-200">{data.indicators.adx}</b> <span className="text-slate-400">({data.indicators.trendStrength})</span></span>}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Market context chips */}
            {(data.market || data.earnings || data.beta != null) && (
              <div className="flex flex-wrap gap-2 text-xs">
                {data.market && (
                  <span className={`rounded-full border px-3 py-1.5 ${data.market.regime === "risk_on" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : data.market.regime === "risk_off" ? "border-rose-400/30 bg-rose-400/10 text-rose-200" : "border-white/10 bg-white/5 text-slate-300"}`}>
                    ตลาดรวม: {data.market.regime === "risk_on" ? "🟢 Risk-on" : data.market.regime === "risk_off" ? "🔴 Risk-off" : "⚪ กลางๆ"}
                  </span>
                )}
                {data.market?.spy && <span className="glass rounded-full px-3 py-1.5">S&P 500 <b className={data.market.spy.changePct >= 0 ? "text-emerald-300" : "text-rose-300"}>{data.market.spy.changePct >= 0 ? "+" : ""}{data.market.spy.changePct}%</b> <span className="text-slate-500">· 20d {data.market.spy.perf20d}%</span></span>}
                {data.market?.qqq && <span className="glass rounded-full px-3 py-1.5">Nasdaq <b className={data.market.qqq.changePct >= 0 ? "text-emerald-300" : "text-rose-300"}>{data.market.qqq.changePct >= 0 ? "+" : ""}{data.market.qqq.changePct}%</b></span>}
                {data.market?.vix != null && <span className={`glass rounded-full px-3 py-1.5 ${data.market.vix > 25 ? "text-rose-200" : ""}`}><Term id="vix" value={data.market.vix}>VIX</Term> <b>{data.market.vix}</b></span>}
                {data.sector?.rs20 != null && (
                  <span className={`rounded-full border px-3 py-1.5 ${data.sector.rs20 >= 0 ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-rose-400/30 bg-rose-400/10 text-rose-200"}`}>
                    <Term id="sector" value={data.sector.rs20}>{data.sector.rs20 >= 0 ? "💪 แข็งกว่า" : "🐢 อ่อนกว่า"}{data.sector.label}</Term> <b className="font-mono">{data.sector.rs20 >= 0 ? "+" : ""}{data.sector.rs20}%</b> <span className="opacity-60">20 วัน{data.sector.rs60 != null && ` · 60 วัน ${data.sector.rs60 >= 0 ? "+" : ""}${data.sector.rs60}%`}</span>
                  </span>
                )}
                {data.beta != null && <span className="glass rounded-full px-3 py-1.5"><Term id="beta" value={data.beta}>Beta</Term> <b className="text-violet-200">{data.beta}</b> <span className="text-slate-500">{data.beta > 1.3 ? "แกว่งแรงกว่าตลาด" : data.beta < 0.7 ? "แกว่งน้อยกว่าตลาด" : "ใกล้ตลาด"}</span></span>}
                {data.earnings && (
                  <span className={`rounded-full border px-3 py-1.5 ${data.earnings.daysUntil <= 14 ? "border-amber-400/40 bg-amber-400/15 text-amber-200 animate-pulse" : "border-white/10 bg-white/5 text-slate-300"}`}>
                    📅 ประกาศงบ {new Date(data.earnings.date + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short" })} (อีก {data.earnings.daysUntil} วัน)
                  </span>
                )}
              </div>
            )}

            {/* My position */}
            {(() => {
              const h = holdings.find((x) => x.symbol === data.symbol);
              if (!h) return null;
              const value = data.price * h.qty;
              const pnl = value - h.cost;
              const pct = (pnl / h.cost) * 100;
              const good = pnl >= 0;
              const pAbove = probAbove(data.projection?.points, h.avgCost);
              const adv = analysis?.positionAdvice;
              const advTone = adv?.action === "CutLoss" ? "from-rose-500/30 to-rose-500/5 border-rose-400/40 text-rose-100" : adv?.action === "TakeProfit" ? "from-amber-400/30 to-amber-400/5 border-amber-300/40 text-amber-100" : adv?.action === "AddMore" ? "from-sky-400/30 to-sky-400/5 border-sky-300/40 text-sky-100" : "from-emerald-400/30 to-emerald-400/5 border-emerald-300/40 text-emerald-100";
              return (
                <div className="card spotlight relative overflow-hidden rounded-2xl p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-semibold text-white">💼 พอร์ตของคุณ</h3>
                    <span className="text-xs text-slate-500">ซื้อ {h.lots.length} ครั้ง · ครั้งแรก {new Date(h.firstBought + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}</span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div><p className="text-xs text-slate-400">ต้นทุนเฉลี่ย</p><p className="font-mono text-lg text-amber-200">{money(h.avgCost)}</p></div>
                    <div><p className="text-xs text-slate-400">จำนวน</p><p className="font-mono text-lg text-white">{h.qty.toLocaleString(undefined, { maximumFractionDigits: 6 })}</p></div>
                    <div><p className="text-xs text-slate-400">มูลค่าตอนนี้</p><p className="font-mono text-lg text-white">{money(value)}</p></div>
                    <div><p className="text-xs text-slate-400">กำไร/ขาดทุน</p><p className={`font-mono text-lg font-semibold ${good ? "text-emerald-300" : "text-rose-300"}`}>{good ? "+" : ""}{money(pnl)} <span className="text-sm">({pct >= 0 ? "+" : ""}{pct.toFixed(2)}%)</span></p></div>
                  </div>
                  {pAbove != null && (
                    <div className="mt-4">
                      <div className="mb-1.5 flex justify-between text-xs">
                        <span className="text-slate-400">โอกาสที่ราคาจะอยู่เหนือต้นทุนใน {data.projection!.horizon} วันทำการ (ตามสถิติ)</span>
                        <span className={`font-mono font-semibold ${pAbove >= 0.5 ? "text-emerald-300" : "text-rose-300"}`}>{(pAbove * 100).toFixed(0)}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/10">
                        <div className="grow-x h-full rounded-full bg-gradient-to-r from-rose-400 via-violet-400 to-emerald-300" style={{ width: `${pAbove * 100}%` }} />
                      </div>
                    </div>
                  )}
                  {adv ? (
                    <div className={`mt-4 rounded-xl border bg-gradient-to-br p-4 ${advTone}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-lg font-bold">🤖 {adv.actionTH}</p>
                        <div className="flex gap-2 text-xs font-mono">
                          {adv.targetForPosition != null && <span className="rounded-full bg-black/20 px-2.5 py-1">เป้าขาย {money(adv.targetForPosition)}</span>}
                          {adv.stopForPosition != null && <span className="rounded-full bg-black/20 px-2.5 py-1">Stop {money(adv.stopForPosition)}</span>}
                        </div>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed opacity-90">{adv.reason}</p>
                    </div>
                  ) : !analyzing && (
                    <button onClick={() => analyze(data, news)} className="mt-4 w-full rounded-xl border border-dashed border-violet-400/40 py-3 text-sm text-violet-200 hover:bg-violet-500/10 transition">
                      🤖 กดวิเคราะห์ใหม่ เพื่อรับคำแนะนำ ถือต่อ / ขาย / cut loss สำหรับต้นทุนของคุณ
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Chart */}
            <div className="card spotlight p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium text-slate-400">กราฟราคา 1 ปี{data.projection && <span className="text-violet-300"> + <Term id="projection">กรวยแนวโน้ม {data.projection.horizon} วันทำการ</Term></span>}</h3>
                <div className="flex glass rounded-full p-0.5 text-xs">
                  <button onClick={() => proMode && toggleMode()} className={`rounded-full px-3 py-1 transition ${!proMode ? "glass-accent text-white" : "text-slate-400"}`}>โหมดง่าย</button>
                  <button onClick={() => !proMode && toggleMode()} className={`rounded-full px-3 py-1 transition ${proMode ? "glass-accent text-white" : "text-slate-400"}`}>โหมดเทรดเดอร์</button>
                </div>
              </div>
              <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
                <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-5 rounded bg-gradient-to-r from-emerald-400 to-rose-400" />เส้นทิศทาง: เขียว = ขาขึ้น แดง = ขาลง</span>
                <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-5 rounded-sm border-t border-dashed border-pink-400 bg-pink-400/25" />โซน Stop: หลุดลงมาตรงนี้ = ผิดแผน</span>
                <span className="flex items-center gap-1.5"><span className="text-emerald-300">▲</span><span className="text-rose-300">▼</span> ลูกศร = จุดเปลี่ยนเทรนด์ ตัวเลขคือราคา 10 วันต่อมา</span>
                {data.projection && <span className="flex items-center gap-1.5"><span className="inline-block w-5 border-t-2 border-dashed border-violet-200" />กรวยแนวโน้ม</span>}
                {holdings.some((x) => x.symbol === data.symbol) && <span className="flex items-center gap-1.5"><span className="inline-block w-5 border-t-2 border-amber-300" />ต้นทุนของคุณ</span>}
              </div>
              <CandleChart
                candles={data.candles}
                indicators={data.indicators}
                projection={data.projection?.points}
                supertrend={data.supertrend}
                stopZone={data.indicators?.stopZone}
                markers={data.markers}
                pro={proMode}
                priceLines={(() => {
                  const lines: PriceLine[] = [];
                  const h = holdings.find((x) => x.symbol === data.symbol);
                  if (h) lines.push({ price: h.avgCost, color: "#fcd34d", title: "ต้นทุน" });
                  const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : null; };
                  const tp1 = n(analysis?.targets?.tp1), tp2 = n(analysis?.targets?.tp2), sl = n((h ? analysis?.positionAdvice?.stopForPosition : null) ?? analysis?.stopLoss);
                  if (tp1) lines.push({ price: tp1, color: "#6ee7b7", title: "TP1", dashed: true });
                  if (tp2) lines.push({ price: tp2, color: "#34d399", title: "TP2", dashed: true });
                  if (sl) lines.push({ price: sl, color: "#f472b6", title: "SL", dashed: true });
                  return lines;
                })()}
              />
              {data.markers && (() => {
                const shown = data.markers.filter((m) => (proMode || m.kind === "trend") && m.fwd10 != null);
                if (!shown.length) return null;
                const right = shown.filter((m) => m.dir * m.fwd10! > 0).length;
                return <p className="mt-2 text-xs text-slate-400">📏 ลูกศร{proMode ? "ทั้งหมด" : "เปลี่ยนเทรนด์"}ในกราฟนี้ทายถูก <b className={right / shown.length >= 0.5 ? "text-emerald-300" : "text-rose-300"}>{right} จาก {shown.length} ครั้ง</b> (ดูราคา 10 วันหลังลูกศร){right / shown.length < 0.5 && " ตัวนี้สัญญาณหลอกบ่อย ระวังการเข้าตามลูกศรอย่างเดียว"}</p>;
              })()}
              {data.projection?.earningsInHorizon && <p className="mt-2 text-xs text-amber-200">⚠ มีประกาศงบในช่วงนี้ กรวยจึงกว้างขึ้นหลังวันประกาศ ราคาอาจกระโดดได้แรง</p>}
              {data.projection && <p className="mt-2 text-[11px] text-slate-500">กรวยคำนวณจากความผันผวนจริง {data.projection.sigmaDaily}%/วัน เอียงตาม Confluence Score และสภาวะตลาด เป็นช่วงความน่าจะเป็นทางสถิติ ไม่ใช่การทำนายราคาแน่นอน</p>}
            </div>

            {/* Plain-language readout */}
            {data.indicators?.plain && (() => {
              const p = data.indicators.plain;
              const ind = data.indicators;
              const rows = [
                {
                  tone: p.trend.state === "up" ? "green" : "red",
                  title: `ทิศทาง: ${p.trend.state === "up" ? "ขาขึ้น" : "ขาลง"}`,
                  desc: `เส้นทิศทางเป็นสี${p.trend.state === "up" ? "เขียว" : "แดง"}มา ${p.trend.days} วัน${p.trend.days <= 3 ? " (เพิ่งเปลี่ยน ยังไม่ยืนยัน)" : ""}`,
                  pro: `Supertrend(10,3) $${ind.supertrend?.line}`,
                },
                {
                  tone: p.flow === "in" ? "green" : p.flow === "out" ? "red" : "gray",
                  title: p.flow === "in" ? "เงินไหลเข้า" : p.flow === "out" ? "เงินไหลออก" : "เงินทรงตัว",
                  desc: p.flow === "in" ? "วันที่ราคาขึ้นมีคนซื้อหนักกว่าวันที่ลง" : p.flow === "out" ? "วันที่ราคาลงมีคนขายหนักกว่าวันที่ขึ้น" : "แรงซื้อกับแรงขายพอๆ กัน",
                  pro: `OBV · MFI ${ind.mfi ?? "–"}`,
                },
                {
                  tone: p.timing === "good" ? "green" : p.timing === "ok" ? "green" : p.timing === "hot" ? "red" : "yellow",
                  title: `จังหวะเข้า: ${p.timing === "good" ? "ดี" : p.timing === "ok" ? "พอได้" : p.timing === "hot" ? "ร้อนเกินไป" : "ยังไม่ดี"}`,
                  desc: p.timing === "good" ? "ราคาย่อตัวลงมาในโซนที่มักเด้งกลับ" : p.timing === "ok" ? "เริ่มฟื้นตัวจากจุดต่ำ" : p.timing === "hot" ? "ขึ้นมาเร็วเกินไป มักพักตัวก่อนไปต่อ" : "อยู่กลางทาง รอย่อลงมาก่อนดีกว่า",
                  pro: `StochRSI ${ind.stochRsi} · RSI ${ind.rsi}`,
                },
                {
                  tone: p.volatility.level === "high" ? "yellow" : "gray",
                  title: `ความผันผวน: ${p.volatility.level === "high" ? "สูง" : p.volatility.level === "low" ? "ต่ำ" : "ปกติ"}`,
                  desc: `แกว่งวันละราว $${p.volatility.atr} ควรตั้ง Stop ห่างจากราคาอย่างน้อย $${p.volatility.stopDistance} (≈ $${ind.stopZone?.upper})`,
                  pro: `ATR(14) ${ind.atrPct}%`,
                },
              ] as const;
              const dot = { green: "bg-emerald-400 shadow-emerald-400/60", red: "bg-rose-400 shadow-rose-400/60", yellow: "bg-amber-300 shadow-amber-300/60", gray: "bg-slate-400 shadow-slate-400/40" };
              return (
                <div className="card spotlight p-5">
                  <h3 className="mb-3 font-semibold text-white">🚦 อ่านกราฟง่ายๆ</h3>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {rows.map((r) => (
                      <div key={r.title} className="flex items-start gap-3 rounded-xl bg-white/[0.03] p-3">
                        <span className={`mt-1 h-3 w-3 shrink-0 rounded-full shadow-[0_0_10px] ${dot[r.tone]}`} />
                        <div>
                          <p className="font-medium text-white">{r.title}</p>
                          <p className="text-sm text-slate-400">{r.desc}</p>
                          {proMode && <p className="mt-0.5 font-mono text-[11px] text-violet-300/80">{r.pro}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Ask AI */}
            <div id="ask-ai" className="card spotlight scroll-mt-28 p-5">
              <div className="mb-3 flex items-center gap-3">
                <div className="assistant-orb relative grid h-9 w-9 place-items-center rounded-full text-sm"><span className="assistant-orb-ring" />💬</div>
                <div>
                  <h3 className="font-semibold text-white">ถาม AI เกี่ยวกับ {data.symbol.replace(/-USD$/, "")}</h3>
                  <p className="text-xs text-slate-500">AI เห็นข้อมูลทั้งหมดในหน้านี้ รวมถึงพอร์ตของคุณ</p>
                </div>
              </div>
              {chat.length > 0 && (
                <div className="mb-3 max-h-96 space-y-2 overflow-y-auto pr-1">
                  {chat.map((m, i) => (
                    <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm leading-relaxed ${m.role === "user" ? "glass-accent text-white" : "glass text-slate-200"}`}>{m.content.replace(/\*+/g, "")}</div>
                    </div>
                  ))}
                  {chatLoading && <div className="glass relative w-24 overflow-hidden rounded-2xl px-4 py-2 text-sm text-slate-400">กำลังคิด<div className="assistant-scan" /></div>}
                </div>
              )}
              {chat.length === 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {[
                    "ควรซื้อตอนนี้เลยไหม หรือรอ",
                    `ถ้าราคาลงไปถึงแนวรับ $${fmt(data.indicators?.support?.[0])} ควรทำยังไง`,
                    "ทำไมให้คะแนนเท่านี้",
                    holdings.some((x) => x.symbol === data.symbol) ? "ด้วยต้นทุนของผม ควรขายตอนไหน" : "ความเสี่ยงหลักคืออะไร",
                  ].map((q) => (
                    <button key={q} onClick={() => askAI(q)} className="glass rounded-full px-3 py-1.5 text-xs text-slate-300 hover:bg-violet-500/20 transition">{q}</button>
                  ))}
                </div>
              )}
              <form onSubmit={(e) => { e.preventDefault(); askAI(chatInput); }} className="flex gap-2">
                <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="พิมพ์คำถาม เช่น ถ้าราคาลงไป 200 ควรทำยังไง" className="flex-1 glass rounded-xl px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/60" />
                <button type="submit" disabled={chatLoading || !chatInput.trim()} className="glass-accent rounded-xl px-5 py-2 text-sm font-medium disabled:opacity-40 hover:brightness-110 transition">ส่ง</button>
              </form>
            </div>

            {showDetails ? (
              <>
            {/* Indicators + Analysis */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Technical Indicators */}
              {data.indicators && (
                <div className="card spotlight p-5 space-y-4">
                  <h3 className="font-semibold text-white">Technical Indicators</h3>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-400"><Term id="rsi" value={data.indicators.rsi}>RSI (14)</Term></span>
                      <span className={data.indicators.rsi > 70 ? "text-red-400" : data.indicators.rsi < 30 ? "text-green-400" : "text-white"}>
                        {data.indicators.rsi?.toFixed(1)}
                        <span className="text-slate-500 ml-1 text-xs">{data.indicators.rsi > 70 ? "Overbought" : data.indicators.rsi < 30 ? "Oversold" : "Normal"}</span>
                      </span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${data.indicators.rsi > 70 ? "bg-red-500" : data.indicators.rsi < 30 ? "bg-green-500" : "bg-gradient-to-r from-violet-500 to-fuchsia-400"}`} style={{ width: `${Math.min(data.indicators.rsi, 100)}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-slate-600 mt-0.5"><span>0</span><span>30</span><span>70</span><span>100</span></div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-sm"><Term id="macd" value={data.indicators.macd.histogram}>MACD</Term></span>
                    <span className={data.indicators.macd.histogram > 0 ? "text-green-400 text-sm" : "text-red-400 text-sm"}>
                      {data.indicators.macd.histogram > 0 ? "▲" : "▼"} Hist: {data.indicators.macd.histogram?.toFixed(4)}
                    </span>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm mb-1"><Term id="bb">Bollinger Bands</Term></p>
                    <div className="text-xs space-y-0.5">
                      <div className="flex justify-between"><span className="text-slate-500">Upper</span><span className="text-purple-300">${data.indicators.bb.upper?.toFixed(2)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Middle (MA20)</span><span className="text-purple-400">${data.indicators.bb.middle?.toFixed(2)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Lower</span><span className="text-purple-300">${data.indicators.bb.lower?.toFixed(2)}</span></div>
                    </div>
                  </div>
                  <div className="flex gap-4 text-sm">
                    <div><span className="text-slate-400"><Term id="ma">MA20</Term> </span><span className="text-yellow-400">${data.indicators.ma20?.toFixed(2)}</span></div>
                    {data.indicators.ma50 && <div><span className="text-slate-400">MA50 </span><span className="text-orange-400">${data.indicators.ma50?.toFixed(2)}</span></div>}
                  </div>
                  {data.indicators.volumeRatio != null && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400"><Term id="volume" value={data.indicators.volumeRatio}>Volume Ratio (20d avg)</Term></span>
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
              <div className="card spotlight p-5 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="font-semibold text-white">AI วิเคราะห์</h3>
                    {analysisCachedAt && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        🕐 วิเคราะห์เมื่อ {formatTimeAgo(analysisCachedAt)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">by GPT-OSS 120B</span>
                    {data && analysis && !analyzing && (
                      <button
                        onClick={() => analyze(data, news)}
                        className="text-xs px-3 py-1 glass hover:bg-violet-500/20 rounded-full transition"
                      >🔄 วิเคราะห์ใหม่</button>
                    )}
                  </div>
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
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500" style={{ width: `${analysis.score * 10}%` }} />
                    </div>

                    {/* TL;DR */}
                    {analysis.tldr && (
                      <div className="bg-violet-500/10 border border-violet-400/30 rounded-lg p-3">
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
                      <div className="bg-white/[0.04] rounded-lg p-3 space-y-2">
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
                          <p className="text-green-300 font-bold">${fmt(analysis.entryStrategy?.first)}</p>
                        </div>
                        <div className="bg-green-900/20 border border-green-900 rounded-lg p-2 text-center">
                          <p className="text-xs text-slate-400 mb-0.5">เข้าครั้งสอง</p>
                          <p className="text-green-400 font-bold">${fmt(analysis.entryStrategy?.second)}</p>
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
                        <div className="bg-violet-500/15 border border-violet-400/40 rounded-lg p-2">
                          <p className="text-xs text-slate-400 mb-0.5">TP1 (conservative)</p>
                          <p className="text-blue-300 font-bold">${fmt(analysis.targets?.tp1)}</p>
                          {analysis.targets?.tp1Reason && <p className="text-xs text-slate-500 mt-0.5">{analysis.targets.tp1Reason}</p>}
                        </div>
                        <div className="bg-violet-500/10 border border-violet-400/20 rounded-lg p-2">
                          <p className="text-xs text-slate-400 mb-0.5">TP2 (optimistic)</p>
                          <p className="text-blue-200 font-bold">${fmt(analysis.targets?.tp2)}</p>
                          {analysis.targets?.tp2Reason && <p className="text-xs text-slate-500 mt-0.5">{analysis.targets.tp2Reason}</p>}
                        </div>
                      </div>
                    </div>

                    {/* Stop Loss */}
                    <div className="bg-red-900/20 border border-red-900 rounded-lg p-3">
                      <div className="flex justify-between items-center mb-1">
                        <p className="text-xs text-slate-400">Cut Loss</p>
                        <p className="text-red-300 font-bold">${fmt(analysis.stopLoss)}</p>
                      </div>
                      {analysis.stopLossReason && <p className="text-xs text-slate-500">{analysis.stopLossReason}</p>}
                    </div>

                    {/* Risk/Reward + Timeframe */}
                    <div className="flex gap-4 text-sm">
                      <div className="flex-1 bg-white/[0.04] rounded-lg p-2 text-center">
                        <p className="text-xs text-slate-400 mb-0.5">Risk/Reward</p>
                        <p className="text-white font-bold">1 : {fmt(analysis.riskReward)}</p>
                      </div>
                      <div className="flex-1 bg-white/[0.04] rounded-lg p-2 text-center">
                        <p className="text-xs text-slate-400 mb-0.5">ถือ</p>
                        <p className="text-white font-bold">{analysis.timeframe}</p>
                      </div>
                    </div>

                    {/* Exit Strategy */}
                    {analysis.exitStrategy && (
                      <div className="bg-white/[0.04] rounded-lg p-3">
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
                <div className="card spotlight p-5">
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
                        <div className="flex justify-between border-t border-white/5 pt-2 mt-2">
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
              <div className="card spotlight p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-white">ข่าวล่าสุด</h3>
                  {analysis?.newsSentiment && (
                    <span className={`text-xs px-3 py-1 rounded-full border ${sentimentColor[analysis.newsSentiment]}`}>
                      Sentiment: {sentimentLabel[analysis.newsSentiment]}
                    </span>
                  )}
                </div>

                {analysis?.newsSummaryTH && (
                  <p className="text-sm text-slate-300 leading-relaxed mb-4 pb-4 border-b border-white/5">
                    📰 {analysis.newsSummaryTH}
                  </p>
                )}

                <div className="space-y-3">
                  {news.map((item, i) => {
                    const aiItem = analysis?.newsItems?.[i];
                    return (
                      <div key={i} className="flex gap-3 p-3 bg-white/[0.03] rounded-xl hover:bg-violet-500/10 transition">
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
            ) : (
              <button onClick={toggleDetails} className="card w-full rounded-2xl p-4 text-sm text-slate-400 hover:text-white transition">▼ ดูรายละเอียดทั้งหมด: ตัวชี้วัดเทคนิค, ผลวิเคราะห์ AI ฉบับเต็ม, ความเห็นนักวิเคราะห์ และข่าว</button>
            )}

            {/* History Panel */}
            {history.length > 0 && (
              <div className="card spotlight p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-white">ประวัติการวิเคราะห์</h3>
                  <button
                    onClick={() => setShowHistory(v => !v)}
                    className="text-xs text-slate-400 hover:text-white transition"
                  >
                    {showHistory ? "ซ่อน ▲" : `ดูทั้งหมด (${history.length}) ▼`}
                  </button>
                </div>
                {showHistory && (() => {
                  const byDate: Record<string, HistoryItem[]> = {};
                  history.forEach(h => {
                    const d = new Date(h.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
                    if (!byDate[d]) byDate[d] = [];
                    byDate[d].push(h);
                  });
                  return (
                    <div className="space-y-4">
                      {Object.entries(byDate).map(([date, items]) => (
                        <div key={date}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-slate-400">
                              {new Date(date + "T00:00:00+07:00").toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long" })}
                            </span>
                            <button
                              onClick={() => data && deleteByDate(data.symbol, date)}
                              className="text-xs text-red-400/60 hover:text-red-400 transition"
                            >
                              ลบทั้งวัน
                            </button>
                          </div>
                          <div className="space-y-2">
                            {items.map(h => (
                              <div key={h.id} className="flex items-start gap-3 p-3 bg-white/[0.03] rounded-xl">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs text-slate-500">{formatThaiDate(h.created_at)}</span>
                                    {h.suggestion_th && (
                                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                        h.suggestion === "Buy" ? "bg-green-500/20 text-green-400" :
                                        h.suggestion === "Avoid" ? "bg-red-500/20 text-red-400" :
                                        "bg-yellow-500/20 text-yellow-400"
                                      }`}>{h.suggestion_th}</span>
                                    )}
                                    {h.score != null && (
                                      <span className="text-xs text-slate-400">คะแนน {h.score}/10</span>
                                    )}
                                    {h.trend_th && (
                                      <span className="text-xs text-slate-500">{h.trend_th}</span>
                                    )}
                                  </div>
                                  {h.tldr && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{h.tldr}</p>}
                                </div>
                                <button
                                  onClick={() => deleteHistory(h.id)}
                                  className="text-slate-600 hover:text-red-400 transition shrink-0 mt-0.5"
                                  title="ลบรายการนี้"
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
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

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0a0915]/85 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] sm:hidden">
        <div className="grid grid-cols-4">
          {([
            ["overview", "🌐", "ภาพรวม"],
            ["detail", "🔍", "รายตัว"],
            ["portfolio", "💼", "พอร์ต"],
            ["accuracy", "🎯", "ความแม่น"],
          ] as const).map(([tab, icon, label]) => (
            <button key={tab} onClick={() => { setActiveTab(tab); window.scrollTo({ top: 0, behavior: "smooth" }); }} className={`relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] transition ${activeTab === tab ? "text-white" : "text-slate-500"}`}>
              {activeTab === tab && <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-300 shadow-[0_0_12px_rgba(167,139,250,0.9)]" />}
              <span className={`text-lg transition ${activeTab === tab ? "scale-110" : "opacity-70 grayscale"}`}>{icon}</span>
              <span>{label}</span>
              {tab === "portfolio" && holdings.length > 0 && <span className="absolute right-[28%] top-1.5 rounded-full bg-violet-500 px-1.5 text-[9px] text-white">{holdings.length}</span>}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
