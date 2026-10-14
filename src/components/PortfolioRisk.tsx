"use client";
import { useEffect, useState } from "react";
import type { HoldingPlan } from "@/components/TodayActions";

interface HoldingLite { symbol: string; crypto: boolean; qty: number; avgCost: number }

const thb = (v: number) => `฿${Math.round(v).toLocaleString()}`;

// Worst case if every holding fell to its latest stop at once: loss from today's price, in baht and % of value.
export function PortfolioRisk({ holdings, prices, plans, onOpen }: {
  holdings: HoldingLite[];
  prices: Record<string, number | undefined>;
  plans: Record<string, HoldingPlan | undefined>;
  onOpen: (symbol: string, crypto: boolean) => void;
}) {
  const [usdThb, setUsdThb] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/fx").then((r) => r.json()).then((j) => j.usdThb && setUsdThb(j.usdThb)).catch(() => {});
  }, []);
  if (!holdings.length) return null;

  const rows = holdings.map((h) => {
    const price = prices[h.symbol] ?? null;
    const stop = plans[h.symbol]?.stop ?? null;
    const value = h.qty * (price ?? h.avgCost);
    const loss = price != null && stop != null ? h.qty * Math.max(0, price - stop) : null;
    return { h, price, stop, value, loss, breached: price != null && stop != null && price <= stop };
  });
  const total = rows.reduce((a, r) => a + r.value, 0);
  const covered = rows.filter((r) => r.loss != null);
  const loss = covered.reduce((a, r) => a + r.loss!, 0);
  const missing = rows.filter((r) => r.stop == null);
  const pct = total > 0 ? (loss / total) * 100 : 0;
  const tone = pct > 15 ? "text-rose-300" : pct > 8 ? "text-amber-200" : "text-emerald-300";

  return (
    <div className="card spotlight p-5">
      <h3 className="font-semibold text-white">🛡 ถ้าทุกตัวโดน Stop พร้อมกัน</h3>
      {covered.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">ยังไม่มีจุด Stop ของหุ้นในพอร์ต กดวิเคราะห์หุ้นแต่ละตัวก่อน</p>
      ) : (
        <>
          <p className="mt-3 flex flex-wrap items-baseline gap-x-3">
            <span className={`font-mono text-3xl font-bold ${tone}`}>{usdThb ? `−${thb(loss * usdThb)}` : `−$${loss.toFixed(2)}`}</span>
            <span className="text-sm text-slate-300">หรือ <b className={tone}>{pct.toFixed(1)}%</b> ของพอร์ต{missing.length ? " (เฉพาะตัวที่มี Stop)" : ""}</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">คิดจากราคาตอนนี้ลงไปถึงจุด Stop ล่าสุดของแต่ละตัว เป็นกรณีแย่ที่สุดที่วางแผนไว้</p>
          <div className="mt-3 space-y-1">
            {covered.sort((a, b) => b.loss! - a.loss!).map((r) => (
              <button key={r.h.symbol} onClick={() => onOpen(r.h.symbol, r.h.crypto)} className="flex w-full items-center justify-between rounded-lg bg-white/[0.03] px-3 py-1.5 text-sm transition hover:bg-violet-500/10">
                <span className="text-slate-200">{r.h.symbol.replace(/-USD$/, "")} <span className="text-xs text-slate-500">Stop ${r.stop}</span></span>
                <span className={`font-mono ${r.breached ? "text-rose-300" : "text-slate-300"}`}>{r.breached ? "หลุด Stop แล้ว" : usdThb ? `−${thb(r.loss! * usdThb)}` : `−$${r.loss!.toFixed(2)}`}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {missing.length > 0 && (
        <p className="mt-3 text-xs text-amber-200/90">
          ยังไม่มีจุด Stop: {missing.map((r, i) => (
            <button key={r.h.symbol} onClick={() => onOpen(r.h.symbol, r.h.crypto)} className="underline-offset-2 hover:underline">{r.h.symbol.replace(/-USD$/, "")}{i < missing.length - 1 ? ", " : ""}</button>
          ))} (กดเพื่อวิเคราะห์)
        </p>
      )}
    </div>
  );
}
