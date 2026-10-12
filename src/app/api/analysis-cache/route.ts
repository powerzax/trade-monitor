import { NextRequest, NextResponse } from "next/server";
import { sql, initDB } from "@/lib/db";

export async function GET(req: NextRequest) {
  await initDB();
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });
  const rows = await sql`
    SELECT id, result, created_at
    FROM analysis_cache
    WHERE symbol = ${symbol.toUpperCase()} AND type = 'symbol'
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (!rows.length) return NextResponse.json({ cache: null });
  return NextResponse.json({ cache: { id: rows[0].id, result: rows[0].result, createdAt: rows[0].created_at } });
}

export async function POST(req: NextRequest) {
  await initDB();
  const { symbol, result } = await req.json();
  await sql`
    INSERT INTO analysis_cache (symbol, type, result)
    VALUES (${symbol.toUpperCase()}, 'symbol', ${JSON.stringify(result)}::jsonb)
  `;
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const symbol = req.nextUrl.searchParams.get("symbol");
  const date = req.nextUrl.searchParams.get("date");

  if (id) {
    await sql`DELETE FROM analysis_cache WHERE id = ${Number(id)}`;
  } else if (symbol && date) {
    await sql`
      DELETE FROM analysis_cache
      WHERE symbol = ${symbol.toUpperCase()}
      AND DATE(created_at AT TIME ZONE 'Asia/Bangkok') = ${date}
    `;
  }
  return NextResponse.json({ ok: true });
}
