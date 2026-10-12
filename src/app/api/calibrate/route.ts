import { NextRequest, NextResponse } from "next/server";
import { sql, initDB } from "@/lib/db";
import { runCalibration, getCalibration } from "@/lib/calibrate";

export const maxDuration = 300;

export async function GET() {
  await initDB();
  const rows = await sql`SELECT result, created_at FROM analysis_cache WHERE type = 'weights' ORDER BY created_at DESC LIMIT 1`;
  return NextResponse.json({ calibration: rows[0] ? { ...rows[0].result, createdAt: rows[0].created_at } : await getCalibration() });
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await initDB();
  const result = await runCalibration();
  const saved = await sql`INSERT INTO analysis_cache (symbol, type, result) VALUES ('WEIGHTS', 'weights', ${JSON.stringify(result)}::jsonb) RETURNING created_at`;
  return NextResponse.json({ calibration: { ...result, createdAt: saved[0].created_at } });
}
