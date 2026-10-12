import { NextRequest, NextResponse } from "next/server";
import { sql, initDB } from "@/lib/db";

export async function GET(req: NextRequest) {
  await initDB();
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });

  const rows = await sql`
    SELECT
      id,
      created_at,
      result->>'suggestion' AS suggestion,
      result->>'suggestionTH' AS suggestion_th,
      (result->>'score')::int AS score,
      result->>'tldr' AS tldr,
      result->>'trendTH' AS trend_th
    FROM analysis_cache
    WHERE symbol = ${symbol.toUpperCase()} AND type = 'symbol'
    ORDER BY created_at DESC
    LIMIT 30
  `;
  return NextResponse.json({ history: rows });
}
