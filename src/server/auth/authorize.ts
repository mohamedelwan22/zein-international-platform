import { auth } from "./auth";
import { hasPermission, type Permission, type Role } from "./permissions";
import { forbidden, unauthorized } from "@/server/http/errors";
import { prisma } from "@/server/db/prisma";
import { logger } from "@/lib/logger";

/**
 * Per-request authorization (T018, FR-022, US12.4).
 *
 * The JWT is used ONLY as an identity proof. On every request the user row
 * (role, active, tokenVersion) is loaded fresh from the database, so role
 * changes and deactivations apply at the next action; a stale tokenVersion
 * (bumped on password change/deactivation) yields 401 immediately.
 */

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
}

/**
 * Resolve the current session user from the identity-only JWT + database.
 * Returns null when unauthenticated; throws 401 UNAUTHORIZED when the token
 * version is stale (revoked) — callers surface the localized error envelope.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const tokenUserId = session?.user?.id;
  if (!tokenUserId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: tokenUserId },
    select: { id: true, email: true, name: true, role: true, active: true, tokenVersion: true },
  });

  if (!user || !user.active) {
    return null;
  }

  const sessionTokenVersion = session.user.tokenVersion;
  if (sessionTokenVersion === undefined || sessionTokenVersion !== user.tokenVersion) {
    logger.warn({ userId: user.id }, "Stale tokenVersion — session revoked");
    throw unauthorized("Session revoked");
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    active: user.active,
  };
}

/**
 * Require a permission for the current request (FR-022).
 * 401 on missing/revoked session, 403 on missing permission.
 */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw unauthorized();
  }
  if (!hasPermission(user.role, permission)) {
    throw forbidden();
  }
  return user;
}
