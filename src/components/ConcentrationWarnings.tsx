"use client";
import { useEffect, useState } from "react";
import { sectorLabel } from "@/lib/sectors";

export const MAX_SINGLE_PCT = 30;
export const MAX_SECTOR_PCT = 60;

export function ConcentrationWarnings({ items }: { items: { symbol: string; value: number }[] }) {
  const [sectors, setSectors] = useState<Record<string, string | null>>({});
  const key = items.map((i) => i.symbol).sort().join(",");

  useEffect(() => {
    if (!key) return;
    fetch(`/api/profiles?symbols=${encodeURIComponent(key)}`).then((r) => r.json())
      .then((j) => setSectors(Object.fromEntries(Object.entries(j.profiles ?? {}).map(([s, p]) => [s, (p as { sector: string | null }).sector]))))
      .catch(() => {});
  }, [key]);

  const total = items.reduce((a, i) => a + i.value, 0);
  if (!(total > 0) || items.length === 0) return null;

  const singles = items.map((i) => ({ ...i, pct: (i.value / total) * 100 })).filter((i) => i.pct > MAX_SINGLE_PCT).sort((a, b) => b.pct - a.pct);
  const bySector = new Map<string, { value: number; symbols: string[] }>();
  for (const i of items) {
    const s = sectors[i.symbol];
    if (!s) continue;
    const e = bySector.get(s) ?? { value: 0, symbols: [] };
    e.value += i.value;
    e.symbols.push(i.symbol);
    bySector.set(s, e);
  }
  // A one-symbol sector already flagged above would just repeat the same warning.
  const warned = new Set(singles.map((i) => i.symbol));
  const heavySectors = [...bySector]
    .map(([s, e]) => ({ s, pct: (e.value / total) * 100, symbols: e.symbols }))
    .filter((x) => x.pct > MAX_SECTOR_PCT && !(x.symbols.length === 1 && warned.has(x.symbols[0])));

  if (!singles.length && !heavySectors.length) return null;
  return (
    <div className="rounded-2xl border border-amber-300/40 bg-amber-400/10 p-4">
      <p className="font-semibold text-amber-100">⚠ พอร์ตกระจุกตัว</p>
      <ul className="mt-2 space-y-1 text-sm text-amber-50/90">
        {singles.map((i) => (
          <li key={i.symbol}>• <b>{i.symbol.replace(/-USD$/, "")}</b> ตัวเดียวคิดเป็น <b>{i.pct.toFixed(0)}%</b> ของพอร์ต (ไม่ควรเกิน {MAX_SINGLE_PCT}%) ถ้าตัวนี้ลงแรง พอร์ตจะเจ็บมาก</li>
        ))}
        {heavySectors.map((x) => (
          <li key={x.s}>• กลุ่ม<b>{sectorLabel(x.s)}</b>รวมกันคิดเป็น <b>{x.pct.toFixed(0)}%</b> (ไม่ควรเกิน {MAX_SECTOR_PCT}%) หุ้นกลุ่มเดียวกันมักขึ้นลงพร้อมกัน</li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-amber-100/60">เป็นคำเตือนเพื่อประกอบการตัดสินใจ ไม่ได้บังคับให้ขาย</p>
    </div>
  );
}
