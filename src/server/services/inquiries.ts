import { prisma } from "@/server/db/prisma";
import { createLogger } from "@/lib/logger";
import { badRequest, notFound, versionConflict } from "@/server/http/errors";
import { assertCanTransition, resolvePublishedContext } from "@/server/services/leads";
import type { InquiryInput } from "@/server/validation/inquiries";
import type { InquiryType, LeadStatus, Prisma } from "@/generated/prisma/client";

/**
 * Inquiry (lead) service (T056, FR-016/FR-017, contracts/admin-api.md §4).
 *
 * `createInquiry` persists an anonymous submission: contextual FKs are only
 * attached when they reference a currently published + active entity (so a
 * stale/unpublished id is silently dropped — never a publication oracle), the
 * consent timestamp is a server clock value, and the lead enters the shared
 * pipeline at `new`. `listInquiries`/`getInquiry` serve the staff queue and
 * `transitionStatus` is the only path that moves a lead, always optimistic
 * locked and always writing one `ActivityLog` row (SC-012).
 */

const logger = createLogger("inquiries");

export interface InquiryCreated {
  id: string;
  status: LeadStatus;
  createdAt: Date;
}

export interface InquiryLead {
  id: string;
  type: InquiryType;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  locale: string;
  productId: string | null;
  brandId: string | null;
  supplierId: string | null;
  sourcePath: string | null;
  referrer: string | null;
  status: LeadStatus;
  statusChangedAt: Date | null;
  notes: string | null;
  version: number;
  createdAt: Date;
}

export interface InquiryPage {
  items: InquiryLead[];
  total: number;
  page: number;
  pageSize: number;
}

const leadSelect = {
  id: true,
  type: true,
  name: true,
  company: true,
  email: true,
  phone: true,
  subject: true,
  message: true,
  locale: true,
  productId: true,
  brandId: true,
  supplierId: true,
  sourcePath: true,
  referrer: true,
  status: true,
  statusChangedAt: true,
  notes: true,
  version: true,
  createdAt: true,
} satisfies Prisma.InquirySelect;

/**
 * Persist an anonymous inquiry. `ipHash` is a hashed client IP (forensics
 * only — the raw IP is never stored; contracts/README.md §8).
 */
export async function createInquiry(
  input: InquiryInput,
  options: { ipHash?: string | null } = {},
): Promise<InquiryCreated> {
  const context = await resolvePublishedContext(input);

  const row = await prisma.inquiry.create({
    data: {
      type: input.type,
      name: input.name,
      company: input.company ?? null,
      email: input.email,
      phone: input.phone ?? null,
      subject: input.subject,
      message: input.message,
      // Clarification 2: consent is mandatory and timestamped server-side.
      consentAccepted: true,
      consentAt: new Date(),
      locale: input.locale,
      ...context,
      sourcePath: input.sourcePath ?? null,
      referrer: input.referrer ?? null,
      status: "new",
      createdIpHash: options.ipHash ?? null,
    },
    select: { id: true, status: true, createdAt: true },
  });

  return row;
}

/** Paginated, status-filterable lead list (contracts/README.md §5). */
export async function listInquiries(params: {
  status?: LeadStatus;
  page: number;
  pageSize: number;
}): Promise<InquiryPage> {
  const { status, page, pageSize } = params;
  const where: Prisma.InquiryWhereInput = status ? { status } : {};

  const [items, total] = await Promise.all([
    prisma.inquiry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: leadSelect,
    }),
    prisma.inquiry.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function getInquiry(id: string): Promise<InquiryLead | null> {
  return prisma.inquiry.findUnique({ where: { id }, select: leadSelect });
}

/**
 * Move a lead through the shared pipeline (Clarification 3). Rejects unknown
 * transitions (`400`) and stale versions (`409`), and appends exactly one
 * `ActivityLog` row describing actor + transition (SC-012).
 */
export async function transitionStatus(params: {
  id: string;
  status: LeadStatus;
  version: number;
  actorId: string;
}): Promise<InquiryLead> {
  const { id, status, version, actorId } = params;

  const current = await prisma.inquiry.findUnique({
    where: { id },
    select: { id: true, status: true, version: true },
  });
  if (!current) {
    throw notFound("Inquiry not found");
  }
  if (current.version !== version) {
    throw versionConflict(current.version);
  }
  assertCanTransition(current.status, status);

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.inquiry.updateMany({
      where: { id, version },
      data: {
        status,
        statusChangedAt: new Date(),
        statusChangedById: actorId,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) {
      throw versionConflict(version);
    }

    await tx.activityLog.create({
      data: {
        actorId,
        action: "statusChange",
        entityType: "inquiry",
        entityId: id,
        summary: `${current.status} -> ${status}`,
      },
    });

    return tx.inquiry.findUniqueOrThrow({ where: { id }, select: leadSelect });
  });

  logger.info({ id, from: current.status, to: status, actorId }, "Inquiry status changed");
  return updated;
}

/** Edit the internal, staff-only notes (never a lead-supplied field). */
export async function updateNotes(params: {
  id: string;
  notes: string | null;
  version: number;
  actorId: string;
}): Promise<InquiryLead> {
  const { id, notes, version, actorId } = params;

  const current = await prisma.inquiry.findUnique({
    where: { id },
    select: { id: true, version: true },
  });
  if (!current) {
    throw notFound("Inquiry not found");
  }
  if (current.version !== version) {
    throw versionConflict(current.version);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.inquiry.updateMany({
      where: { id, version },
      data: { notes, version: { increment: 1 } },
    });
    if (result.count === 0) {
      throw versionConflict(version);
    }
    await tx.activityLog.create({
      data: {
        actorId,
        action: "update",
        entityType: "inquiry",
        entityId: id,
        summary: "internal notes updated",
      },
    });
    return tx.inquiry.findUniqueOrThrow({ where: { id }, select: leadSelect });
  });

  return updated;
}

/**
 * Permanently delete a closed inquiry (SC-012). Only closed leads may be
 * deleted — open pipeline items must be closed first to prevent accidental
 * data loss. Writes one `ActivityLog` row.
 */
export async function deleteInquiry(params: {
  id: string;
  actorId: string;
}): Promise<{ id: string; deleted: true }> {
  const { id, actorId } = params;

  const current = await prisma.inquiry.findUnique({
    where: { id },
    select: { id: true, status: true, email: true },
  });
  if (!current) {
    throw notFound("Inquiry not found");
  }
  if (current.status !== "closed") {
    throw badRequest("Only closed inquiries can be deleted", [
      { path: "id", issue: "notClosed" },
    ]);
  }

  await prisma.$transaction(async (tx) => {
    await tx.inquiry.delete({ where: { id } });
    await tx.activityLog.create({
      data: {
        actorId,
        action: "delete",
        entityType: "inquiry",
        entityId: id,
        summary: `deleted inquiry from ${current.email}`,
      },
    });
  });

  logger.info({ id, actorId }, "Inquiry deleted");
  return { id, deleted: true };
}
