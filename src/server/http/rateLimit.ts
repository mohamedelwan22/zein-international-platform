import { prisma } from "@/server/db/prisma";
import { rateLimited } from "./errors";
import { clientIpFrom } from "./ip";

/**
 * Rate limiting (T019, FR-019, contracts/README.md §7).
 *
 * - Public endpoints use PostgreSQL-backed fixed-window counters
 *   (`RateLimitCounter`) so limits survive restarts without new
 *   infrastructure (Constitution X).
 * - Login throttling is in-process ("5 / 15 min / account+IP" then lockout,
 *   US3.4) and complements the DB-level account lockout in auth.ts.
 *
 * Exceeding a limit throws `429 RATE_LIMITED` with `Retry-After` (seconds).
 */

export const RATE_LIMITS = {
  /** POST /api/inquiries, /api/partnerships — 5 per 10 min per IP+email. */
  lead: { limit: 5, windowMs: 10 * 60 * 1000 },
  /** GET /api/search — 30 per min per IP. */
  search: { limit: 30, windowMs: 60 * 1000 },
  /** Login — 5 per 15 min per account+IP, in-process. */
  login: { limit: 5, windowMs: 15 * 60 * 1000 },
} as const;

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the current window resets (only when not allowed). */
  retryAfterSec?: number;
}

/**
 * Consume one unit from a PostgreSQL-backed fixed window.
 * Atomic: a single INSERT … ON CONFLICT increments and returns the count.
 */
export async function consumeRateLimit(params: {
  bucketKey: string;
  limit: number;
  windowMs: number;
}): Promise<RateLimitResult> {
  const { bucketKey, limit, windowMs } = params;
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);

  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitCounter" ("bucketKey", "windowStart", "count")
    VALUES (${bucketKey}, ${windowStart}, 1)
    ON CONFLICT ("bucketKey", "windowStart")
    DO UPDATE SET "count" = "RateLimitCounter"."count" + 1
    RETURNING "count"
  `;
  const count = rows[0]?.count ?? 1;
  if (count <= limit) {
    return { allowed: true };
  }
  const windowEndMs = windowStart.getTime() + windowMs;
  const retryAfterSec = Math.max(1, Math.ceil((windowEndMs - now) / 1000));
  return { allowed: false, retryAfterSec };
}

/** Throw the localized-friendly 429 envelope when the limit is exceeded. */
export async function enforceRateLimit(params: {
  bucketKey: string;
  limit: number;
  windowMs: number;
}): Promise<void> {
  const result = await consumeRateLimit(params);
  if (!result.allowed) {
    throw rateLimited(result.retryAfterSec ?? 60);
  }
}

/** Lead submissions: 5 / 10 min / IP+email (contracts/README.md §7). */
export async function enforceLeadRateLimit(ip: string, email: string): Promise<void> {
  await enforceRateLimit({
    bucketKey: `lead:${ip}:${email.trim().toLowerCase()}`,
    ...RATE_LIMITS.lead,
  });
}

/** Search: 30 / min / IP (contracts/README.md §7). */
export async function enforceSearchRateLimit(ip: string): Promise<void> {
  await enforceRateLimit({
    bucketKey: `search:${ip}`,
    ...RATE_LIMITS.search,
  });
}

// ---------------------------------------------------------------------------
// In-process login throttle (US3.4) — account+IP fixed window.
// The durable account lockout (failedLogins/lockedUntil) lives in auth.ts.
// ---------------------------------------------------------------------------

interface LoginWindow {
  windowStart: number;
  count: number;
}

const globalForThrottle = globalThis as unknown as {
  zeinLoginThrottle?: Map<string, LoginWindow>;
};

const loginThrottle: Map<string, LoginWindow> =
  globalForThrottle.zeinLoginThrottle ?? new Map();
globalForThrottle.zeinLoginThrottle = loginThrottle;

/**
 * Consume one login attempt against the in-process account+IP window.
 * Not durable by design (§7 "in-process"); the DB lockout covers durability.
 */
export function consumeLoginThrottle(account: string, ip: string): RateLimitResult {
  const key = `login:${account.trim().toLowerCase()}:${ip}`;
  const now = Date.now();
  const { limit, windowMs } = RATE_LIMITS.login;
  const windowStart = Math.floor(now / windowMs) * windowMs;

  const existing = loginThrottle.get(key);
  if (!existing || existing.windowStart !== windowStart) {
    loginThrottle.set(key, { windowStart, count: 1 });
    if (loginThrottle.size > 10_000) {
      // Bounded memory: drop stale windows when the map grows large.
      for (const [k, w] of loginThrottle) {
        if (w.windowStart !== windowStart) loginThrottle.delete(k);
      }
    }
    return { allowed: true };
  }

  existing.count += 1;
  if (existing.count <= limit) {
    return { allowed: true };
  }
  const retryAfterSec = Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000));
  return { allowed: false, retryAfterSec };
}

/** Reset the in-process throttle for an account+IP after a successful login. */
export function resetLoginThrottle(account: string, ip: string): void {
  loginThrottle.delete(`login:${account.trim().toLowerCase()}:${ip}`);
}

/** Convenience: client IP from a Headers object (proxy-aware). */
export { clientIpFrom };
