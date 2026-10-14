"use client";
import { useEffect, useState } from "react";

const thb = (v: number) => `฿${Math.round(v).toLocaleString()}`;

// Sizes a position from a loss budget in baht: units = budget(USD) ÷ (entry − stop). Fractional units are
// allowed for stocks and coins alike, floored so the planned loss never exceeds the budget.
export function sizePosition(budgetThb: number, usdThb: number, entry: number, stop: number, target: number | null, crypto: boolean) {
  if (!(budgetThb > 0) || !(usdThb > 0) || !(entry > stop) || !(stop > 0)) return null;
  const dp = crypto ? 6 : 4;
  const raw = budgetThb / usdThb / (entry - stop);
  const qty = Math.floor(raw * 10 ** dp) / 10 ** dp;
  if (!(qty > 0)) return null;
  return {
    qty,
    costThb: qty * entry * usdThb,
    lossThb: qty * (entry - stop) * usdThb,
    gainThb: target != null && target > entry ? qty * (target - entry) * usdThb : null,
  };
}

export const MAX_SHARE_PCT = 30;

// Adds an existing holding to the sizing: shares already held consume the loss budget first (their loss from
// today's price down to the stop), and only what's left is used to size the top-up.
export function planWithHolding(p: {
  budgetThb: number; usdThb: number; entry: number; stop: number; target: number | null; crypto: boolean;
  price: number; held: { qty: number; avgCost: number } | null; portfolioValueUsd: number;
}) {
  const heldQty = p.held?.qty ?? 0;
  const stopBreached = heldQty > 0 && p.price <= p.stop;
  const existingRiskThb = heldQty * Math.max(0, p.price - p.stop) * p.usdThb;
  const remaining = p.budgetThb - existingRiskThb;
  const add = !stopBreached && remaining > 0 ? sizePosition(remaining, p.usdThb, p.entry, p.stop, p.target, p.crypto) : null;
  const addQty = add?.qty ?? 0;
  const totalQty = heldQty + addQty;
  const newAvgCost = heldQty > 0 && addQty > 0 ? (heldQty * p.held!.avgCost + addQty * p.entry) / totalQty : null;
  const positionAfter = heldQty * p.price + addQty * p.entry;
  const portfolioAfter = p.portfolioValueUsd + addQty * p.entry;
  return {
    heldQty,
    stopBreached,
    existingRiskThb,
    overBudget: heldQty > 0 && remaining <= 0,
    add,
    totalQty,
    newAvgCost,
    totalLossThb: existingRiskThb + (add?.lossThb ?? 0),
    sharePct: portfolioAfter > 0 ? (positionAfter / portfolioAfter) * 100 : null,
  };
}

