import { createHash } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import { createLogger } from "@/lib/logger";
import { notFound, unsupportedMediaType, versionConflict } from "@/server/http/errors";
import { assertCanTransition, resolvePublishedContext } from "@/server/services/leads";
import { getSystemUploaderId } from "@/server/services/system-user";
import { getMediaStorage } from "@/server/storage/config";
import { buildStorageKey, validateUpload } from "@/server/storage/validate";
import type { PartnershipInput } from "@/server/validation/partnerships";
import type { LeadStatus, Prisma } from "@/generated/prisma/client";

/**
 * Partnership service (T063, FR-018/FR-035, contracts/public-api.md,
 * admin-api.md §4).
 *
 * Reuses the shared lead pipeline (`leads.ts`): context FKs attach only to
 * published + active entities, the lead enters at `new`, and status moves use
 * the same transition graph as inquiries. A partnership attachment is stored
 * through `MediaStorage` (magic-byte + size validated, randomized key) and its
 * `Media` row is owned by the non-loginable system account, since the public
 * submitter has no identity. Every attachment *access* is an `ActivityLog`
 * entry (FR-035).
 */

const logger = createLogger("partnerships");

export interface PartnershipCreated {
  id: string;
  status: LeadStatus;
  createdAt: Date;
}

export interface PartnershipAttachmentInput {
  buffer: Buffer;
  originalName: string;
  declaredMime?: string | null;
}

export interface PartnershipAttachment {
  body: Uint8Array;
  contentType: string;
  byteSize: number;
  fileName: string;
}

const leadSelect = {
  id: true,
  name: true,
  company: true,
  email: true,
  phone: true,
  country: true,
  businessType: true,
  website: true,
  productCategory: true,
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
  attachment: {
    select: { id: true, originalName: true, mimeType: true, byteSize: true },
  },
} satisfies Prisma.PartnershipRequestSelect;

export type PartnershipLead = Prisma.PartnershipRequestGetPayload<{
  select: typeof leadSelect;
}>;

export interface PartnershipPage {
  items: PartnershipLead[];
  total: number;
  page: number;
  pageSize: number;
}

/** Persist the attachment object + its Media row (document-only, FR-033). */
async function storeAttachment(input: PartnershipAttachmentInput): Promise<{
  mediaId: string;
  storageKey: string;
}> {
  const upload = validateUpload({ buffer: input.buffer, declaredMime: input.declaredMime });
  if (upload.kind !== "document") {
    // Partnership attachments are documents only (pdf/doc/docx); an
    // allowlisted image is still the wrong kind for this form.
    throw unsupportedMediaType("Attachment must be a PDF, DOC or DOCX document");
  }

  const storageKey = buildStorageKey(upload);
  const stored = await getMediaStorage().put({
    key: storageKey,
    body: upload.buffer,
    contentType: upload.mimeType,
  });

  const media = await prisma.media.create({
    data: {
      kind: "document",
      mimeType: upload.mimeType,
      byteSize: stored.byteSize,
      storageKey: stored.key,
      originalName: input.originalName.trim().slice(0, 255) || "attachment",
      sha256: createHash("sha256").update(upload.buffer).digest("hex"),
      uploadedById: await getSystemUploaderId(),
    },
    select: { id: true, storageKey: true },
  });

  return { mediaId: media.id, storageKey: media.storageKey };
}

/** Best-effort rollback when the partnership row cannot be persisted. */
async function discardAttachment(attachment: {
  mediaId: string;
  storageKey: string;
}): Promise<void> {
  await prisma.media.delete({ where: { id: attachment.mediaId } }).catch(() => undefined);
  await getMediaStorage().delete(attachment.storageKey).catch(() => undefined);
}

/**
 * Persist an anonymous partnership request. `ipHash` is a hashed client IP
 * (forensics only). Consent is stamped server-side.
 */
