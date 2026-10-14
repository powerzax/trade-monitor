"use client";
import { useEffect, useState } from "react";

export interface HoldingPlan {
  stop: number | null;
  action: string | null;
  actionTH: string | null;
  at: string;
}

interface HoldingLite { symbol: string; crypto: boolean; qty: number; avgCost: number }
interface ScanPick { ticker: string; crypto: boolean; score: number }

type Tone = "red" | "amber" | "green" | "gray";
interface Item { key: string; tone: Tone; rank: number; symbol: string; crypto: boolean; title: string; detail: string }

const NEAR_STOP_PCT = 3;
const SHARE_LIMIT = 30;
const EARNINGS_DAYS = 14;
const STALE_DAYS = 3;
const MAX_ITEMS = 5;

const DOT: Record<Tone, string> = {
  red: "bg-rose-400 shadow-rose-400/70",
  amber: "bg-amber-300 shadow-amber-300/60",
  green: "bg-emerald-400 shadow-emerald-400/60",
  gray: "bg-slate-400 shadow-slate-400/40",
};

const name = (s: string) => s.replace(/-USD$/, "");

// Builds the morning to-do list from data the app already has: holdings vs their latest stop and AI advice,
// upcoming earnings, concentration, and the scanner's best idea. Most urgent first, capped at five.
export function buildTodayItems(p: {
  holdings: HoldingLite[];
  prices: Record<string, number | undefined>;
  plans: Record<string, HoldingPlan | undefined>;
  earnings: Record<string, string | null | undefined>;
  scan: ScanPick[];
  now?: number;
}): Item[] {
  const now = p.now ?? Date.now();
  const items: Item[] = [];
  const value = (h: HoldingLite) => h.qty * (p.prices[h.symbol] ?? h.avgCost);
  const total = p.holdings.reduce((a, h) => a + value(h), 0);

  for (const h of p.holdings) {
    const price = p.prices[h.symbol];
    const plan = p.plans[h.symbol];
    const n = name(h.symbol);
    if (price != null && plan?.stop != null && price <= plan.stop) {
      items.push({ key: `${n}-stop`, tone: "red", rank: 0, symbol: h.symbol, crypto: h.crypto, title: `${n} หลุดจุด Stop แล้ว`, detail: `ราคา $${price.toFixed(2)} ต่ำกว่า Stop $${plan.stop} ตามแผนควรขาย` });
    } else if (plan?.action === "CutLoss") {
      items.push({ key: `${n}-cut`, tone: "red", rank: 1, symbol: h.symbol, crypto: h.crypto, title: `${n}: AI แนะนำตัดขาดทุน`, detail: "เปิดดูเหตุผลก่อนตัดสินใจ" });
    } else if (price != null && plan?.stop != null && ((price - plan.stop) / price) * 100 <= NEAR_STOP_PCT) {
      items.push({ key: `${n}-near`, tone: "amber", rank: 2, symbol: h.symbol, crypto: h.crypto, title: `${n} ใกล้จุด Stop`, detail: `ห่าง Stop แค่ ${(((price - plan.stop) / price) * 100).toFixed(1)}% เตรียมใจไว้ถ้าหลุดต้องขาย` });
    }

    const e = p.earnings[h.symbol];
    if (e) {
      const days = Math.ceil((new Date(e + "T00:00:00+07:00").getTime() - now) / 86400000);
      if (days >= 0 && days <= EARNINGS_DAYS) {
        items.push({ key: `${n}-earn`, tone: "amber", rank: 3, symbol: h.symbol, crypto: h.crypto, title: `${n} ประกาศงบ${days === 0 ? "วันนี้" : `อีก ${days} วัน`}`, detail: "ราคาอาจกระโดดแรง ไม่ควรซื้อเพิ่มก่อนประกาศ" });
      }
    }
    if (plan?.action === "TakeProfit") {
      items.push({ key: `${n}-tp`, tone: "amber", rank: 4, symbol: h.symbol, crypto: h.crypto, title: `${n}: AI แนะนำขายทำกำไรบางส่วน`, detail: "เปิดดูราคาเป้าที่แนะนำ" });
    }
    if (total > 0 && (value(h) / total) * 100 > SHARE_LIMIT) {
      items.push({ key: `${n}-share`, tone: "amber", rank: 5, symbol: h.symbol, crypto: h.crypto, title: `${n} คิดเป็น ${((value(h) / total) * 100).toFixed(0)}% ของพอร์ต`, detail: `เกิน ${SHARE_LIMIT}% ไม่ควรซื้อเพิ่ม` });
    }
    if (!plan || (now - new Date(plan.at).getTime()) / 86400000 > STALE_DAYS) {
      items.push({ key: `${n}-stale`, tone: "gray", rank: 7, symbol: h.symbol, crypto: h.crypto, title: `${n}: คำแนะนำเก่าเกิน ${STALE_DAYS} วัน`, detail: "กดเพื่อวิเคราะห์ใหม่" });
    }
  }

  const held = new Set(p.holdings.map((h) => h.symbol));
  const pick = p.scan.find((r) => r.score >= 3 && !held.has(r.ticker));
  if (pick) {
    items.push({ key: `${pick.ticker}-scan`, tone: "green", rank: 6, symbol: pick.ticker, crypto: pick.crypto, title: `${name(pick.ticker)} สัญญาณดีจากตัวสแกน (+${pick.score}/7)`, detail: "ตัวที่คุณยังไม่มี ลองกดวิเคราะห์" });
  }

  return items.sort((a, b) => a.rank - b.rank).slice(0, MAX_ITEMS);
}

export function TodayActions(props: {
  holdings: HoldingLite[];
  prices: Record<string, number | undefined>;
  plans: Record<string, HoldingPlan | undefined>;
  scan: ScanPick[];
  onOpen: (symbol: string, crypto: boolean) => void;
}) {
  const [earnings, setEarnings] = useState<Record<string, string | null>>({});
  const key = props.holdings.filter((h) => !h.crypto).map((h) => h.symbol).sort().join(",");

  useEffect(() => {
    if (!key) return;
    fetch(`/api/profiles?earnings=1&symbols=${encodeURIComponent(key)}`).then((r) => r.json())
      .then((j) => setEarnings(Object.fromEntries(Object.entries(j.profiles ?? {}).map(([s, v]) => [s, (v as { earningsDate?: string | null }).earningsDate ?? null]))))
      .catch(() => {});
  }, [key]);

  const items = buildTodayItems({ ...props, earnings });

  return (
    <div className="card spotlight rounded-2xl p-5">
      <p className="text-sm font-semibold text-white">✅ วันนี้ต้องทำอะไร</p>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">{props.holdings.length ? "วันนี้ไม่มีอะไรต้องรีบทำ พอร์ตปกติดี" : "ยังไม่มีหุ้นในพอร์ต บันทึกการซื้อได้ที่แท็บพอร์ต"}</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {items.map((it) => (
            <li key={it.key}>
              <button onClick={() => props.onOpen(it.symbol, it.crypto)} className="flex w-full items-start gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5 text-left transition hover:bg-violet-500/10">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_10px] ${DOT[it.tone]}`} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-white">{it.title}</span>
                  <span className="block text-xs text-slate-400">{it.detail}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
