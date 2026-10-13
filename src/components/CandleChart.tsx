"use client";
import { useEffect, useRef, useState } from "react";
import { createChart, ColorType, CandlestickSeries, LineSeries, BaselineSeries, createSeriesMarkers } from "lightweight-charts";

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface Indicators {
  bb?: { upper: number; middle: number; lower: number };
  ma20?: number;
  ma50?: number | null;
  support?: number[];
  resistance?: number[];
}

export interface PriceLine {
  price: number;
  color: string;
  title: string;
  dashed?: boolean;
}

export interface ProjectionPoint {
  time: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

export interface ChartMarker {
  time: number;
  dir: 1 | -1;
  kind: "trend" | "score";
  fwd10: number | null;
}

interface Props {
  supertrend?: { time: number; value: number; dir: number }[];
  stopZone?: { upper: number; lower: number } | null;
  markers?: ChartMarker[];
  pro?: boolean;
  candles: Candle[];
  indicators?: Indicators | null;
  priceLines?: PriceLine[];
  projection?: ProjectionPoint[] | null;
}

export default function CandleChart({ candles, indicators, priceLines, projection, supertrend, stopZone, markers, pro = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const linesKey = JSON.stringify(priceLines ?? []);
  const [picked, setPicked] = useState<ChartMarker | null>(null);

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return;

    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#9a97b5" },
      grid: { vertLines: { color: "rgba(255,255,255,0.04)" }, horzLines: { color: "rgba(255,255,255,0.04)" } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: true },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientWidth < 640 ? 300 : 380,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#6ee7b7",
      downColor: "#f472b6",
      borderUpColor: "#6ee7b7",
      borderDownColor: "#f472b6",
      wickUpColor: "#6ee7b7",
      wickDownColor: "#f472b6",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    candleSeries.setData(candles as any);

    const lastTime = candles[candles.length - 1].time;

    if (pro && indicators?.bb) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pt = (val: number) => [{ time: lastTime as any, value: val }];
      const ubSeries = chart.addSeries(LineSeries, { color: "#6366f1", lineWidth: 1, lineStyle: 2 });
      const mbSeries = chart.addSeries(LineSeries, { color: "#a78bfa", lineWidth: 1 });
      const lbSeries = chart.addSeries(LineSeries, { color: "#6366f1", lineWidth: 1, lineStyle: 2 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ubSeries.setData(pt(indicators.bb.upper) as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mbSeries.setData(pt(indicators.bb.middle) as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lbSeries.setData(pt(indicators.bb.lower) as any);
    }

    if (pro && indicators?.ma20) {
      const maSeries = chart.addSeries(LineSeries, { color: "#f59e0b", lineWidth: 1 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      maSeries.setData([{ time: lastTime as any, value: indicators.ma20 }]);
    }

    if (supertrend?.length) {
      const stSeries = chart.addSeries(LineSeries, { lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stSeries.setData(supertrend.map((p) => ({ time: p.time as any, value: p.value, color: p.dir === 1 ? "rgba(52,211,153,0.85)" : "rgba(251,113,133,0.85)" })));
    }

    if (stopZone && stopZone.upper > stopZone.lower) {
      const zone = chart.addSeries(BaselineSeries, {
        baseValue: { type: "price", price: stopZone.lower },
        topFillColor1: "rgba(244,114,182,0.28)", topFillColor2: "rgba(244,114,182,0.12)", topLineColor: "rgba(244,114,182,0.7)",
        bottomFillColor1: "transparent", bottomFillColor2: "transparent", bottomLineColor: "transparent",
        lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      zone.setData([...candles.slice(-40).map((c) => c.time), ...(projection ?? []).slice(1).map((p) => p.time)].map((t) => ({ time: t as any, value: stopZone.upper })));
      zone.createPriceLine({ price: stopZone.upper, color: "rgba(244,114,182,0.9)", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "โซน Stop" });
    }

    const shown = (markers ?? []).filter((m) => pro || m.kind === "trend");
    if (shown.length) {
      createSeriesMarkers(candleSeries, shown.map((m) => {
        const right = m.fwd10 == null ? null : m.dir * m.fwd10 > 0;
        const text = m.fwd10 == null ? (m.kind === "trend" ? (m.dir === 1 ? "เทรนด์ขึ้น" : "เทรนด์ลง") : "ล่าสุด") : `${right ? "✓" : "✗"} ${m.fwd10 >= 0 ? "+" : ""}${m.fwd10}%`;
        return {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          time: m.time as any,
          position: m.dir === 1 ? "belowBar" : "aboveBar",
          shape: m.dir === 1 ? "arrowUp" : "arrowDown",
          color: m.kind === "trend" ? (m.dir === 1 ? "#34d399" : "#fb7185") : (m.dir === 1 ? "#a7f3d0" : "#fbcfe8"),
          text,
          size: m.kind === "trend" ? 1.4 : 0.8,
        } as const;
      }));
    }

    for (const l of priceLines ?? []) {
      if (!Number.isFinite(l.price)) continue;
      candleSeries.createPriceLine({ price: l.price, color: l.color, lineWidth: 1, lineStyle: l.dashed ? 2 : 0, axisLabelVisible: true, title: l.title });
    }

    if (projection?.length) {
      const band = (key: keyof ProjectionPoint, color: string, width: 1 | 2, style: number) => {
        const s = chart.addSeries(LineSeries, { color, lineWidth: width, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        s.setData(projection.map((p) => ({ time: p.time as any, value: p[key] })));
      };
      if (pro) band("p90", "rgba(167,139,250,0.35)", 1, 2);
      band("p75", "rgba(167,139,250,0.7)", 1, 0);
      band("p50", "#e9d5ff", 2, 2);
      band("p25", "rgba(167,139,250,0.7)", 1, 0);
      if (pro) band("p10", "rgba(167,139,250,0.35)", 1, 2);
    }

    const total = candles.length + Math.max(0, (projection?.length ?? 1) - 1);
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - 130), to: total + 2 });

    const shownForClick = (markers ?? []).filter((m) => pro || m.kind === "trend");
    chart.subscribeClick((param) => {
      if (param.time == null) return setPicked(null);
      const t = Number(param.time);
      const near = shownForClick
        .map((m) => ({ m, d: Math.abs(m.time - t) }))
        .filter((x) => x.d <= 3 * 86400)
        .sort((a, b) => a.d - b.d)[0];
      setPicked(near ? near.m : null);
    });

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth, height: containerRef.current.clientWidth < 640 ? 300 : 380 });
    });
    ro.observe(containerRef.current);

    return () => { chart.remove(); ro.disconnect(); };
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, indicators, linesKey, projection, supertrend, stopZone?.upper, stopZone?.lower, markers, pro]);

  return (
    <div>
      <div ref={containerRef} className="w-full touch-pan-y" />
      {picked ? (
        <div className={`mt-2 flex items-start justify-between gap-3 rounded-xl border px-3 py-2 text-xs ${picked.fwd10 == null ? "border-white/10 bg-white/5 text-slate-300" : picked.dir * picked.fwd10 > 0 ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100" : "border-rose-400/30 bg-rose-400/10 text-rose-100"}`}>
          <span>
            {picked.dir === 1 ? "▲" : "▼"} {new Date(picked.time * 1000).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}:{" "}
            {picked.kind === "trend" ? (picked.dir === 1 ? "เส้นทิศทางเปลี่ยนเป็นขาขึ้น (สีเขียว)" : "เส้นทิศทางเปลี่ยนเป็นขาลง (สีแดง)") : (picked.dir === 1 ? "คะแนนรวมขึ้นถึง +3 (สัญญาณซื้อ)" : "คะแนนรวมลงถึง -3 (สัญญาณขาย)")}
            {" → "}
            {picked.fwd10 == null ? "ยังไม่ครบ 10 วัน รอดูผล" : `10 วันต่อมาราคา ${picked.fwd10 >= 0 ? "+" : ""}${picked.fwd10}% ${picked.dir * picked.fwd10 > 0 ? "✓ ทายถูก" : "✗ ทายผิด"}`}
          </span>
          <button onClick={() => setPicked(null)} className="opacity-60 hover:opacity-100">✕</button>
        </div>
      ) : (markers?.length ? <p className="mt-2 text-[11px] text-slate-500">แตะที่ลูกศรบนกราฟเพื่อดูว่าตรงนั้นเกิดอะไรขึ้น</p> : null)}
    </div>
  );
}
