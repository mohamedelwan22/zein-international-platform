import { prisma } from "@/server/db/prisma";
import { createLogger } from "@/lib/logger";
import type { Role } from "@/server/auth/permissions";
import type { ActivityAction, Prisma } from "@/generated/prisma/client";

/**
 * Activity log service (T109, US11, FR-035, SC-012, contracts/admin-api.md
 * §10/§11, data-model.md §2.15).
 *
 * The log is APPEND-ONLY: this module only ever inserts rows and reads them
 * back — there is no update or delete path anywhere in the application (the
 * integration test asserts exactly that), so a recorded action can never be
 * rewritten or removed after the fact.
 *
 * `listActivityLog` is the single read path for both the admin activity page
 * and the dashboard's recent-activity list. It filters by actor (staff id or
 * e-mail), action, entity type and a date range, and paginates.
 *
 * Permission enforcement deliberately lives in the callers (route handlers and
 * server pages) so this module stays free of any auth import — it is also used
 * by the sign-in/sign-out audit path, which runs before a session exists.
 */

const logger = createLogger("activity");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ActivityLogEntry {
  id: string;
  actorId: string;
  actorName: string;
  actorEmail: string;
  actorRole: Role;
  action: ActivityAction;
  entityType: string;
  entityId: string | null;
  summary: string | null;
  createdAt: string;
}

export interface ActivityActor {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface ActivityPage {
  items: ActivityLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  /** Distinct actors present in the log — the actor filter options. */
  actors: ActivityActor[];
}

const entrySelect = {
  id: true,
  actorId: true,
  action: true,
  entityType: true,
  entityId: true,
  summary: true,
  createdAt: true,
  actor: { select: { id: true, name: true, email: true, role: true } },
} satisfies Prisma.ActivityLogSelect;

function toEntry(row: {
  id: string;
  actorId: string;
  action: ActivityAction;
  entityType: string;
  entityId: string | null;
  summary: string | null;
  createdAt: Date;
  actor: { id: string; name: string; email: string; role: Role };
}): ActivityLogEntry {
  return {
    id: row.id,
    actorId: row.actorId,
    actorName: row.actor.name,
    actorEmail: row.actor.email,
    actorRole: row.actor.role,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    summary: row.summary,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Distinct actors in the log, most active first — the actor filter options. */
async function listActivityActors(): Promise<ActivityActor[]> {
  const grouped = await prisma.activityLog.groupBy({
    by: ["actorId"],
    _count: { _all: true },
    orderBy: { _count: { actorId: "desc" } },
    take: 100,
  });
  if (grouped.length === 0) {
    return [];
  }
  const users = await prisma.user.findMany({
    where: { id: { in: grouped.map((row) => row.actorId) } },
    select: { id: true, name: true, email: true, role: true },
  });
  const byId = new Map(users.map((user) => [user.id, user]));
  return grouped.flatMap((row) => {
    const user = byId.get(row.actorId);
    return user ? [{ id: user.id, name: user.name, email: user.email, role: user.role }] : [];
  });
}

/**
 * Read the log (admin-api.md §10). `actor` accepts either the staff id or the
 * staff e-mail address so the UI can offer a picker without a second endpoint.
 */
export async function listActivityLog(params: {
  actor?: string;
  action?: ActivityAction;
  entityType?: string;
  from?: Date;
  to?: Date;
  page: number;
  pageSize: number;
}): Promise<ActivityPage> {
  const where: Prisma.ActivityLogWhereInput = {};

  if (params.action) {
    where.action = params.action;
  }
  if (params.entityType) {
    where.entityType = params.entityType;
  }
  if (params.from || params.to) {
    where.createdAt = {
      ...(params.from ? { gte: params.from } : {}),
      ...(params.to ? { lte: params.to } : {}),
    };
  }
  if (params.actor) {
    const actor = params.actor.trim();
    if (UUID_RE.test(actor)) {
      where.actorId = actor;
    } else if (actor.length > 0) {
      where.actor = { email: { equals: actor.toLowerCase(), mode: "insensitive" } };
    }
  }

  const [rows, total, actors] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      select: entrySelect,
    }),
    prisma.activityLog.count({ where }),
    listActivityActors(),
  ]);

  return {
    items: rows.map(toEntry),
    total,
    page: params.page,
    pageSize: params.pageSize,
    pages: Math.max(1, Math.ceil(total / params.pageSize)),
    actors,
  };
}

/** The most recent entries — the dashboard's "recent activity" list. */
export async function listRecentActivity(limit = 10): Promise<ActivityLogEntry[]> {
  const rows = await prisma.activityLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: entrySelect,
  });
  return rows.map(toEntry);
}

/**
 * Append one entry to the log. The ONLY write path the log has (append-only).
 */
export async function recordActivity(params: {
  actorId: string;
  action: ActivityAction;
  entityType: string;
  entityId?: string | null;
  summary?: string | null;
}): Promise<void> {
  await prisma.activityLog.create({
    data: {
      actorId: params.actorId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      summary: params.summary ?? null,
    },
  });
}

/**
 * Record a sign-in attempt (admin-api.md §11 — "login success/failure").
 *
 * A failed attempt is attributed to the account it targeted. An attempt
 * against an address that belongs to no account has no actor to attribute it
 * to — the durable `AuthAttempt` row (data-model.md §2.16) remains the record
 * for those, because `ActivityLog.actorId` is a required staff reference.
 *
 * Auditing must never block authentication, so a failed write is logged and
 * swallowed rather than surfaced to the person signing in.
 */
export async function recordLogin(params: {
  actorId: string;
  success: boolean;
}): Promise<void> {
  try {
    await recordActivity({
      actorId: params.actorId,
      action: "login",
      entityType: "user",
      entityId: params.actorId,
      summary: params.success ? "signed in" : "failed sign-in attempt",
    });
  } catch (err) {
    logger.warn({ err, actorId: params.actorId }, "Failed to record the sign-in on the activity log");
  }
}

/** Record a sign-out (admin-api.md §11 — "logout"). */
export async function recordLogout(params: { actorId: string }): Promise<void> {
  try {
    await recordActivity({
      actorId: params.actorId,
      action: "logout",
      entityType: "user",
      entityId: params.actorId,
      summary: "signed out",
    });
  } catch (err) {
    logger.warn({ err, actorId: params.actorId }, "Failed to record the sign-out on the activity log");
  }
}
