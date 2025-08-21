// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Two independent gates you can toggle via env:
 *
 * 1) PREVIEW_LOCK_ENABLED=1
 *    - simple preview/password gate (uses `preview_auth=1` cookie)
 *
 * 2) AUTH_LOCK_ENABLED=1
 *    - requires a Firebase session cookie set by the client (`rb_token` or `rb_uid`)
 *    - middleware can't show UI, so it redirects to /signin when missing
 */

const PREVIEW_ENABLED = process.env.PREVIEW_LOCK_ENABLED === "1";
const AUTH_ENABLED = process.env.AUTH_LOCK_ENABLED === "1";

// Exact paths that should always bypass
const BYPASS_EXACT = new Set<string>([
  "/_gate",
  "/api/preview-login",
  "/api/preview-logout",
  "/api/proxy-pdf",
  "/pdf.worker.min.mjs",
  "/robots.txt",
  "/favicon.ico",
  "/openapi.yaml",
  "/signin", // allow sign-in page
]);

// Prefixes that should always pass (static assets, Next internals, API)
const BYPASS_PREFIXES = [
  "/_next/",
  "/images/",
  "/assets/",
  "/fonts/",
  "/api/",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow specific exact paths
  if (BYPASS_EXACT.has(pathname)) return NextResponse.next();

  // Allow known static/api prefixes
  if (BYPASS_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // --- Preview lock (optional) ---
  if (PREVIEW_ENABLED) {
    const authed = req.cookies.get("preview_auth")?.value === "ok";
    if (!authed) {
      const url = req.nextUrl.clone();
      url.pathname = "/_gate";
      url.searchParams.set("r", pathname + (req.nextUrl.search ?? ""));
      return NextResponse.redirect(url);
    }
  }

  // --- Auth lock (optional) ---
  if (AUTH_ENABLED) {
    const isPublic =
      pathname === "/" ||
      pathname.startsWith("/signin") ||
      pathname.startsWith("/privacy") ||
      pathname.startsWith("/terms");

    if (!isPublic) {
      const hasSession =
        Boolean(req.cookies.get("rb_token")?.value) ||
        Boolean(req.cookies.get("rb_uid")?.value);

      if (!hasSession) {
        const url = req.nextUrl.clone();
        url.pathname = "/signin";
        url.searchParams.set("from", pathname + (req.nextUrl.search ?? ""));
        return NextResponse.redirect(url);
      }
    }
  }

  return NextResponse.next();
}

// Match "almost everything", but skip obvious static files by extension.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map)).*)",
  ],
};
