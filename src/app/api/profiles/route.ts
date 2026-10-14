import { NextRequest, NextResponse } from "next/server";
import { sql, initDB } from "@/lib/db";
import { fetchQuoteSummary } from "@/lib/yahoo";

// Sector per symbol, cached in symbol_profiles and refreshed after 30 days. Coins are always "Crypto".
export async function GET(req: NextRequest) {
  const symbols = (req.nextUrl.searchParams.get("symbols") ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 40);
  if (!symbols.length) return NextResponse.json({ profiles: {} });
  await initDB();
  const cached = await sql`SELECT symbol, sector, industry FROM symbol_profiles WHERE symbol = ANY(${symbols}) AND updated_at > NOW() - INTERVAL '30 days'`;
  const out: Record<string, { sector: string | null; industry: string | null }> = {};
  for (const r of cached) out[r.symbol] = { sector: r.sector, industry: r.industry };

  await Promise.all(symbols.filter((s) => !out[s]).map(async (s) => {
    let sector: string | null = null, industry: string | null = null;
    if (s.endsWith("-USD")) sector = "Crypto";
    else {
      const p = (await fetchQuoteSummary(s, "assetProfile"))?.assetProfile;
      sector = p?.sector ?? null;
      industry = p?.industry ?? null;
    }
    out[s] = { sector, industry };
    // Only cache real answers; a failed lookup should be retried next time, not frozen for 30 days.
    if (sector) {
      await sql`
        INSERT INTO symbol_profiles (symbol, sector, industry) VALUES (${s}, ${sector}, ${industry})
        ON CONFLICT (symbol) DO UPDATE SET sector = EXCLUDED.sector, industry = EXCLUDED.industry, updated_at = NOW()
      `;
    }
  }));
  return NextResponse.json({ profiles: out });
}
