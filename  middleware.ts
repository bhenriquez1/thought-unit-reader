// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ENABLED = process.env.PREVIEW_LOCK_ENABLED === "1";

// Exact paths that must bypass the lock
const BYPASS_EXACT = new Set<string>([
  "/preview-login",
  "/api/preview-login",
  "/api/preview-logout",
  "/api/proxy-pdf",
  "/pdf.worker.min.mjs",
  "/robots.txt",
  "/favicon.ico",
  "/openapi.yaml",
]);

// Prefixes that should always pass (static assets, Next internals, etc.)
const BYPASS_PREFIXES = [
  "/_next/",        // Next.js internal assets
  "/images/",
  "/assets/",
  "/fonts/",
];

export function middleware(req: NextRequest) {
  if (!ENABLED) return NextResponse.next();

  const { pathname } = req.nextUrl;

  // Allow specific exact paths
  if (BYPASS_EXACT.has(pathname)) return NextResponse.next();

  // Allow known static prefixes
  if (BYPASS_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Require preview cookie for everything else
  const authed = req.cookies.get("preview_auth")?.value === "1";
  if (authed) return NextResponse.next();

  // Redirect to login page, preserving the original path
  const url = req.nextUrl.clone();
  url.pathname = "/preview-login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

// Match "almost everything", but skip obvious static files by extension.
// (pdf.worker is explicitly allowed above)
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map)).*)",
  ],
};