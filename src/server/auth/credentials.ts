import { verify } from "@node-rs/argon2";
import { prisma } from "@/server/db/prisma";
import { clientIpFrom, hashIp } from "@/server/http/ip";
import { consumeLoginThrottle, resetLoginThrottle } from "@/server/http/rateLimit";
import { recordLogin } from "@/server/services/activity";

/**
 * Credentials verification (T016, US3.1/US3.4/FR-022).
 *
 * Extracted from the Auth.js provider so the sign-in + lockout + attempt
 * bookkeeping is directly integration-testable (T046). The provider in
 * `auth.ts` delegates here — behaviour is unchanged.
 *
 * - argon2id password verification (`@node-rs/argon2`)
 * - every attempt (success/failure/lockout) recorded in `AuthAttempt`
 *   with a hashed IP (data-model.md §2.16, US3.4)
 * - account lockout: 5 consecutive failures lock the account for 15 minutes
 *   (data-model.md §2.1 failedLogins/lockedUntil)
 * - the in-process account+IP throttle (5 / 15 min) lives in
 *   `http/rateLimit.ts` and complements the durable DB lockout
 * - never reveals whether an account exists (no user enumeration)
 */

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;
const LOCKOUT_MS = LOCKOUT_MINUTES * 60 * 1000;

/** Identity-only claims handed to the JWT (roles are never trusted here). */
export interface CredentialIdentity {
  id: string;
  email: string;
  name: string;
  tokenVersion: number;
}

export interface CredentialInput {
  email?: unknown;
  password?: unknown;
}

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

/**
 * Record a refused sign-in on the append-only activity log (admin-api.md §11 —
 * "login success/failure"). The attempt is attributed to the account it
 * targeted; an address that belongs to no account has no actor to attribute it
 * to, so the durable `AuthAttempt` row stays the record for those (the log's
 * `actorId` is a required staff reference).
 */
async function recordFailedLogin(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) {
    return;
  }
  await recordLogin({ actorId: user.id, success: false });
}

/**
 * Verify credentials for one sign-in attempt.
 * Returns the identity-only claims on success, or `null` when the attempt is
 * refused (unknown/inactive account, wrong password, throttle, or lockout).
 */
export async function authenticateWithCredentials(
  input: CredentialInput,
  headers: Headers,
): Promise<CredentialIdentity | null> {
  const email = String(input?.email ?? "")
    .trim()
    .toLowerCase();
  const password = String(input?.password ?? "");
  if (!email || !password) {
    return null;
  }

  const ip = clientIpFrom(headers);
  const ipHash = hashIp(ip);
  const now = new Date();

  // In-process account+IP throttle (US3.4): 5 / 15 min, then lockout.
  const throttle = consumeLoginThrottle(email, ip);
  if (!throttle.allowed) {
    await recordAttempt({ email, ipHash, success: false, lockedOut: true });
    await recordFailedLogin(email);
    return null;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) {
    // Do not reveal whether the account exists (avoid user enumeration).
    await recordAttempt({ email, ipHash, success: false });
    await recordFailedLogin(email);
    return null;
  }

  if (user.lockedUntil && user.lockedUntil > now) {
    await recordAttempt({ email, ipHash, success: false, lockedOut: true });
    await recordFailedLogin(email);
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
    await recordFailedLogin(email);
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
  await recordLogin({ actorId: user.id, success: true });
  resetLoginThrottle(email, ip);

  // Identity-only: id + revocation claim. Roles are never trusted from
  // the token — they are loaded from the DB on every request (US12.4).
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    tokenVersion: user.tokenVersion,
  };
}
