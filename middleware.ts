import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

// Default-deny baseline for the API surface: every request under /api/**
// must carry a valid session token unless its path is explicitly allowed
// below. This does not replace each route's own requireSession()/
// requireAdmin()/requireWriteAccess()/requireSectionAccess() calls (those
// still enforce role- and section-specific rules) — it exists so a
// brand-new API route added in the future is protected automatically even
// if a developer forgets to call one of those guards, rather than being
// wide open by default. For every route that already calls a guard, this
// middleware is a harmless no-op duplicate check.
//
// Scope is deliberately limited to /api/**. Dashboard *pages* are not
// gated here — they are plain client components with no sensitive data of
// their own; the data they render is fetched from /api/** after mount,
// which this middleware does protect, and DashboardShell already redirects
// an unauthenticated browser to /login once the session resolves.
const PUBLIC_API_PREFIXES = [
  "/api/auth/", // NextAuth's own handler + find-email, forgot-password, reset-password
  "/api/setup", // one-time first-admin bootstrap; guarded internally (empty DB + non-production only)
];

// Exact-match public API paths (as opposed to prefixes above).
const PUBLIC_API_EXACT = new Set([
  "/api/settings/branding", // deliberately public — name/tagline/logo shown on the unauthenticated login page
]);

function isPublicApiPath(pathname: string): boolean {
  if (PUBLIC_API_EXACT.has(pathname)) return true;
  return PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicApiPath(pathname)) {
    return NextResponse.next();
  }

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
