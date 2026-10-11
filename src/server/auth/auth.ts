import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { DefaultSession } from "next-auth";
import { authConfig } from "./auth.config";
import { authenticateWithCredentials } from "./credentials";

/**
 * Node-side Auth.js setup (T016).
 *
 * - Credentials provider with argon2id password verification
 * - JWT session strategy (required by the Credentials provider)
 * - Identity-only token: user id + tokenVersion revocation claim — no role
 *   claims are trusted from the token (roles load from the DB per request)
 * - Every sign-in attempt (success/failure/lockout) is recorded in
 *   `AuthAttempt` with a hashed IP (data-model.md §2.16, US3.4)
 * - Account lockout: 5 consecutive failures lock the account for 15 minutes
 *   (data-model.md §2.1 failedLogins/lockedUntil; the in-process
 *   account+IP throttle lives in http/rateLimit.ts, US3.4)
 *
 * Credential verification itself lives in `./credentials` (extracted for
 * direct integration coverage in T046); the provider only adapts the
 * Auth.js request to that function.
 */

declare module "next-auth" {
  interface User {
    tokenVersion?: number;
  }
  interface Session {
    user: {
      id: string;
      tokenVersion?: number;
    } & DefaultSession["user"];
  }
}

/** Identity-only claims we put on the JWT (uid + revocation version). */
interface IdentityClaims {
  uid?: string;
  tokenVersion?: number;
}

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize(credentials, request) {
        // Credential verification + lockout/attempt bookkeeping is shared
        // with the T046 integration test via `./credentials`.
        return authenticateWithCredentials(credentials ?? {}, new Headers(request?.headers));
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      const claims = token as unknown as IdentityClaims;
      if (user) {
        claims.uid = user.id;
        claims.tokenVersion = user.tokenVersion;
      }
      return token;
    },
    session({ session, token }) {
      const claims = token as unknown as IdentityClaims;
      if (claims.uid) {
        // Identity + revocation claim only (minimal shape — not AdapterUser;
        // roles are never trusted from the token, requirePermission loads
        // them from the DB per request).
        session.user = {
          id: claims.uid,
          tokenVersion: claims.tokenVersion,
        } as typeof session.user;
      }
      return session;
    },
  },
});
