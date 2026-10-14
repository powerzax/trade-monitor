import { NextResponse } from "next/server";
import { sql, initDB } from "@/lib/db";
import { getLatestAccuracy } from "@/lib/accuracy";
import { getSnapshots } from "@/lib/snapshot";
import { maxDrawdownPct, type Flow } from "@/lib/drawdown";

export async function GET() {
  await initDB();
  const [acc, snapshots, trades] = await Promise.all([
    getLatestAccuracy(),
    getSnapshots(),
    sql`SELECT to_char(bought_at, 'YYYY-MM-DD') AS date, (CASE WHEN side = 'sell' THEN -1 ELSE 1 END * price * qty)::float AS amount FROM positions`,
  ]);
  return NextResponse.json({
    last30: acc?.last30 ?? null,
    snapshotDays: snapshots.length,
    drawdownPct: snapshots.length >= 2 ? maxDrawdownPct(snapshots, trades as Flow[]) : null,
  });
}
