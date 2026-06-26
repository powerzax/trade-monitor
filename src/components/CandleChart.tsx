"use client";
import { useEffect, useRef } from "react";
import { createChart, ColorType, CandlestickSeries, LineSeries } from "lightweight-charts";

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

interface Props {
  candles: Candle[];
  indicators?: Indicators | null;
}

export default function CandleChart({ candles, indicators }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return;

    const chart = createChart(containerRef.current, {
      layout: { background: { type: ColorType.Solid, color: "#111827" }, textColor: "#9ca3af" },
      grid: { vertLines: { color: "#1f2937" }, horzLines: { color: "#1f2937" } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: "#1f2937" },
      timeScale: { borderColor: "#1f2937", timeVisible: true },
      width: containerRef.current.clientWidth,
      height: 380,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#4ade80",
      downColor: "#f87171",
      borderUpColor: "#4ade80",
      borderDownColor: "#f87171",
      wickUpColor: "#4ade80",
      wickDownColor: "#f87171",
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    candleSeries.setData(candles as any);

    const lastTime = candles[candles.length - 1].time;

    if (indicators?.bb) {
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

    if (indicators?.ma20) {
      const maSeries = chart.addSeries(LineSeries, { color: "#f59e0b", lineWidth: 1 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      maSeries.setData([{ time: lastTime as any, value: indicators.ma20 }]);
    }

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);

    return () => { chart.remove(); ro.disconnect(); };
  }, [candles, indicators]);

  return <div ref={containerRef} className="w-full" />;
}
