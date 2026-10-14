import { NextRequest, NextResponse } from "next/server";
import { sql, initDB } from "@/lib/db";
import { fetchQuoteSummary } from "@/lib/yahoo";

interface Profile { sector: string | null; industry: string | null; earningsDate?: string | null }

// Sector per symbol, cached in symbol_profiles and refreshed after 30 days. Coins are always "Crypto".
// With ?earnings=1, the next earnings date is added too, re-checked at most once every 20 hours.
export async function GET(req: NextRequest) {
  const symbols = (req.nextUrl.searchParams.get("symbols") ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 40);
  const withEarnings = req.nextUrl.searchParams.get("earnings") === "1";
  if (!symbols.length) return NextResponse.json({ profiles: {} });
  await initDB();
  const rows = await sql`
    SELECT symbol, sector, industry, to_char(earnings_date, 'YYYY-MM-DD') AS earnings_date,
           updated_at > NOW() - INTERVAL '30 days' AS fresh,
           earnings_checked_at > NOW() - INTERVAL '20 hours' AS earnings_fresh
    FROM symbol_profiles WHERE symbol = ANY(${symbols})`;
  const known = new Map(rows.map((r) => [r.symbol as string, r]));
  const out: Record<string, Profile> = {};

  await Promise.all(symbols.map(async (s) => {
    const row = known.get(s);
    const crypto = s.endsWith("-USD");
    const needProfile = !row?.fresh;
    const needEarnings = withEarnings && !crypto && !row?.earnings_fresh;
    let sector: string | null = row?.sector ?? null, industry: string | null = row?.industry ?? null;
    let earningsDate: string | null = row?.earnings_date ?? null;
    let gotEarnings = false;

    if (crypto) sector = "Crypto";
    else if (needProfile || needEarnings) {
      const q = await fetchQuoteSummary(s, [needProfile && "assetProfile", needEarnings && "calendarEvents"].filter(Boolean).join(","));
      if (needProfile && q?.assetProfile?.sector) { sector = q.assetProfile.sector; industry = q.assetProfile.industry ?? null; }
      if (needEarnings && q) {
        gotEarnings = true;
        const ts: number | undefined = q.calendarEvents?.earnings?.earningsDate?.[0]?.raw;
        // US calendar date, matching the earnings chip on the analysis page.
        earningsDate = ts ? new Date(ts * 1000).toISOString().slice(0, 10) : null;
      }
    }
    out[s] = withEarnings ? { sector, industry, earningsDate } : { sector, industry };

    // Only cache real answers; a failed lookup should be retried next time, not frozen.
    if (sector && (needProfile || crypto && !row)) {
      await sql`
        INSERT INTO symbol_profiles (symbol, sector, industry) VALUES (${s}, ${sector}, ${industry})
        ON CONFLICT (symbol) DO UPDATE SET sector = EXCLUDED.sector, industry = EXCLUDED.industry, updated_at = NOW()`;
    }
    if (gotEarnings && sector) {
      await sql`UPDATE symbol_profiles SET earnings_date = ${earningsDate}, earnings_checked_at = NOW() WHERE symbol = ${s}`;
    }
  }));
  return NextResponse.json({ profiles: out });
}
