"use client";
import { useEffect, useState } from "react";

interface Config { minScore: number; regime: string; stopAtr: number; trades: number; winRate: number; avgPct: number }
interface Backtest { best: Config | null; bestWithoutMarket: Config | null; baseline: Config | null; symbols: number; holdDays: number; rr: number }

const regimeTH = (r: string) => (r === "spy_ma50" ? "ซื้อเฉพาะตอน S&P 500 อยู่เหนือเส้นเฉลี่ย 50 วัน" : r === "spy_ma20" ? "ซื้อเฉพาะตอน S&P 500 อยู่เหนือเส้นเฉลี่ย 20 วัน" : "ไม่สนใจตลาดรวม");
const pct = (v: number) => `${v >= 0 ? "+" : ""}${v}%`;

function Row({ label, c, strong }: { label: string; c: Config; strong?: boolean }) {
  return (
    <div className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-xl px-4 py-3 ${strong ? "border border-emerald-400/30 bg-emerald-400/10" : "bg-white/[0.03]"}`}>
      <span className={`text-sm ${strong ? "font-medium text-emerald-100" : "text-slate-300"}`}>{label}</span>
      <span className="text-sm text-slate-300">
        {c.trades.toLocaleString()} ครั้ง · ถูก {c.winRate}% · <b className={`font-mono ${c.avgPct >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{pct(c.avgPct)}</b> ต่อครั้ง
      </span>
    </div>
  );
}

export function BacktestCard() {
  const [bt, setBt] = useState<Backtest | null | undefined>(undefined);
  useEffect(() => {
    fetch("/api/backtest").then((r) => r.json()).then((j) => setBt(j.backtest ?? null)).catch(() => setBt(null));
  }, []);
  if (bt === undefined) return null;

  return (
    <div className="card spotlight p-5">
      <h3 className="font-semibold text-white">🧪 กฎที่ใช้ เคยได้ผลย้อนหลังแค่ไหน</h3>
      {!bt?.best ? (
        <p className="mt-2 text-sm text-slate-400">ยังไม่มีผลทดสอบ ระบบจะทดสอบให้อัตโนมัติสัปดาห์ละครั้ง</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-slate-400">
            จำลองการซื้อขายหุ้นใหญ่ {bt.symbols} ตัวย้อนหลัง 2 ปี: ซื้อตอนมีสัญญาณ ตั้ง Stop ตามความแกว่ง ตั้งเป้า {bt.rr} เท่าของระยะ Stop ถือไม่เกิน {bt.holdDays} วัน
          </p>
          <div className="mt-4 space-y-2">
            <Row strong label="✅ กฎที่แอปใช้ตอนนี้ (ดีที่สุดจากการทดสอบ)" c={bt.best} />
            {bt.bestWithoutMarket && bt.best.regime !== "none" && <Row label="ถ้าไม่กรองตลาดรวม" c={bt.bestWithoutMarket} />}
            {bt.baseline && <Row label="กฎแบบเดิม (Stop แคบ ไม่กรองอะไร)" c={bt.baseline} />}
          </div>
          <ul className="mt-4 space-y-1 text-sm text-slate-300">
            <li>• ตั้ง Stop ห่าง <b>{bt.best.stopAtr} เท่า</b>ของความแกว่งรายวัน (Stop ที่แคบกว่านี้โดนสะบัดหลุดบ่อย)</li>
            <li>• {regimeTH(bt.best.regime)}</li>
            <li>• คะแนนรวมทางเทคนิคตั้งแต่ <b>+{bt.best.minScore}</b> ขึ้นไป</li>
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            ข้อจำกัด: ไม่รวมค่าธรรมเนียม ไม่มีข่าวหรืองบการเงิน และใช้หุ้นใหญ่ที่ยังอยู่รอดถึงวันนี้ ผลจึงอาจดูดีกว่าความจริงเล็กน้อย ผลในอดีตไม่รับประกันอนาคต
          </p>
        </>
      )}
    </div>
  );
}
