import { NextRequest, NextResponse } from "next/server";
import { sql, initDB } from "@/lib/db";

async function ensureInit() {
  await initDB();
}

export async function GET() {
  await ensureInit();
  const rows = await sql`SELECT symbol, crypto, name FROM favorites ORDER BY created_at DESC`;
  return NextResponse.json({ favorites: rows });
}

export async function POST(req: NextRequest) {
  await ensureInit();
  const { symbol, crypto, name } = await req.json();
  await sql`
    INSERT INTO favorites (symbol, crypto, name)
    VALUES (${symbol}, ${crypto}, ${name})
    ON CONFLICT (symbol) DO UPDATE SET name = ${name}, crypto = ${crypto}
  `;
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { symbol } = await req.json();
  await sql`DELETE FROM favorites WHERE symbol = ${symbol}`;
  return NextResponse.json({ ok: true });
}
