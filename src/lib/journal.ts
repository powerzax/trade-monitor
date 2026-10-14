import type { Position } from "@/lib/portfolio";

export type JournalGroup = "followed" | "against" | "none";

export interface JournalLot {
  id: number;
  symbol: string;
  date: string;
  qty: number;
  price: number;
  cost: number;
  aiSuggestion: string | null;
  aiAt: string | null;
  group: JournalGroup;
  soldQty: number;
  realized: number;
  openQty: number;
  currentPrice: number | null;
  returnPct: number | null;
}

export interface GroupStats {
  count: number;
  measured: number;
  wins: number;
  winRate: number | null;
  avgReturn: number | null;
}

export const MIN_LOTS_FOR_VERDICT = 10;

const groupOf = (s: string | null | undefined): JournalGroup =>
  s === "Buy" ? "followed" : s === "Wait" || s === "Avoid" ? "against" : "none";

// Per-buy results, attributing each sale to the oldest still-open buy of that symbol (FIFO).
// This differs from the portfolio header, which books realized P&L at average cost.
export function buildJournal(positions: Position[], prices: Record<string, number | undefined>): JournalLot[] {
  const sorted = [...positions].sort((a, b) => a.bought_at.localeCompare(b.bought_at) || a.id - b.id);
  const lots: (JournalLot & { proceeds: number })[] = [];
  const open = new Map<string, (JournalLot & { proceeds: number })[]>();

  for (const p of sorted) {
    if (p.side === "buy") {
      const lot = {
        id: p.id, symbol: p.symbol, date: p.bought_at, qty: p.qty, price: p.price, cost: p.qty * p.price,
        aiSuggestion: p.ai_suggestion ?? null, aiAt: p.ai_at ?? null, group: groupOf(p.ai_suggestion),
        soldQty: 0, realized: 0, openQty: p.qty, currentPrice: null, returnPct: null, proceeds: 0,
      };
      lots.push(lot);
      open.set(p.symbol, [...(open.get(p.symbol) ?? []), lot]);
      continue;
    }
    let left = p.qty;
    for (const lot of open.get(p.symbol) ?? []) {
      if (left <= 1e-12) break;
      const take = Math.min(left, lot.openQty);
      if (take <= 0) continue;
      lot.openQty -= take;
      lot.soldQty += take;
      lot.proceeds += take * p.price;
      lot.realized += take * (p.price - lot.price);
      left -= take;
    }
  }

  return lots.map(({ proceeds, ...lot }) => {
    const openQty = lot.openQty < 1e-9 ? 0 : lot.openQty;
    const currentPrice = openQty > 0 ? prices[lot.symbol] ?? null : null;
    const value = openQty > 0 ? (currentPrice == null ? null : proceeds + openQty * currentPrice) : proceeds;
    const returnPct = value == null || lot.cost <= 0 ? null : ((value - lot.cost) / lot.cost) * 100;
    return { ...lot, openQty, currentPrice, returnPct };
  });
}

export function groupStats(lots: JournalLot[]): GroupStats {
  const measured = lots.filter((l) => l.returnPct != null);
  const wins = measured.filter((l) => l.returnPct! > 0).length;
  return {
    count: lots.length,
    measured: measured.length,
    wins,
    winRate: measured.length ? Math.round((wins / measured.length) * 100) : null,
    avgReturn: measured.length ? Math.round((measured.reduce((a, l) => a + l.returnPct!, 0) / measured.length) * 10) / 10 : null,
  };
}

export function journalCsv(lots: JournalLot[]) {
  const label = { followed: "ซื้อตาม AI (ซื้อได้)", against: "ซื้อสวน AI (รอ/หลีกเลี่ยง)", none: "ไม่มีคำแนะนำ" };
  const head = ["วันที่ซื้อ", "หุ้น", "จำนวน", "ราคาซื้อ (USD)", "ต้นทุน (USD)", "AI แนะนำ", "วันที่ของคำแนะนำ", "กลุ่ม", "ขายไปแล้ว", "กำไรที่ขายแล้ว (USD)", "ยังถืออยู่", "ราคาปัจจุบัน (USD)", "ผลตอบแทน (%)"];
  const cell = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const r2 = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100);
  const rows = lots.map((l) => [
    l.date, l.symbol.replace(/-USD$/, ""), l.qty, r2(l.price), r2(l.cost), l.aiSuggestion ?? "", l.aiAt ?? "", label[l.group],
    l.soldQty, r2(l.realized), l.openQty, r2(l.currentPrice), r2(l.returnPct),
  ]);
  return "﻿" + [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}
