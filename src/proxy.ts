import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import NextAuth from "next-auth";
import type { NextAuthRequest } from "next-auth";
import { authConfig } from "@/server/auth/auth.config";
import { routing } from "@/i18n/routing";
import { evaluateMutationOrigin } from "@/server/http/origin-guard";

/**
 * Proxy (T021 — Next.js 16 renamed the middleware convention to proxy).
 *
 * 1. Locale routing (FR-001): detect locale, redirect/persist the choice
 *    (NEXT_LOCALE cookie) while preserving the current location.
 * 2. UX-level /admin gate: unauthenticated visitors are redirected to the
 *    sign-in page using the edge-safe auth.config. This is UX only — real
 *    authorization is enforced server-side by requirePermission (FR-022);
 *    no role claims are ever trusted here.
 * 3. Origin guard (T110): every state-changing request under /api must be
 *    same-origin. Auth.js handles its own CSRF for /api/auth, which is
 *    excluded from the matcher below.
 */

const handleI18nRouting = createMiddleware(routing);

/** Matches /admin, /en/admin/…, /ar/admin/… (the admin tree lives under [locale]). */
function isAdminPath(pathname: string): boolean {
  return pathname
    .split("/")
    .filter(Boolean)
    .some((segment, index) => index <= 1 && segment === "admin");
}

const { auth: withAuth } = NextAuth(authConfig);

const handler = withAuth((request: NextAuthRequest, event: NextFetchEvent) => {
  // Event is required by the NextAuthMiddleware signature but unused here.
  void event;
  // UX-level admin gate (FR-022: real authorization stays in requirePermission).
  if (isAdminPath(request.nextUrl.pathname) && !request.auth) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return handleI18nRouting(request);
});

function guardApiMutation(request: NextRequest): NextResponse | null {
  const decision = evaluateMutationOrigin({
    method: request.method,
    origin: request.headers.get("origin"),
    host: request.headers.get("host"),
    forwardedHost: request.headers.get("x-forwarded-host"),
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? null,
    fetchSite: request.headers.get("sec-fetch-site"),
  });
  if (decision.allowed) {
    return null;
  }
  return NextResponse.json(
    { error: "Cross-origin request rejected" },
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return guardApiMutation(request) ?? NextResponse.next();
  }
  return handler(request as NextAuthRequest, undefined as unknown as NextFetchEvent);
}

export const config = {
  // Skip Next internals, Auth.js (it enforces its own CSRF token), and any
  // path with a file extension. API routes stay matched for the Origin guard.
  matcher: ["/((?!api/auth|_next|_vercel|.*\\..*).*)"],
};
