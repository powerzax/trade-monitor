"use client";
import { useEffect, useState } from "react";
import { Term } from "@/components/Term";
import { SETUPS, SETUP_KEYS, type SetupKey } from "@/lib/setups";

interface Stat { evaluated: number; winRate: number | null; avgRet14: number | null }
interface Last30 { buy: Stat; bySetup: Record<SetupKey, Stat> }

const MIN_CALLS = 5;
const MIN_DAYS = 14;

const usd = (v: number) => `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (v: number) => `${v >= 0 ? "+" : ""}${v}%`;

export function Scorecard({ value, cost, missingPrices = [] }: { value: number | null; cost: number; missingPrices?: string[] }) {
  const [last30, setLast30] = useState<Last30 | null>(null);
  const [snap, setSnap] = useState<{ days: number; drawdownPct: number | null } | null>(null);

  useEffect(() => {
    fetch("/api/scorecard").then((r) => r.json())
      .then((j) => { setLast30(j.last30 ?? null); setSnap({ days: j.snapshotDays ?? 0, drawdownPct: j.drawdownPct ?? null }); })
      .catch(() => setSnap({ days: 0, drawdownPct: null }));
  }, []);

  const buy = last30?.buy;
  const ranked = last30
    ? SETUP_KEYS.filter((k) => k !== "unclear" && (last30.bySetup?.[k]?.evaluated ?? 0) >= MIN_CALLS && last30.bySetup[k].winRate != null)
        .sort((a, b) => last30.bySetup[b].winRate! - last30.bySetup[a].winRate!)
    : [];

  const pnl = value != null ? value - cost : null;
  const pnlPct = pnl != null && cost > 0 ? Math.round((pnl / cost) * 1000) / 10 : null;
  const dd = snap && snap.days >= MIN_DAYS ? snap.drawdownPct : null;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="card spotlight rounded-2xl p-5">
        <p className="text-sm font-semibold text-white">🎯 AI แม่นแค่ไหน <span className="font-normal text-slate-400">(30 วันล่าสุด)</span></p>
        {!buy || buy.evaluated < MIN_CALLS ? (
          <p className="mt-3 text-sm text-slate-400">
            ยังมีข้อมูลน้อย ({buy?.evaluated ?? 0}/{MIN_CALLS} ครั้งที่ AI บอกซื้อแล้ววัดผลได้) ระบบเก็บให้ทุกเช้า
          </p>
        ) : (
          <>
            <p className="mt-3">
              <span className={`font-mono text-4xl font-bold ${buy.winRate! >= 55 ? "text-emerald-300" : buy.winRate! < 45 ? "text-rose-300" : "text-white"}`}>{buy.winRate}%</span>
              <span className="ml-2 text-sm text-slate-300">ของครั้งที่ AI บอกซื้อ ราคาขึ้นจริง ({buy.evaluated} ครั้ง)</span>
            </p>
            {buy.avgRet14 != null && (
              <p className="mt-2 text-sm text-slate-300">
                ถ้าซื้อตาม AI แล้วถือ 2 สัปดาห์ ได้เฉลี่ย <b className={buy.avgRet14 >= 0 ? "text-emerald-300" : "text-rose-300"}>{pct(buy.avgRet14)}</b>
              </p>
            )}
          </>
        )}
        <p className="mt-2 text-sm text-slate-400">
          {ranked.length >= 2 ? (
            <>เก่งสุดตอน: <b className="text-emerald-200">{SETUPS[ranked[0]].th}</b> · พลาดบ่อยตอน: <b className="text-rose-200">{SETUPS[ranked.at(-1)!].th}</b></>
          ) : ranked.length === 1 ? (
            <>แม่นที่สุดตอน: <b className="text-emerald-200">{SETUPS[ranked[0]].th}</b> (รูปแบบอื่นข้อมูลยังไม่พอ)</>
          ) : (
            <>ยังไม่มี<Term id="setup">รูปแบบสถานการณ์</Term>ไหนข้อมูลพอจะบอกได้</>
          )}
        </p>
      </div>

      <div className="card spotlight rounded-2xl p-5">
        <p className="text-sm font-semibold text-white">💼 พอร์ตของฉัน</p>
        {cost <= 0 ? (
          <p className="mt-3 text-sm text-slate-400">ยังไม่มีหุ้นในพอร์ต บันทึกการซื้อได้ที่แท็บพอร์ต</p>
        ) : (
          <>
            <p className="mt-3 flex flex-wrap items-baseline gap-x-3">
              {value == null && missingPrices.length > 0 ? (
                <span className="text-sm text-amber-200">ดึงราคาไม่ครบ ({missingPrices.join(", ")}) ลองรีเฟรชอีกครั้ง</span>
              ) : (
                <span className="font-mono text-4xl font-bold text-white">{value == null ? "…" : usd(value)}</span>
              )}
              {pnl != null && (
                <span className={`font-mono text-lg font-semibold ${pnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  {pnl >= 0 ? "กำไร" : "ขาดทุน"} {usd(Math.abs(pnl))} ({pct(pnlPct!)})
                </span>
              )}
            </p>
            <p className="mt-2 text-sm text-slate-300">
              {dd == null ? (
                <span className="text-slate-400">
                  <Term id="drawdown">เคยลงหนักสุด</Term>: กำลังเก็บข้อมูล ({snap?.days ?? 0}/{MIN_DAYS} วัน)
                </span>
              ) : (
                <>
                  <Term id="drawdown" value={dd}>เคยลงหนักสุด</Term> <b className={dd > 15 ? "text-rose-300" : dd > 7 ? "text-amber-200" : "text-emerald-300"}>−{dd}%</b>{" "}
                  <span className="text-slate-500">จากจุดสูงสุด ({snap!.days} วัน)</span>
                </>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
