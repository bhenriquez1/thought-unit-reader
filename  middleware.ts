// middleware.ts
import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Let these paths through without auth
  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/pdf.worker.min.mjs" ||
    pathname === "/_gate" ||
    pathname === "/api/preview-login" ||
    pathname === "/api/preview-logout"
  ) {
    return NextResponse.next();
  }

  // Already authenticated?
  const authed = req.cookies.get("preview_auth")?.value === "ok";
  if (authed) return NextResponse.next();

  // Not authed → send to gate, preserving where they were going
  const url = req.nextUrl.clone();
  url.pathname = "/_gate";
  url.searchParams.set("r", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  // protect everything except the allowed paths above
  matcher: ["/((?!_next/|favicon.ico|robots.txt|pdf.worker.min.mjs|_gate|api/preview-login|api/preview-logout).*)"],
};