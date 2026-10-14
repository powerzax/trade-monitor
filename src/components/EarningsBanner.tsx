export const EARNINGS_WARN_DAYS = 14;

export function EarningsBanner({ earnings }: { earnings?: { date: string; daysUntil: number } | null }) {
  if (!earnings || earnings.daysUntil > EARNINGS_WARN_DAYS || earnings.daysUntil < 0) return null;
  const date = new Date(earnings.date + "T00:00:00").toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" });
  const when = earnings.daysUntil === 0 ? "วันนี้" : earnings.daysUntil === 1 ? "พรุ่งนี้" : `อีก ${earnings.daysUntil} วัน`;
  return (
    <div className="mt-4 flex items-start gap-3 rounded-xl border-2 border-amber-300/60 bg-amber-400/15 px-4 py-3">
      <span className="text-2xl leading-none">📅</span>
      <div>
        <p className="font-semibold text-amber-100">ประกาศงบ{when} ({date})</p>
        <p className="mt-0.5 text-sm text-amber-50/80">ราคามักกระโดดแรงทั้งขึ้นและลงหลังประกาศงบ ถ้าจะซื้อตอนนี้ ควรซื้อน้อยลง หรือรอให้ประกาศผ่านไปก่อน</p>
      </div>
    </div>
  );
}
