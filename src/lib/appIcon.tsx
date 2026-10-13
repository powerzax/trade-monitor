import { ImageResponse } from "next/og";

// Rounded violet orb with a rising candle chart, drawn at any square size.
export function appIcon(size: number, maskable = false) {
  const pad = maskable ? size * 0.12 : 0;
  const inner = size - pad * 2;
  const bars = [0.35, 0.5, 0.42, 0.62, 0.55, 0.78];
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0915" }}>
        <div
          style={{
            width: inner, height: inner, borderRadius: maskable ? 0 : inner * 0.24, display: "flex", alignItems: "flex-end", justifyContent: "center",
            gap: inner * 0.045, paddingBottom: inner * 0.2,
            background: "radial-gradient(circle at 30% 25%, #ddd6fe 0%, #8b5cf6 45%, #2e1065 100%)",
          }}
        >
          {bars.map((h, i) => (
            <div key={i} style={{ width: inner * 0.085, height: inner * h * 0.62, borderRadius: inner * 0.02, background: i % 2 === 1 && i < 4 ? "#fbcfe8" : "#a7f3d0" }} />
          ))}
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
