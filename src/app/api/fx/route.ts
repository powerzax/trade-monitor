import { NextResponse } from "next/server";
import { fetchChart } from "@/lib/yahoo";

export async function GET() {
  try {
    const r = (await fetchChart("THB=X", "1d", 10))?.chart?.result?.[0];
    const closes: number[] = (r?.indicators?.quote?.[0]?.close ?? []).filter((c: number | null) => c != null);
    const rate = Number(r?.meta?.regularMarketPrice ?? closes.at(-1));
    if (!(rate > 0)) throw new Error("no rate");
    return NextResponse.json({ usdThb: Math.round(rate * 100) / 100 });
  } catch {
    return NextResponse.json({ error: "ดึงอัตราแลกเปลี่ยนไม่ได้" }, { status: 502 });
  }
}
