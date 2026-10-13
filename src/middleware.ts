import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, sessionToken, safeEqual } from "@/lib/auth";

const PUBLIC = ["/login", "/api/login", "/manifest.webmanifest", "/apple-icon", "/favicon.ico"];

export async function middleware(req: NextRequest) {
  const pin = process.env.APP_PIN;
  if (!pin) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (PUBLIC.includes(pathname) || pathname.startsWith("/pwa-icon/")) return NextResponse.next();

  const secret = process.env.CRON_SECRET;
  if (secret && safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) return NextResponse.next();

  const cookie = req.cookies.get(AUTH_COOKIE)?.value ?? "";
  if (cookie && safeEqual(cookie, await sessionToken(pin))) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "กรุณาใส่ PIN ก่อนใช้งาน" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
