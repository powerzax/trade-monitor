import { NextResponse } from "next/server";
import { sql, initDB } from "@/lib/db";
import { runScan } from "@/lib/screener";

export const maxDuration = 120;

export async function GET() {
  await initDB();
  const rows = await sql`SELECT result, created_at FROM analysis_cache WHERE type = 'screener' ORDER BY created_at DESC LIMIT 1`;
  if (!rows.length) return NextResponse.json({ scan: null });
  return NextResponse.json({ scan: { ...rows[0].result, createdAt: rows[0].created_at } });
}

export async function POST() {
  await initDB();
  const result = await runScan();
  const saved = await sql`INSERT INTO analysis_cache (symbol, type, result) VALUES ('SCREENER', 'screener', ${JSON.stringify(result)}::jsonb) RETURNING created_at`;
  return NextResponse.json({ scan: { ...result, createdAt: saved[0].created_at } });
}