export function PositionSizer({ entry, stop, target, crypto, symbol, price, held, portfolioValueUsd }: {
  entry: number | null; stop: number | null; target: number | null; crypto: boolean; symbol: string;
  price: number; held: { qty: number; avgCost: number } | null; portfolioValueUsd: number;
}) {
  const [budget, setBudget] = useState("");
  const [usdThb, setUsdThb] = useState<number | null>(null);
  const [fxError, setFxError] = useState(false);
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch("/api/settings?key=risk_budget_thb").then((r) => r.json()).then((j) => { if (j.value) setBudget(j.value); }).catch(() => {}).finally(() => setReady(true));
    fetch("/api/fx").then((r) => r.json()).then((j) => (j.usdThb ? setUsdThb(j.usdThb) : setFxError(true))).catch(() => setFxError(true));
  }, []);

  // Save only what the user typed, never the value we just loaded.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "risk_budget_thb", value: budget }) }).catch(() => {});
    }, 700);
    return () => clearTimeout(t);
  }, [budget, dirty]);

  const sym = symbol.replace(/-USD$/, "");
  const unit = crypto ? sym : "หุ้น";
  const fmtQty = (q: number) => q.toLocaleString(undefined, { maximumFractionDigits: crypto ? 6 : 4 });
  const plan = entry != null && stop != null && entry > stop && usdThb && Number(budget) > 0
    ? planWithHolding({ budgetThb: Number(budget), usdThb, entry, stop, target, crypto, price, held, portfolioValueUsd })
    : null;

  return (
    <div className="card spotlight p-5">
      <h3 className="font-semibold text-white">🧮 ควรซื้อเท่าไหร่</h3>
      <p className="mt-1 text-xs text-slate-400">ใส่จำนวนเงินที่ยอมเสียได้ถ้าราคาลงไปโดน Stop แอปจะคำนวณจำนวนที่ควรซื้อให้</p>

      <label className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-300">
        ยอมเสียได้ไม่เกิน
        <span className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">฿</span>
          <input type="number" inputMode="decimal" min="0" step="100" value={budget} disabled={!ready} onChange={(e) => { setBudget(e.target.value); setDirty(true); }} placeholder={ready ? "1000" : "กำลังโหลด…"} className="w-36 glass disabled:opacity-50 rounded-xl py-2 pl-7 pr-3 font-mono text-white focus:outline-none focus:ring-2 focus:ring-violet-500/60" />
        </span>
        บาท
      </label>

      <div className="mt-4">
        {entry == null || stop == null ? (
          <p className="text-sm text-slate-400">กด &quot;วิเคราะห์ใหม่&quot; ก่อน เพื่อให้ได้จุดเข้าและจุด Stop</p>
        ) : !(entry > stop) ? (
          <p className="text-sm text-amber-200">จุด Stop (${stop}) ไม่ได้อยู่ต่ำกว่าจุดเข้า (${entry}) คำนวณไม่ได้ ลองกดวิเคราะห์ใหม่</p>
        ) : fxError ? (
          <p className="text-sm text-amber-200">ดึงอัตราแลกเปลี่ยนไม่ได้ ลองใหม่อีกครั้ง</p>
        ) : !usdThb ? (
          <p className="text-sm text-slate-500">กำลังดึงอัตราแลกเปลี่ยน…</p>
        ) : !plan ? (
          <p className="text-sm text-slate-400">ใส่จำนวนเงินด้านบนเพื่อดูผล</p>
        ) : (
          <div className="space-y-3">
            {plan.heldQty > 0 && (
              <p className="text-sm text-slate-300">
                💼 คุณถือ {sym} อยู่แล้ว <b className="font-mono text-white">{fmtQty(plan.heldQty)} {unit}</b> (ต้นทุนเฉลี่ย ${held!.avgCost.toFixed(2)})
              </p>
            )}
            {plan.stopBreached ? (
              <p className="rounded-xl border border-rose-400/40 bg-rose-500/15 px-4 py-3 text-sm text-rose-100">
                🛑 ราคาตอนนี้ (${price.toFixed(2)}) ต่ำกว่าจุด Stop (${stop}) แล้ว ตามแผนควรขายของที่ถืออยู่ <b>ไม่ควรซื้อเพิ่ม</b>
              </p>
            ) : plan.overBudget ? (
              <p className="rounded-xl border border-amber-300/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                ⚠ ของที่ถืออยู่ ถ้าลงไปโดน Stop จะเสีย <b className="font-mono">{thb(plan.existingRiskThb)}</b> เกินงบ {thb(Number(budget))} แล้ว <b>ไม่ควรซื้อเพิ่ม</b>
              </p>
            ) : !plan.add ? (
              <p className="text-sm text-slate-400">งบที่เหลือน้อยเกินไปที่จะซื้อเพิ่ม</p>
            ) : (
              <div className="rounded-xl border border-violet-400/25 bg-violet-500/10 p-4">
                <p className="text-base leading-relaxed text-slate-100">
                  {plan.heldQty > 0 ? "ซื้อเพิ่มได้" : "ซื้อได้"} <b className="font-mono text-xl text-white">{fmtQty(plan.add.qty)} {unit}</b> ใช้เงิน{" "}
                  <b className="font-mono text-violet-100">{thb(plan.add.costThb)}</b>
                </p>
                <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                  <p className="rounded-lg bg-emerald-400/10 px-3 py-2 text-emerald-200">ถ้าถึงเป้า ได้ <b className="font-mono">{plan.add.gainThb == null ? "–" : `+${thb(plan.add.gainThb)}`}</b>{plan.heldQty > 0 && <span className="opacity-70"> (เฉพาะที่ซื้อเพิ่ม)</span>}</p>
                  <p className="rounded-lg bg-rose-400/10 px-3 py-2 text-rose-200">
                    ถ้าโดน Stop เสีย <b className="font-mono">−{thb(plan.totalLossThb)}</b>{plan.heldQty > 0 && <span className="opacity-70"> (รวมของเดิม)</span>}
                  </p>
                </div>
                {plan.newAvgCost != null && (
                  <p className="mt-2 text-sm text-slate-300">หลังซื้อเพิ่ม: ถือรวม <b className="font-mono">{fmtQty(plan.totalQty)} {unit}</b> ต้นทุนเฉลี่ยใหม่ <b className="font-mono text-amber-200">${plan.newAvgCost.toFixed(2)}</b></p>
                )}
              </div>
            )}
            {plan.sharePct != null && !plan.stopBreached && !plan.overBudget && (
              <p className={`text-sm ${plan.sharePct > MAX_SHARE_PCT ? "text-amber-200" : "text-slate-400"}`}>
                {plan.sharePct > MAX_SHARE_PCT ? "⚠ " : ""}หลังซื้อ {sym} จะเป็น <b>{plan.sharePct.toFixed(0)}%</b> ของพอร์ต{plan.sharePct > MAX_SHARE_PCT ? ` เกิน ${MAX_SHARE_PCT}% ที่ควรเป็น พิจารณาซื้อน้อยลง` : ""}
              </p>
            )}
            <p className="text-[11px] text-slate-500">
              คิดจากจุดเข้า ${entry} · Stop ${stop}{target != null ? ` · เป้า $${target}` : ""} · ราคาตอนนี้ ${price.toFixed(2)} · 1 USD = {usdThb} บาท · ยังไม่รวมค่าธรรมเนียม
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
