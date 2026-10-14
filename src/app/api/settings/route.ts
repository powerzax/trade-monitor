import { NextRequest, NextResponse } from "next/server";
import { sql, initDB } from "@/lib/db";

const ALLOWED = new Set(["risk_budget_thb"]);

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") ?? "";
  if (!ALLOWED.has(key)) return NextResponse.json({ error: "Unknown key" }, { status: 400 });
  await initDB();
  const rows = await sql`SELECT value FROM settings WHERE key = ${key}`;
  return NextResponse.json({ key, value: rows[0]?.value ?? null });
}

export async function PUT(req: NextRequest) {
  const { key, value } = await req.json().catch(() => ({}));
  if (!ALLOWED.has(key)) return NextResponse.json({ error: "Unknown key" }, { status: 400 });
  const v = String(value ?? "").slice(0, 100);
  await initDB();
  await sql`
    INSERT INTO settings (key, value) VALUES (${key}, ${v})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
  return NextResponse.json({ ok: true });
}
