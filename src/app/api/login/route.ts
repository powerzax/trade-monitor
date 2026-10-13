import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, AUTH_MAX_AGE, sessionToken, safeEqual } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const pin = process.env.APP_PIN;
  if (!pin) return NextResponse.json({ ok: true });
  const { pin: given } = await req.json().catch(() => ({ pin: "" }));
  if (!safeEqual(String(given ?? ""), pin)) {
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: "PIN ไม่ถูกต้อง" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, await sessionToken(pin), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: AUTH_MAX_AGE,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
