import { NextRequest, NextResponse } from "next/server";
import { getLatestAccuracy, saveAccuracy } from "@/lib/accuracy";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("latest") === "1") return NextResponse.json(await getLatestAccuracy());
  return NextResponse.json(await saveAccuracy());
}
