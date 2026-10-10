import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import NextAuth from "next-auth";
import type { NextAuthRequest } from "next-auth";
import { authConfig } from "@/server/auth/auth.config";
import { routing } from "@/i18n/routing";

/**
 * Proxy (T021 — Next.js 16 renamed the middleware convention to proxy).
 *
 * 1. Locale routing (FR-001): detect locale, redirect/persist the choice
 *    (NEXT_LOCALE cookie) while preserving the current location.
 * 2. UX-level /admin gate: unauthenticated visitors are redirected to the
 *    sign-in page using the edge-safe auth.config. This is UX only — real
 *    authorization is enforced server-side by requirePermission (FR-022);
 *    no role claims are ever trusted here.
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

export function proxy(request: NextRequest) {
  return handler(request as NextAuthRequest, undefined as unknown as NextFetchEvent);
}

export const config = {
  // Skip API routes, Next internals, and any file with an extension.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
