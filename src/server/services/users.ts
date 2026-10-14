import { hash } from "@node-rs/argon2";
import { prisma } from "@/server/db/prisma";
import { createLogger } from "@/lib/logger";
import { badRequest, notFound, versionConflict } from "@/server/http/errors";
import type { Role } from "@/server/auth/permissions";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Staff account service (US12, T090, admin-api.md §8, data-model.md §2.1).
 *
 * Responsibilities:
 *   - list/create/update staff without ever exposing `passwordHash`;
 *   - assign only the canonical four roles;
 *   - enforce the documented guards — the last active Super Admin cannot be
 *     demoted or deactivated, and a user cannot deactivate themselves;
 *   - bump `tokenVersion` on deactivation and password reset so an outstanding
 *     JWT is revoked at the next request (US12.4);
 *   - write exactly one `ActivityLog` row per mutation (SC-012/FR-035).
 *
 * Authorization (who may call this) is enforced at the route layer via
 * `requirePermission("users:*")`.
 */

const logger = createLogger("users");

export interface UserItem {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  tokenVersion: number;
  version: number;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPage {
  items: UserItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** Projection that never selects `passwordHash`. */
const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
  tokenVersion: true,
  version: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}

function emailTaken() {
  return badRequest("Email already in use", [{ path: "email", issue: "emailTaken" }]);
}

export async function listUsers(params: { page: number; pageSize: number }): Promise<UserPage> {
  const { page, pageSize } = params;
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: userSelect,
    }),
    prisma.user.count(),
  ]);
  return { items, total, page, pageSize };
}

export async function getUser(id: string): Promise<UserItem | null> {
  return prisma.user.findUnique({ where: { id }, select: userSelect });
}

export async function createUser(params: {
  email: string;
  name: string;
  role: Role;
  password: string;
  actorId: string;
}): Promise<UserItem> {
  const email = params.email.trim().toLowerCase();
  const passwordHash = await hash(params.password);

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    throw emailTaken();
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name: params.name,
          passwordHash,
          role: params.role,
          createdById: params.actorId,
        },
        select: userSelect,
      });
      await tx.activityLog.create({
        data: {
          actorId: params.actorId,
          action: "userCreate",
          entityType: "user",
          entityId: user.id,
          summary: `created ${email} as ${params.role}`,
        },
      });
      return user;
    });

    logger.info({ userId: created.id, role: created.role, actorId: params.actorId }, "User created");
    return created;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw emailTaken();
    }
    throw error;
  }
}

export interface UserChanges {
  name?: string;
  email?: string;
  role?: Role;
  active?: boolean;
  version: number;
}

export async function updateUser(params: {
  id: string;
  actorId: string;
  changes: UserChanges;
}): Promise<UserItem> {
  const { id, actorId, changes } = params;

  const current = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true, active: true, version: true },
  });
  if (!current) {
    throw notFound("User not found");
  }
  if (current.version !== changes.version) {
    throw versionConflict(current.version);
  }

  const nextRole = changes.role ?? current.role;
  const nextActive = changes.active ?? current.active;
  const nextEmail = changes.email ? changes.email.trim().toLowerCase() : current.email;

  // A user may never deactivate their own account.
  if (id === actorId && current.active && !nextActive) {
    throw badRequest("You cannot deactivate your own account", [
      { path: "active", issue: "selfDeactivate" },
    ]);
  }

  // The last active Super Admin may not be demoted or deactivated.
  const demoting = current.role === "SuperAdmin" && nextRole !== "SuperAdmin";
  const deactivating = current.active && !nextActive;
  if (current.role === "SuperAdmin" && (demoting || deactivating)) {
    const remaining = await prisma.user.count({
      where: { role: "SuperAdmin", active: true, NOT: { id } },
    });
    if (remaining === 0) {
      throw badRequest("The last active Super Admin cannot be changed", [
        { path: demoting ? "role" : "active", issue: "lastSuperAdmin" },
      ]);
    }
  }

  if (nextEmail !== current.email) {
    const clash = await prisma.user.findUnique({
      where: { email: nextEmail },
      select: { id: true },
    });
    if (clash && clash.id !== id) {
      throw emailTaken();
    }
  }

  const roleChanged = nextRole !== current.role;
  const justDeactivated = current.active && !nextActive;
  const action = justDeactivated ? "userDeactivate" : roleChanged ? "roleChange" : "userUpdate";

  const changed: string[] = [];
  if (changes.name !== undefined && changes.name !== current.name) changed.push("name");
  if (nextEmail !== current.email) changed.push("email");
  if (roleChanged) changed.push(`role:${current.role}->${nextRole}`);
  if (current.active !== nextActive) changed.push(nextActive ? "reactivated" : "deactivated");

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.user.updateMany({
        where: { id, version: changes.version },
        data: {
          ...(changes.name !== undefined ? { name: changes.name } : {}),
          ...(nextEmail !== current.email ? { email: nextEmail } : {}),
          role: nextRole,
          active: nextActive,
          version: { increment: 1 },
          ...(justDeactivated ? { tokenVersion: { increment: 1 } } : {}),
        },
      });
      if (result.count === 0) {
        throw versionConflict(changes.version);
      }

      await tx.activityLog.create({
        data: {
          actorId,
          action,
          entityType: "user",
          entityId: id,
          summary: changed.length > 0 ? changed.join(", ") : `updated ${nextEmail}`,
        },
      });

      return tx.user.findUniqueOrThrow({ where: { id }, select: userSelect });
    });

    logger.info({ userId: id, actorId, action }, "User updated");
    return updated;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw emailTaken();
    }
    throw error;
  }
}

/**
 * Immediate logout (US12.4/12.5): deactivation also bumps `tokenVersion`, so
 * the caller's outstanding JWT is rejected on its very next request.
 */
export async function deactivateUser(params: {
  id: string;
  actorId: string;
}): Promise<UserItem> {
  const current = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, active: true, version: true },
  });
  if (!current) {
    throw notFound("User not found");
  }
  return updateUser({
    id: params.id,
    actorId: params.actorId,
    changes: { active: false, version: current.version },
  });
}

/** Admin password reset — bumps `tokenVersion`, clearing other sessions. */
export async function resetPassword(params: {
  id: string;
  password: string;
  actorId: string;
}): Promise<UserItem> {
  const current = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, email: true },
  });
  if (!current) {
    throw notFound("User not found");
  }

  const passwordHash = await hash(params.password);

  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: params.id },
      data: {
        passwordHash,
        tokenVersion: { increment: 1 },
        failedLogins: 0,
        lockedUntil: null,
        version: { increment: 1 },
      },
      select: userSelect,
    });
    await tx.activityLog.create({
      data: {
        actorId: params.actorId,
        action: "userUpdate",
        entityType: "user",
        entityId: user.id,
        summary: `password reset for ${current.email}`,
      },
    });
    return user;
  });

  logger.info({ userId: params.id, actorId: params.actorId }, "User password reset");
  return updated;
}
