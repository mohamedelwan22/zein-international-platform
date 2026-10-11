import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hash } from "@node-rs/argon2";

/**
 * T046 [US3] — authentication + RBAC integration test (FR-003/021/022, US3.4).
 *
 * Runs against a real database (ephemeral Postgres, migrations applied):
 * - sign-in success/failure + no user enumeration;
 * - "5 / 15 min / account+IP" throttle and durable account lockout with a
 *   recorded `AuthAttempt` row for success/failure/lockout, plus localized
 *   lockout feedback;
 * - `tokenVersion` bump revokes an existing session immediately (US12.4);
 * - a missing/expired session forces re-authentication;
 * - a denied privileged action returns 403 and changes no data (FR-022,
 *   SC-004).
 *
 * `auth()` (the session provider) is mocked so the authorization layer can be
 * exercised without an HTTP request context; the credential + authorization
 * code paths run for real against the DB.
 */

const authMock = vi.hoisted(() => vi.fn());
vi.mock("../../src/server/auth/auth", () => ({ auth: authMock }));

import { prisma } from "@/server/db/prisma";
import { authenticateWithCredentials } from "@/server/auth/credentials";
import { getSessionUser, requirePermission } from "@/server/auth/authorize";
import type { Role } from "@/server/auth/permissions";
import { consumeLoginThrottle, resetLoginThrottle } from "@/server/http/rateLimit";
import en from "@/i18n/messages/en.json";
import ar from "@/i18n/messages/ar.json";

const TEST_DOMAIN = "@auth-it.test";
const PASSWORD = "Correct-Horse-Battery-1";
let passwordHash = "";

function uniqueEmail(): string {
  return `auth-${randomUUID()}${TEST_DOMAIN}`;
}

function headersWithIp(ip = "203.0.113.7"): Headers {
  return new Headers({ "x-forwarded-for": ip });
}

async function createUser(
  overrides: {
    email?: string;
    role?: Role;
    active?: boolean;
    tokenVersion?: number;
  } = {},
) {
  return prisma.user.create({
    data: {
      email: overrides.email ?? uniqueEmail(),
      name: "Auth Test User",
      passwordHash,
      role: overrides.role ?? "SuperAdmin",
      active: overrides.active ?? true,
      tokenVersion: overrides.tokenVersion ?? 1,
    },
  });
}

beforeAll(async () => {
  passwordHash = await hash(PASSWORD);
});

beforeEach(async () => {
  authMock.mockReset();
  await prisma.authAttempt.deleteMany({});
  await prisma.user.deleteMany({ where: { email: { endsWith: TEST_DOMAIN } } });
});

describe("credential sign-in (US3.1)", () => {
  it("signs in an active user with a valid password and records a success attempt", async () => {
    const user = await createUser();

    const identity = await authenticateWithCredentials(
      { email: user.email, password: PASSWORD },
      headersWithIp(),
    );

    expect(identity).toMatchObject({
      id: user.id,
      email: user.email,
      tokenVersion: user.tokenVersion,
    });

    const attempt = await prisma.authAttempt.findFirst({
      where: { email: user.email, success: true },
    });
    expect(attempt).not.toBeNull();

    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(refreshed.lastLoginAt).not.toBeNull();
    expect(refreshed.failedLogins).toBe(0);
    expect(refreshed.lockedUntil).toBeNull();
  });

  it("refuses an unknown or inactive account without revealing which", async () => {
    const unknownEmail = uniqueEmail();
    expect(
      await authenticateWithCredentials(
        { email: unknownEmail, password: PASSWORD },
        headersWithIp(),
      ),
    ).toBeNull();
    expect(
      await prisma.authAttempt.count({ where: { email: unknownEmail, success: false } }),
    ).toBe(1);

    const inactive = await createUser({ active: false });
    expect(
      await authenticateWithCredentials(
        { email: inactive.email, password: PASSWORD },
        headersWithIp(),
      ),
    ).toBeNull();
    expect(
      await prisma.authAttempt.count({ where: { email: inactive.email, success: false } }),
    ).toBe(1);
  });

  it("records a failure and increments failedLogins on a wrong password", async () => {
    const user = await createUser();

    expect(
      await authenticateWithCredentials(
        { email: user.email, password: "not-the-password" },
        headersWithIp(),
      ),
    ).toBeNull();

    const refreshed = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(refreshed.failedLogins).toBe(1);
    expect(
      await prisma.authAttempt.count({
        where: { email: user.email, success: false, lockedOut: false },
      }),
    ).toBe(1);
  });
});

