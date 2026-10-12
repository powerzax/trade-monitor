import { NextResponse } from "next/server";
import { saveAccuracy } from "@/lib/accuracy";

export const maxDuration = 120;

export async function GET() {
  return NextResponse.json(await saveAccuracy());
}
