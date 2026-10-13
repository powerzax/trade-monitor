"use client";
import { useState, type ReactNode } from "react";
import type { Position } from "@/lib/portfolio";

interface Props {
  lot: Position;
  money: (v: number) => string;
  extra?: ReactNode;
  onSave: (patch: { id: number; price: number; qty: number; boughtAt: string }) => Promise<string | null>;
  onDelete: (id: number) => Promise<string | null>;
}

export function LotRow({ lot, money, extra, onSave, onDelete }: Props) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [form, setForm] = useState({ price: String(lot.price), qty: String(lot.qty), boughtAt: lot.bought_at });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sell = lot.side === "sell";

  async function run(fn: () => Promise<string | null>) {
    setBusy(true);
    setError("");
    const err = await fn();
    setBusy(false);
    if (err) setError(err);
    else setMode("view");
  }

  const date = new Date(lot.bought_at + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
  const input = "w-full glass rounded-lg px-2.5 py-1.5 font-mono text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/60";

  if (mode === "edit") {
    return (
      <div className="rounded-xl border border-violet-400/30 bg-violet-500/10 p-3">
        <p className="mb-2 text-xs text-violet-200">แก้ไขรายการ{sell ? "ขาย" : "ซื้อ"} {lot.symbol.replace(/-USD$/, "")}</p>
        <div className="grid grid-cols-3 gap-2">
          <label className="text-[11px] text-slate-400">ราคา ($)<input type="number" step="any" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className={input} /></label>
          <label className="text-[11px] text-slate-400">จำนวน<input type="number" step="any" min="0" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} className={input} /></label>
          <label className="text-[11px] text-slate-400">วันที่<input type="date" value={form.boughtAt} onChange={(e) => setForm({ ...form, boughtAt: e.target.value })} className={`${input} [color-scheme:dark]`} /></label>
        </div>
        {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={() => { setMode("view"); setError(""); setForm({ price: String(lot.price), qty: String(lot.qty), boughtAt: lot.bought_at }); }} className="glass rounded-lg px-3 py-1.5 text-xs text-slate-300">ยกเลิก</button>
          <button disabled={busy} onClick={() => run(() => onSave({ id: lot.id, price: Number(form.price), qty: Number(form.qty), boughtAt: form.boughtAt }))} className="glass-accent rounded-lg px-4 py-1.5 text-xs font-medium disabled:opacity-50">{busy ? "กำลังบันทึก..." : "บันทึก"}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white/[0.03] px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-xs text-slate-400">{date}</span>
          <span className={`ml-2 font-mono text-sm ${sell ? "text-rose-300" : "text-slate-200"}`}>{sell ? "ขาย" : "ซื้อ"} {lot.qty.toLocaleString(undefined, { maximumFractionDigits: 6 })} × {money(lot.price)}</span>
          <span className="ml-2 font-mono text-xs text-slate-500">= {money(lot.qty * lot.price)}</span>
        </div>
        <div className="flex items-center gap-2">
          {extra}
          {mode === "confirm" ? (
            <>
              <span className="text-xs text-rose-200">ลบรายการนี้?</span>
              <button onClick={() => { setMode("view"); setError(""); }} className="glass rounded-lg px-2.5 py-1 text-xs text-slate-300">ไม่</button>
              <button disabled={busy} onClick={() => run(() => onDelete(lot.id))} className="rounded-lg bg-rose-500/80 px-2.5 py-1 text-xs text-white disabled:opacity-50">ลบเลย</button>
            </>
          ) : (
            <>
              <button onClick={() => setMode("edit")} title="แก้ไข" className="glass rounded-lg px-2.5 py-1 text-xs text-slate-300 hover:bg-violet-500/20">✏️ แก้ไข</button>
              <button onClick={() => setMode("confirm")} title="ลบ" className="glass rounded-lg px-2.5 py-1 text-xs text-slate-300 hover:bg-rose-500/20">🗑</button>
            </>
          )}
        </div>
      </div>
      {error && <p className="mt-1.5 text-xs text-rose-300">{error}</p>}
    </div>
  );
}
