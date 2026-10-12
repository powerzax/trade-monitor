const PRICE_LINE =
  "M0,240 C80,232 130,250 200,226 C270,202 310,224 380,196 C450,168 500,190 570,158 C640,126 690,150 760,112 C830,74 880,98 950,66 C1020,34 1080,52 1200,14";

// Faint candles drifting upward along the bottom: [open, close, high, low] offsets from the baseline.
const CANDLES: [number, number, number, number][] = [
  [40, 60, 70, 30], [60, 50, 68, 44], [50, 78, 86, 46], [78, 70, 90, 62], [70, 98, 108, 66],
  [98, 90, 112, 82], [90, 122, 130, 86], [122, 112, 136, 104], [112, 146, 156, 108], [146, 138, 162, 128],
  [138, 172, 182, 132], [172, 160, 186, 152], [160, 196, 208, 154], [196, 186, 214, 178], [186, 224, 236, 180],
];

export function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="ambient-blob ambient-blob-a" />
      <div className="ambient-blob ambient-blob-b" />
      <div className="ambient-blob ambient-blob-c" />
      <div className="ambient-grid absolute inset-0" />

      <svg className="absolute inset-x-0 bottom-0 h-[45vh] w-full" viewBox="0 0 1200 280" preserveAspectRatio="none">
        <defs>
          <linearGradient id="amb-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="amb-stroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0" />
            <stop offset="40%" stopColor="#a78bfa" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#6ee7b7" stopOpacity="0.55" />
          </linearGradient>
        </defs>
        {CANDLES.map(([o, c, h, l], i) => {
          const x = i * 80 + 30;
          const up = c > o;
          const color = up ? "#6ee7b7" : "#f472b6";
          return (
            <g key={i} opacity="0.12"><g className="ambient-bar" style={{ animationDelay: `${i * 0.35}s` }}>
              <line x1={x + 11} x2={x + 11} y1={280 - h} y2={280 - l} stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
              <rect x={x} y={280 - Math.max(o, c)} width="22" height={Math.abs(c - o)} rx="3" fill={color} />
            </g></g>
          );
        })}
        <path d={`${PRICE_LINE} L1200,280 L0,280 Z`} fill="url(#amb-fill)" />
        <path d={PRICE_LINE} fill="none" stroke="url(#amb-stroke)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <path d={PRICE_LINE} pathLength={100} fill="none" stroke="#e9d5ff" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="ambient-growth-glint" />
      </svg>

      <div className="ambient-vignette absolute inset-0" />
    </div>
  );
}
