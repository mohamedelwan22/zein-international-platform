import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { DefaultSession } from "next-auth";
import { verify } from "@node-rs/argon2";
import { prisma } from "@/server/db/prisma";
import { clientIpFrom, hashIp } from "@/server/http/ip";
import { consumeLoginThrottle, resetLoginThrottle } from "@/server/http/rateLimit";
import { authConfig } from "./auth.config";

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

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;

const LOCKOUT_MS = LOCKOUT_MINUTES * 60 * 1000;

async function recordAttempt(params: {
  email: string;
  ipHash: string;
  success: boolean;
  lockedOut?: boolean;
}) {
  await prisma.authAttempt.create({
    data: {
      email: params.email,
      ipHash: params.ipHash,
      success: params.success,
      lockedOut: params.lockedOut ?? false,
    },
  });
}

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const email = String(credentials?.email ?? "")
          .trim()
          .toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) {
          return null;
        }

        const headers = new Headers(request?.headers);
        const ip = clientIpFrom(headers);
        const ipHash = hashIp(ip);
        const now = new Date();

        // In-process account+IP throttle (US3.4): 5 / 15 min, then lockout.
        const throttle = consumeLoginThrottle(email, ip);
        if (!throttle.allowed) {
          await recordAttempt({ email, ipHash, success: false, lockedOut: true });
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.active) {
          // Do not reveal whether the account exists (avoid user enumeration).
          await recordAttempt({ email, ipHash, success: false });
          return null;
        }

        if (user.lockedUntil && user.lockedUntil > now) {
          await recordAttempt({ email, ipHash, success: false, lockedOut: true });
          return null;
        }

        const passwordValid = await verify(user.passwordHash, password);
        if (!passwordValid) {
          const failedLogins = user.failedLogins + 1;
          const lock = failedLogins >= MAX_FAILED_LOGINS;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLogins: lock ? 0 : failedLogins,
              lockedUntil: lock ? new Date(now.getTime() + LOCKOUT_MS) : user.lockedUntil,
            },
          });
          await recordAttempt({ email, ipHash, success: false, lockedOut: lock });
          return null;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLogins: 0,
            lockedUntil: null,
            lastLoginAt: now,
          },
        });
        await recordAttempt({ email, ipHash, success: true });
        resetLoginThrottle(email, ip);

        // Identity-only: id + revocation claim. Roles are never trusted from
        // the token — they are loaded from the DB on every request (US12.4).
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          tokenVersion: user.tokenVersion,
        };
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
