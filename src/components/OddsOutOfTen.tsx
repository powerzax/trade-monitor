// Turns three percentages into whole "times out of 10" that always add up to 10 (largest-remainder rounding).
export function outOfTen(parts: number[]) {
  const raw = parts.map((p) => (Math.max(0, p) / 100) * 10);
  const floors = raw.map(Math.floor);
  let left = 10 - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i]++;
    left--;
  }
  return floors;
}

export function OddsOutOfTen({ pTarget, pStop, pOpen }: { pTarget: number; pStop: number; pOpen: number }) {
  const [t, s, o] = outOfTen([pTarget, pStop, pOpen]);
  return (
    <p className="mt-2 text-sm text-slate-300">
      ถ้าเจอสถานการณ์แบบนี้ <b className="text-white">10 ครั้ง</b>: ถึงเป้า <b className="text-emerald-300">~{t}</b>, โดนตัดขาดทุน{" "}
      <b className="text-rose-300">~{s}</b>, ยังไม่ถึงทั้งคู่ <b className="text-slate-200">~{o}</b>
    </p>
  );
}