describe("login throttling + account lockout (US3.4)", () => {
  it("throttles the 6th attempt in the 15-minute account+IP window", () => {
    const account = uniqueEmail();
    const ip = "198.51.100.10";

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(consumeLoginThrottle(account, ip).allowed).toBe(true);
    }

    const sixth = consumeLoginThrottle(account, ip);
    expect(sixth.allowed).toBe(false);
    expect(sixth.retryAfterSec).toBeGreaterThan(0);

    resetLoginThrottle(account, ip);
  });

  it("locks the account for ~15 minutes after 5 consecutive failures and records a lockout event", async () => {
    const user = await createUser();
    const ip = "198.51.100.23";

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(
        await authenticateWithCredentials(
          { email: user.email, password: "wrong-password" },
          headersWithIp(ip),
        ),
      ).toBeNull();
    }

    const locked = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(locked.lockedUntil).not.toBeNull();
    const lockMs = locked.lockedUntil!.getTime() - Date.now();
    expect(lockMs).toBeGreaterThan(0);
    expect(lockMs).toBeLessThanOrEqual(15 * 60 * 1000 + 5_000);
    expect(
      await prisma.authAttempt.count({ where: { email: user.email, lockedOut: true } }),
    ).toBeGreaterThanOrEqual(1);

    // Even the correct password is refused while the durable lock is active
    // (reset the in-process throttle first to prove the DB lock is enforcing).
    resetLoginThrottle(user.email, ip);
    expect(
      await authenticateWithCredentials(
        { email: user.email, password: PASSWORD },
        headersWithIp(ip),
      ),
    ).toBeNull();
    expect(
      await prisma.authAttempt.count({ where: { email: user.email, success: true } }),
    ).toBe(0);
  });

  it("ships localized lockout and rate-limit feedback in both locales (FR-003)", () => {
    expect(en.auth.accountLocked.length).toBeGreaterThan(0);
    expect(ar.auth.accountLocked.length).toBeGreaterThan(0);
    expect(en.errors.rateLimited.length).toBeGreaterThan(0);
    expect(ar.errors.rateLimited.length).toBeGreaterThan(0);
  });
});

describe("session identity + authorization (FR-022, US12.4)", () => {
  it("rejects a stale tokenVersion immediately (revocation) and accepts the current version", async () => {
    const user = await createUser({ tokenVersion: 1 });
    authMock.mockResolvedValue({ user: { id: user.id, tokenVersion: 1 } });

    await expect(getSessionUser()).resolves.toMatchObject({
      id: user.id,
      role: "SuperAdmin",
    });

    // Password change / deactivation bumps tokenVersion, invalidating the
    // outstanding JWT at the next request.
    await prisma.user.update({ where: { id: user.id }, data: { tokenVersion: 2 } });

    await expect(getSessionUser()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      status: 401,
    });

    // A token minted after the bump stays valid.
    authMock.mockResolvedValue({ user: { id: user.id, tokenVersion: 2 } });
    await expect(getSessionUser()).resolves.toMatchObject({ id: user.id });
  });

  it("treats a missing/expired session as unauthenticated and forces re-auth", async () => {
    authMock.mockResolvedValue(null);

    await expect(getSessionUser()).resolves.toBeNull();
    await expect(requirePermission("users:read")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      status: 401,
    });
  });

  it("denies a privileged action with 403 and changes no data", async () => {
    const manager = await createUser({ role: "ContentManager", tokenVersion: 1 });
    authMock.mockResolvedValue({ user: { id: manager.id, tokenVersion: 1 } });

    // Granted for the role → resolves to the session user.
    await expect(requirePermission("cms:publish")).resolves.toMatchObject({
      id: manager.id,
      role: "ContentManager",
    });

    // `users:*` is SuperAdmin-only → 403 FORBIDDEN.
    await expect(requirePermission("users:read")).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });

    const after = await prisma.user.findUniqueOrThrow({ where: { id: manager.id } });
    expect(after.role).toBe("ContentManager");
    expect(after.active).toBe(true);
    expect(after.tokenVersion).toBe(1);
  });
});
