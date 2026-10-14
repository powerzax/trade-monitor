"use client";
import { useMemo } from "react";
import type { Position } from "@/lib/portfolio";
import { buildJournal, groupStats, journalCsv, MIN_LOTS_FOR_VERDICT, type JournalGroup } from "@/lib/journal";

const GROUPS: { key: JournalGroup; dot: string; title: string; hint: string }[] = [
  { key: "followed", dot: "bg-emerald-400 shadow-emerald-400/60", title: "ซื้อตอน AI บอก \"ซื้อได้\"", hint: "ทำตาม AI" },
  { key: "against", dot: "bg-amber-300 shadow-amber-300/60", title: "ซื้อตอน AI บอกให้รอ / อย่าเพิ่งซื้อ", hint: "ซื้อสวน AI" },
  { key: "none", dot: "bg-slate-400 shadow-slate-400/40", title: "ซื้อเองโดยไม่ได้ถาม AI", hint: "ไม่มีคำแนะนำภายใน 7 วันก่อนซื้อ" },
];

export function JournalCard({ positions, prices }: { positions: Position[]; prices: Record<string, number | undefined> }) {
  const lots = useMemo(() => buildJournal(positions, prices), [positions, prices]);
  if (!lots.length) return null;

  const stats = Object.fromEntries(GROUPS.map((g) => [g.key, groupStats(lots.filter((l) => l.group === g.key))])) as Record<JournalGroup, ReturnType<typeof groupStats>>;
  const measured = lots.filter((l) => l.returnPct != null).length;

  let verdict: string;
  if (lots.length < MIN_LOTS_FOR_VERDICT) {
    verdict = `ยังสรุปไม่ได้ (ซื้อไปแล้ว ${lots.length} ครั้ง ต้องมีอย่างน้อย ${MIN_LOTS_FOR_VERDICT} ครั้ง)`;
  } else {
    const f = stats.followed.avgReturn;
    const others = lots.filter((l) => l.group !== "followed");
    const o = groupStats(others).avgReturn;
    if (f == null || o == null) verdict = "ยังเทียบไม่ได้ เพราะยังไม่มีการซื้อในกลุ่มใดกลุ่มหนึ่ง";
    else if (Math.abs(f - o) < 0.5) verdict = `ซื้อตาม AI กับไม่ตาม AI ได้ผลพอๆ กัน (เฉลี่ย ${f >= 0 ? "+" : ""}${f}% กับ ${o >= 0 ? "+" : ""}${o}%)`;
    else verdict = `ซื้อตาม AI ได้กำไรเฉลี่ย${f > o ? "มากกว่า" : "น้อยกว่า"}ไม่ตาม AI ${Math.abs(Math.round((f - o) * 10) / 10)}% (${f >= 0 ? "+" : ""}${f}% กับ ${o >= 0 ? "+" : ""}${o}%)`;
  }

  function download() {
    const blob = new Blob([journalCsv(lots)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trade-journal-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="card spotlight p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-white">🧭 ซื้อตาม AI ได้ผลไหม</h3>
        <button onClick={download} className="glass rounded-full px-3 py-1.5 text-xs text-slate-200 transition hover:bg-violet-500/20">⬇ ดาวน์โหลดเป็นไฟล์ Excel</button>
      </div>
      <p className={`mb-4 text-sm ${lots.length < MIN_LOTS_FOR_VERDICT ? "text-slate-400" : "text-violet-200"}`}>{verdict}</p>

      <div className="space-y-2">
        {GROUPS.map((g) => {
          const s = stats[g.key];
          return (
            <div key={g.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl bg-white/[0.03] px-4 py-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_10px] ${g.dot}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">{g.title}</p>
                  <p className="text-[11px] text-slate-500">{g.hint}</p>
                </div>
              </div>
              {s.count === 0 ? (
                <span className="text-xs text-slate-500">ยังไม่มี</span>
              ) : (
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                  <span className="text-slate-300">{s.count} ครั้ง</span>
                  <span className="text-slate-400">กำไร <b className="text-slate-200">{s.wins}</b> จาก {s.measured}</span>
                  <span className={`font-mono font-semibold ${s.avgReturn == null ? "text-slate-500" : s.avgReturn >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                    {s.avgReturn == null ? "–" : `เฉลี่ย ${s.avgReturn >= 0 ? "+" : ""}${s.avgReturn}%`}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        นับทีละการซื้อ ถ้าขายไปแล้วใช้ราคาที่ขายจริง ถ้ายังถืออยู่ใช้ราคาตอนนี้ เวลาขาย ระบบถือว่าขายหุ้นที่ซื้อก่อนออกไปก่อน
        ตัวเลขจึงอาจไม่ตรงกับ &quot;กำไรที่ขายแล้ว&quot; ด้านบนเป๊ะ เพราะด้านบนคิดจากต้นทุนเฉลี่ย
        {measured < lots.length && ` (${lots.length - measured} ครั้งยังไม่มีราคาปัจจุบัน จึงยังไม่นับ)`}
      </p>
    </div>
  );
}
