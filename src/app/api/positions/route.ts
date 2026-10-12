import { NextRequest, NextResponse } from "next/server";
import { sql, initDB } from "@/lib/db";

export async function GET() {
  await initDB();
  const rows = await sql`
    SELECT id, symbol, crypto, name, price::float AS price, qty::float AS qty, to_char(bought_at, 'YYYY-MM-DD') AS bought_at
    FROM positions ORDER BY bought_at DESC, id DESC
  `;
  return NextResponse.json({ positions: rows });
}

export async function POST(req: NextRequest) {
  await initDB();
  const { symbol, crypto, name, price, qty, boughtAt } = await req.json();
  const p = Number(price), q = Number(qty);
  if (!symbol || !(p > 0) || !(q > 0)) return NextResponse.json({ error: "กรอกชื่อ ราคา และจำนวนให้ถูกต้อง" }, { status: 400 });
  const ticker = crypto ? `${String(symbol).toUpperCase().replace(/-USD$/, "")}-USD` : String(symbol).toUpperCase();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(boughtAt ?? "") ? boughtAt : new Date().toISOString().slice(0, 10);
  const rows = await sql`
    INSERT INTO positions (symbol, crypto, name, price, qty, bought_at)
    VALUES (${ticker}, ${!!crypto}, ${name ?? null}, ${p}, ${q}, ${date})
    RETURNING id, symbol, crypto, name, price::float AS price, qty::float AS qty, to_char(bought_at, 'YYYY-MM-DD') AS bought_at
  `;
  return NextResponse.json({ position: rows[0] });
}

export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await sql`DELETE FROM positions WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