export async function createPartnershipRequest(
  input: PartnershipInput,
  options: { ipHash?: string | null; attachment?: PartnershipAttachmentInput | null } = {},
): Promise<PartnershipCreated> {
  const context = await resolvePublishedContext(input);
  const attachment = options.attachment ? await storeAttachment(options.attachment) : null;

  try {
    const row = await prisma.partnershipRequest.create({
      data: {
        name: input.name,
        company: input.company,
        email: input.email,
        phone: input.phone ?? null,
        country: input.country ?? null,
        businessType: input.businessType ?? null,
        website: input.website ?? null,
        productCategory: input.productCategory ?? null,
        message: input.message,
        consentAccepted: true,
        consentAt: new Date(),
        locale: input.locale,
        ...context,
        attachmentMediaId: attachment?.mediaId ?? null,
        sourcePath: input.sourcePath ?? null,
        referrer: input.referrer ?? null,
        status: "new",
        createdIpHash: options.ipHash ?? null,
      },
      select: { id: true, status: true, createdAt: true },
    });

    return row;
  } catch (error) {
    if (attachment) {
      await discardAttachment(attachment);
    }
    throw error;
  }
}

/** Paginated, status-filterable partnership list (contracts/README.md §5). */
export async function listPartnershipRequests(params: {
  status?: LeadStatus;
  page: number;
  pageSize: number;
}): Promise<PartnershipPage> {
  const { status, page, pageSize } = params;
  const where: Prisma.PartnershipRequestWhereInput = status ? { status } : {};

  const [items, total] = await Promise.all([
    prisma.partnershipRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: leadSelect,
    }),
    prisma.partnershipRequest.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

export async function getPartnershipRequest(id: string): Promise<PartnershipLead | null> {
  return prisma.partnershipRequest.findUnique({ where: { id }, select: leadSelect });
}

/**
 * Move a partnership request through the shared pipeline (Clarification 3).
 * Rejects unknown transitions (`400`) and stale versions (`409`), and appends
 * exactly one `ActivityLog` row (SC-012).
 */
export async function transitionStatus(params: {
  id: string;
  status: LeadStatus;
  version: number;
  actorId: string;
}): Promise<PartnershipLead> {
  const { id, status, version, actorId } = params;

  const current = await prisma.partnershipRequest.findUnique({
    where: { id },
    select: { id: true, status: true, version: true },
  });
  if (!current) {
    throw notFound("Partnership request not found");
  }
  if (current.version !== version) {
    throw versionConflict(current.version);
  }
  assertCanTransition(current.status, status);

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.partnershipRequest.updateMany({
      where: { id, version },
      data: {
        status,
        statusChangedAt: new Date(),
        statusChangedById: params.actorId,
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
        entityType: "partnership",
        entityId: id,
        summary: `${current.status} -> ${status}`,
      },
    });

    return tx.partnershipRequest.findUniqueOrThrow({ where: { id }, select: leadSelect });
  });

  logger.info({ id, from: current.status, to: status, actorId }, "Partnership status changed");
  return updated;
}

/** Edit the internal, staff-only notes (never a lead-supplied field). */
export async function updateNotes(params: {
  id: string;
  notes: string | null;
  version: number;
  actorId: string;
}): Promise<PartnershipLead> {
  const { id, notes, version, actorId } = params;

  const current = await prisma.partnershipRequest.findUnique({
    where: { id },
    select: { id: true, version: true },
  });
  if (!current) {
    throw notFound("Partnership request not found");
  }
  if (current.version !== version) {
    throw versionConflict(current.version);
  }

  return prisma.$transaction(async (tx) => {
    const result = await tx.partnershipRequest.updateMany({
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
        entityType: "partnership",
        entityId: id,
        summary: "internal notes updated",
      },
    });
    return tx.partnershipRequest.findUniqueOrThrow({ where: { id }, select: leadSelect });
  });
}

/**
 * Fetch a stored attachment and record the access (FR-035). Returns the raw
 * bytes plus the metadata the download handler needs to set safe headers.
 */
export async function getAttachment(params: {
  id: string;
  actorId: string;
}): Promise<PartnershipAttachment> {
  const row = await prisma.partnershipRequest.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      attachment: { select: { storageKey: true, mimeType: true, originalName: true } },
    },
  });
  if (!row) {
    throw notFound("Partnership request not found");
  }
  if (!row.attachment) {
    throw notFound("No attachment for this request");
  }

  const object = await getMediaStorage().get(row.attachment.storageKey);

  await prisma.activityLog.create({
    data: {
      actorId: params.actorId,
      action: "attachmentAccess",
      entityType: "partnership",
      entityId: row.id,
      summary: row.attachment.originalName,
    },
  });

  return {
    body: object.body,
    contentType: row.attachment.mimeType,
    byteSize: object.byteSize,
    fileName: row.attachment.originalName,
  };
}
