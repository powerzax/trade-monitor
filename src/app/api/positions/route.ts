import { NextRequest, NextResponse } from "next/server";
import { sql, initDB } from "@/lib/db";

export async function GET() {
  await initDB();
  const rows = await sql`
    SELECT p.id, p.symbol, p.crypto, p.name, p.price::float AS price, p.qty::float AS qty, p.side,
           to_char(p.bought_at, 'YYYY-MM-DD') AS bought_at,
           ai.suggestion AS ai_suggestion, ai.action AS ai_action, ai.action_th AS ai_action_th
    FROM positions p
    LEFT JOIN LATERAL (
      SELECT result->>'suggestion' AS suggestion,
             result->'positionAdvice'->>'action' AS action,
             result->'positionAdvice'->>'actionTH' AS action_th
      FROM analysis_cache a
      WHERE p.side = 'sell' AND a.type = 'symbol' AND a.symbol = p.symbol
        AND a.created_at < (p.bought_at + 1)::timestamptz
      ORDER BY a.created_at DESC LIMIT 1
    ) ai ON true
    ORDER BY p.bought_at ASC, p.id ASC
  `;
  return NextResponse.json({ positions: rows });
}

export async function POST(req: NextRequest) {
  await initDB();
  const { symbol, crypto, name, price, qty, boughtAt, side } = await req.json();
  const p = Number(price), q = Number(qty);
  const s = side === "sell" ? "sell" : "buy";
  if (!symbol || !(p > 0) || !(q > 0)) return NextResponse.json({ error: "กรอกชื่อ ราคา และจำนวนให้ถูกต้อง" }, { status: 400 });
  const ticker = crypto ? `${String(symbol).toUpperCase().replace(/-USD$/, "")}-USD` : String(symbol).toUpperCase();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(boughtAt ?? "") ? boughtAt : new Date().toISOString().slice(0, 10);

  if (s === "sell") {
    const held = await sql`SELECT COALESCE(SUM(CASE WHEN side = 'sell' THEN -qty ELSE qty END), 0)::float AS q FROM positions WHERE symbol = ${ticker}`;
    if (q > held[0].q + 1e-9) return NextResponse.json({ error: `ขายได้ไม่เกินที่ถืออยู่ (${held[0].q} หน่วย)` }, { status: 400 });
  }

  await sql`
    INSERT INTO positions (symbol, crypto, name, price, qty, bought_at, side)
    VALUES (${ticker}, ${!!crypto}, ${name ?? null}, ${p}, ${q}, ${date}, ${s})
  `;
  return GET();
}

export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await sql`DELETE FROM positions WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
