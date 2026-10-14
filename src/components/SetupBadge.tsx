import { Term } from "@/components/Term";
import { SETUPS, normalizeSetup } from "@/lib/setups";

export interface SetupStat {
  evaluated: number;
  winRate: number | null;
}

export const MIN_SETUP_SAMPLES = 5;

export function SetupBadge({ setup, reason, stat }: { setup?: string | null; reason?: string | null; stat?: SetupStat | null }) {
  if (!setup) return null;
  const key = normalizeSetup(setup);
  const enough = stat && stat.evaluated >= MIN_SETUP_SAMPLES && stat.winRate != null;
  return (
    <div className="mt-3 rounded-xl border border-violet-400/25 bg-violet-500/10 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[11px] text-slate-400"><Term id="setup">รูปแบบสถานการณ์</Term></span>
        <span className="rounded-full bg-violet-400/20 px-2.5 py-0.5 text-sm font-medium text-violet-100">📍 {SETUPS[key].th}</span>
        {enough ? (
          <span className={`text-xs ${stat!.winRate! >= 55 ? "text-emerald-300" : stat!.winRate! < 45 ? "text-rose-300" : "text-slate-300"}`}>
            AI แม่นกับรูปแบบนี้ {stat!.winRate}% ({stat!.evaluated} ครั้ง)
          </span>
        ) : (
          <span className="text-xs text-slate-500">ยังเก็บสถิติรูปแบบนี้ไม่พอ ({stat?.evaluated ?? 0}/{MIN_SETUP_SAMPLES} ครั้ง)</span>
        )}
      </div>
      {reason && <p className="mt-1.5 text-sm text-slate-300">{reason}</p>}
    </div>
  );
}
