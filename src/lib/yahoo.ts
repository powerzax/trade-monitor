const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
export const YF_HEADERS = { "User-Agent": UA, Accept: "application/json" };

export async function fetchChart(ticker: string, interval = "1d", days = 180) {
  const period1 = Math.floor((Date.now() - days * 86400000) / 1000);
  const period2 = Math.floor(Date.now() / 1000);
  const path = `/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&period1=${period1}&period2=${period2}&includePrePost=false`;
  let status = 0;
  for (const host of ["query1", "query2"]) {
    const res = await fetch(`https://${host}.finance.yahoo.com${path}`, { headers: YF_HEADERS, next: { revalidate: 300 } });
    if (res.ok) return res.json();
    status = res.status;
    if (status !== 429 && status < 500) break;
  }
  throw new Error(`Yahoo Finance error: ${status}`);
}

export function parseCloses(chart: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = (chart as any)?.chart?.result?.[0];
  const ts: number[] = r?.timestamp ?? [];
  const cl: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? [];
  return ts.map((t, i) => ({ time: t, close: cl[i] })).filter((x): x is { time: number; close: number } => x.close != null);
}

// quoteSummary needs a cookie + crumb pair; cache it for the life of the server instance.
let session: { cookie: string; crumb: string; at: number } | null = null;

async function getSession() {
  if (session && Date.now() - session.at < 3600_000) return session;
  try {
    const r1 = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": UA }, redirect: "manual", cache: "no-store" });
    const cookie = (r1.headers.getSetCookie?.() ?? [r1.headers.get("set-cookie") ?? ""])
      .map((c) => c.split(";")[0]).filter(Boolean).join("; ");
    if (!cookie) return null;
    const r2 = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", { headers: { "User-Agent": UA, Cookie: cookie }, cache: "no-store" });
    const crumb = (await r2.text()).trim();
    if (!r2.ok || !crumb || crumb.length > 20 || /\s/.test(crumb)) return null;
    session = { cookie, crumb, at: Date.now() };
    return session;
  } catch {
    return null;
  }
}

export async function fetchQuoteSummary(ticker: string, modules: string) {
  const s = await getSession();
  if (!s) return null;
  try {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}&crumb=${encodeURIComponent(s.crumb)}`;
    const res = await fetch(url, { headers: { "User-Agent": UA, Cookie: s.cookie }, next: { revalidate: 3600 } });
    if (!res.ok) { if (res.status === 401) session = null; return null; }
    const json = await res.json();
    return json?.quoteSummary?.result?.[0] ?? null;
  } catch {
    return null;
  }
}

export interface IndexState {
  symbol: string;
  price: number;
  changePct: number;
  perf20d: number;
  aboveMa50: boolean;
}

export interface MarketRegime {
  spy: IndexState | null;
  qqq: IndexState | null;
  vix: number | null;
  regime: "risk_on" | "risk_off" | "neutral";
  spyReturns: Map<string, number>;
}

function indexState(symbol: string, pts: { close: number }[]): IndexState | null {
  const n = pts.length;
  if (n < 50) return null;
  const c = pts.map((p) => p.close);
  const ma50 = c.slice(-50).reduce((a, b) => a + b, 0) / 50;
  return {
    symbol,
    price: c[n - 1],
    changePct: Math.round(((c[n - 1] - c[n - 2]) / c[n - 2]) * 10000) / 100,
    perf20d: Math.round(((c[n - 1] - c[n - 21]) / c[n - 21]) * 1000) / 10,
    aboveMa50: c[n - 1] > ma50,
  };
}

export const dayKey = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);

export async function fetchMarketRegime(): Promise<MarketRegime> {
  const [spyC, qqqC, vixC] = await Promise.all(
    ["SPY", "QQQ", "^VIX"].map((t) => fetchChart(t, "1d", 180).then(parseCloses).catch(() => []))
  );
  const spy = indexState("SPY", spyC);
  const qqq = indexState("QQQ", qqqC);
  const vix = vixC.length ? Math.round(vixC[vixC.length - 1].close * 100) / 100 : null;

  const spyReturns = new Map<string, number>();
  for (let i = 1; i < spyC.length; i++) spyReturns.set(dayKey(spyC[i].time), Math.log(spyC[i].close / spyC[i - 1].close));

  const bullish = [spy?.aboveMa50, qqq?.aboveMa50].filter(Boolean).length;
  const regime =
    bullish === 2 && (vix ?? 20) < 20 ? "risk_on" :
    bullish === 0 || (vix ?? 0) > 25 ? "risk_off" : "neutral";

  return { spy, qqq, vix, regime, spyReturns };
}
