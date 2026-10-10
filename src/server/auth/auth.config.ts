import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js configuration (T016) — NO adapter, NO database access,
 * NO Node-only imports. Shared by:
 *
 *  - `src/server/auth/auth.ts` (Node runtime — Credentials provider, DB, argon2)
 *  - `src/proxy.ts` (T021 — UX-level /admin gate; authorization itself is
 *    always enforced server-side by requirePermission, FR-022)
 *
 * The session token is identity-only: it carries the user id and a
 * tokenVersion revocation claim — never a role (roles are loaded from the
 * database on every request, US12.4).
 */
export const authConfig = {
  pages: {
    // Locale routing (T020) redirects /login → /{locale}/login.
    signIn: "/login",
  },
  session: {
    // Required by the Credentials provider (research.md §4).
    strategy: "jwt",
  },
  secret: process.env.AUTH_SECRET,
  providers: [], // Providers with Node dependencies live in auth.ts only.
} satisfies NextAuthConfig;
