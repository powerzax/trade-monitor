import { NextRequest, NextResponse } from "next/server";
import { initDB } from "@/lib/db";
import { getTradeBacktest, saveTradeBacktest } from "@/lib/tradeBacktest";

export const maxDuration = 300;

export async function GET() {
  await initDB();
  return NextResponse.json({ backtest: await getTradeBacktest() });
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await initDB();
  return NextResponse.json({ backtest: await saveTradeBacktest() });
}
