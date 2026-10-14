import { NextRequest, NextResponse } from "next/server";
import { sql, initDB } from "@/lib/db";

type Row = { id: number; side: string; qty: number; bought_at: string };

// Replays a symbol's trades in date order and reports the first sale that sells more than was held then.
function sequenceError(rows: Row[]) {
  let held = 0;
  for (const r of [...rows].sort((a, b) => a.bought_at.localeCompare(b.bought_at) || a.id - b.id)) {
    held += r.side === "sell" ? -r.qty : r.qty;
    if (held < -1e-9) return `วันที่ ${r.bought_at} จะขายเกินกว่าที่ถืออยู่ตอนนั้น (ขาด ${Math.round(-held * 1e6) / 1e6} หน่วย)`;
  }
  return null;
}

async function rowsFor(symbol: string): Promise<Row[]> {
  return (await sql`SELECT id, side, qty::float AS qty, to_char(bought_at, 'YYYY-MM-DD') AS bought_at FROM positions WHERE symbol = ${symbol}`) as Row[];
}

const validDate = (d: unknown) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);

export async function GET() {
  await initDB();
  const rows = await sql`
    SELECT p.id, p.symbol, p.crypto, p.name, p.price::float AS price, p.qty::float AS qty, p.side,
           to_char(p.bought_at, 'YYYY-MM-DD') AS bought_at,
           ai.suggestion AS ai_suggestion, ai.action AS ai_action, ai.action_th AS ai_action_th,
           to_char(ai.created_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') AS ai_at
    FROM positions p
    LEFT JOIN LATERAL (
      SELECT result->>'suggestion' AS suggestion,
             result->'positionAdvice'->>'action' AS action,
             result->'positionAdvice'->>'actionTH' AS action_th,
             a.created_at
      FROM analysis_cache a
      WHERE a.type = 'symbol' AND a.symbol = p.symbol
        AND a.created_at < (p.bought_at + 1)::timestamptz
        -- Buys only count advice from the 7 days before the purchase; sells keep their original unbounded lookup.
        AND (p.side = 'sell' OR a.created_at >= (p.bought_at - 7)::timestamptz)
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
    const err = sequenceError([...(await rowsFor(ticker)), { id: Number.MAX_SAFE_INTEGER, side: "sell", qty: q, bought_at: date }]);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
  }

  await sql`
    INSERT INTO positions (symbol, crypto, name, price, qty, bought_at, side)
    VALUES (${ticker}, ${!!crypto}, ${name ?? null}, ${p}, ${q}, ${date}, ${s})
  `;
  return GET();
}

export async function PATCH(req: NextRequest) {
  await initDB();
  const { id, price, qty, boughtAt } = await req.json();
  const p = Number(price), q = Number(qty);
  if (!id || !(p > 0) || !(q > 0) || !validDate(boughtAt)) return NextResponse.json({ error: "กรอกราคา จำนวน และวันที่ให้ถูกต้อง" }, { status: 400 });
  const cur = await sql`SELECT symbol FROM positions WHERE id = ${id}`;
  if (!cur.length) return NextResponse.json({ error: "ไม่พบรายการนี้" }, { status: 404 });
  const rows = (await rowsFor(cur[0].symbol)).map((r) => (r.id === id ? { ...r, qty: q, bought_at: boughtAt } : r));
  const err = sequenceError(rows);
  if (err) return NextResponse.json({ error: `แก้ไม่ได้: ${err}` }, { status: 400 });
  await sql`UPDATE positions SET price = ${p}, qty = ${q}, bought_at = ${boughtAt} WHERE id = ${id}`;
  return GET();
}

export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (symbol) {
    await sql`DELETE FROM positions WHERE symbol = ${symbol}`;
    return GET();
  }
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const cur = await sql`SELECT symbol FROM positions WHERE id = ${id}`;
  if (!cur.length) return GET();
  const err = sequenceError((await rowsFor(cur[0].symbol)).filter((r) => r.id !== id));
  if (err) return NextResponse.json({ error: `ลบไม่ได้: ${err} ลบรายการขายที่เกี่ยวข้องก่อน` }, { status: 400 });
  await sql`DELETE FROM positions WHERE id = ${id}`;
  return GET();
}
