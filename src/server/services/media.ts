import { createHash } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import { createLogger } from "@/lib/logger";
import { badRequest, notFound } from "@/server/http/errors";
import { getMediaStorage } from "@/server/storage/config";
import { buildStorageKey, validateUpload } from "@/server/storage/validate";
import type { MediaKind, Prisma } from "@/generated/prisma/client";

/**
 * Media library service (US12, T091, admin-api.md §5, data-model.md §2.9,
 * FR-033).
 *
 * Uploads are magic-byte + size validated (`storage/validate.ts`) and stored
 * under a randomized key; the `Media` row is the shared reference every entity
 * points at. Public images are exposed through an app-proxied URL
 * (`GET /api/media/{id}`) — the URL strategy is owned here, so the public
 * `MediaImage` component renders the real bytes without any caller change
 * (contracts/README.md §9).
 *
 * Archive keeps references intact so existing public pages continue to render.
 * Purge removes only references to the selected row before deleting it. Every
 * mutation writes exactly one `ActivityLog` row (SC-012).
 */

const logger = createLogger("media");

export interface MediaItem {
  id: string;
  kind: MediaKind;
  mimeType: string;
  byteSize: number;
  originalName: string;
  altEn: string | null;
  altAr: string | null;
  sha256: string;
  archivedAt: Date | null;
  uploadedById: string;
  createdAt: Date;
  /** Public, app-proxied URL (`/api/media/{id}`). */
  url: string;
  /** True when referenced by any catalog or system entity. */
  isReferenced?: boolean;
  referenceCount?: number;
}

export interface MediaPage {
  items: MediaItem[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * The single source of truth for a media row's public URL (T091). App-proxied
 * rather than a bucket URL so authorization/archival state is enforced on
 * every request and the storage provider stays swappable. Archived images
 * remain available so existing public pages do not break.
 */
export function publicMediaUrl(id: string): string {
  return `/api/media/${id}`;
}

const mediaSelect = {
  id: true,
  kind: true,
  mimeType: true,
  byteSize: true,
  originalName: true,
  altEn: true,
  altAr: true,
  sha256: true,
  archivedAt: true,
  uploadedById: true,
  createdAt: true,
} satisfies Prisma.MediaSelect;

const mediaListSelect = {
  ...mediaSelect,
  _count: {
    select: {
      brandLogos: true,
      brandCovers: true,
      productImages: true,
      productBrochures: true,
      supplierLogos: true,
      supplierCovers: true,
      clientLogos: true,
      locationImages: true,
      partnershipAttachments: true,
      seoOgImages: true,
    },
  },
} satisfies Prisma.MediaSelect;

type MediaRow = Prisma.MediaGetPayload<{ select: typeof mediaSelect }>;
type MediaListRow = Prisma.MediaGetPayload<{ select: typeof mediaListSelect }>;

function toItem(row: MediaRow | MediaListRow): MediaItem {
  const countObj = "_count" in row && row._count ? (row._count as Record<string, number>) : null;
  const referenceCount = countObj ? Object.values(countObj).reduce((sum, value) => sum + value, 0) : 0;
  return { ...row, isReferenced: referenceCount > 0, referenceCount, url: publicMediaUrl(row.id) };
}

export async function uploadMedia(params: {
  buffer: Buffer;
  originalName: string;
  declaredMime?: string | null;
  altEn?: string | null;
  altAr?: string | null;
  actorId: string;
}): Promise<MediaItem> {
  const upload = validateUpload({ buffer: params.buffer, declaredMime: params.declaredMime });
  const storageKey = buildStorageKey(upload);
  const stored = await getMediaStorage().put({
    key: storageKey,
    body: upload.buffer,
    contentType: upload.mimeType,
  });

  try {
    const row = await prisma.media.create({
      data: {
        kind: upload.kind,
        mimeType: upload.mimeType,
        byteSize: stored.byteSize,
        storageKey: stored.key,
        originalName: params.originalName.trim().slice(0, 255) || "upload",
        altEn: params.altEn ?? null,
        altAr: params.altAr ?? null,
        sha256: createHash("sha256").update(upload.buffer).digest("hex"),
        uploadedById: params.actorId,
      },
      select: mediaSelect,
    });

    await prisma.activityLog.create({
      data: {
        actorId: params.actorId,
        action: "create",
        entityType: "media",
        entityId: row.id,
        summary: `uploaded ${row.originalName}`,
      },
    });

    logger.info({ mediaId: row.id, kind: row.kind, actorId: params.actorId }, "Media uploaded");
    return toItem(row);
  } catch (error) {
    // The object is orphaned if the row cannot be persisted — best-effort drop.
    await getMediaStorage().delete(storageKey).catch(() => undefined);
    throw error;
  }
}

export async function listMedia(params: {
  kind?: MediaKind;
  archived?: boolean;
  page: number;
  pageSize: number;
}): Promise<MediaPage> {
  const where: Prisma.MediaWhereInput = {};
  if (params.kind) where.kind = params.kind;
  where.archivedAt = params.archived ? { not: null } : null;

  const [rows, total] = await Promise.all([
    prisma.media.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      select: mediaListSelect,
    }),
    prisma.media.count({ where }),
  ]);

  return { items: rows.map(toItem), total, page: params.page, pageSize: params.pageSize };
}

export async function getMedia(id: string): Promise<MediaItem | null> {
  const row = await prisma.media.findUnique({ where: { id }, select: mediaSelect });
  return row ? toItem(row) : null;
}

export interface MediaReferenceCounts {
  brandLogos: number;
  brandCovers: number;
  productImages: number;
  productBrochures: number;
  supplierLogos: number;
  supplierCovers: number;
  clientLogos: number;
  locationImages: number;
  partnershipAttachments: number;
  seoOgImages: number;
}

/** Discover every schema relation that points at a media row. */
export async function getMediaReferenceCounts(id: string): Promise<MediaReferenceCounts> {
  const counts = await prisma.media.findUnique({
    where: { id },
    select: {
      _count: {
        select: {
          brandLogos: true,
          brandCovers: true,
          productImages: true,
          productBrochures: true,
          supplierLogos: true,
          supplierCovers: true,
          clientLogos: true,
          locationImages: true,
          partnershipAttachments: true,
          seoOgImages: true,
        },
      },
    },
  });
  if (!counts) {
    throw notFound("Media not found");
  }
  return counts._count;
}

export async function isMediaReferenced(id: string): Promise<boolean> {
  const counts = await getMediaReferenceCounts(id);
  return Object.values(counts).some((value) => value > 0);
}

export async function updateMedia(params: {
  id: string;
  altEn: string | null;
  altAr: string | null;
  actorId: string;
}): Promise<MediaItem> {
  const existing = await prisma.media.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!existing) {
    throw notFound("Media not found");
  }

  const row = await prisma.media.update({
    where: { id: params.id },
    data: { altEn: params.altEn, altAr: params.altAr },
    select: mediaSelect,
  });

  await prisma.activityLog.create({
    data: {
      actorId: params.actorId,
      action: "update",
      entityType: "media",
      entityId: row.id,
      summary: "alt text updated",
    },
  });

  return toItem(row);
}

export async function archiveMedia(params: {
  id: string;
  actorId: string;
}): Promise<MediaItem> {
  const existing = await prisma.media.findUnique({
    where: { id: params.id },
    select: { id: true, archivedAt: true },
  });
  if (!existing) {
    throw notFound("Media not found");
  }
  if (existing.archivedAt) {
    const current = await prisma.media.findUniqueOrThrow({
      where: { id: params.id },
      select: mediaSelect,
    });
    return toItem(current);
  }
  const row = await prisma.media.update({
    where: { id: params.id },
    data: { archivedAt: new Date() },
    select: mediaSelect,
  });

  await prisma.activityLog.create({
    data: {
      actorId: params.actorId,
      action: "archive",
      entityType: "media",
      entityId: row.id,
      summary: `archived ${row.originalName}`,
    },
  });

  return toItem(row);
}

/**
 * Purge an archived row after safely unlinking only this media row's
 * references. The object is removed first; if storage refuses the delete, the
 * database remains untouched and no reference is broken.
 */
export async function purgeMedia(params: { id: string; actorId: string }): Promise<void> {
  const existing = await prisma.media.findUnique({
    where: { id: params.id },
    select: { id: true, archivedAt: true, storageKey: true, originalName: true },
  });
  if (!existing) {
    throw notFound("Media not found");
  }
  if (!existing.archivedAt) {
    throw badRequest("Archive the media before purging it", [
      { path: "id", issue: "mediaNotArchived" },
    ]);
  }
  try {
    await prisma.$transaction(async (tx) => {
      await tx.brand.updateMany({
        where: { logoMediaId: params.id },
        data: { logoMediaId: null },
      });
      await tx.brand.updateMany({
        where: { coverMediaId: params.id },
        data: { coverMediaId: null },
      });
      await tx.productImage.deleteMany({ where: { mediaId: params.id } });
      await tx.product.updateMany({
        where: { brochureMediaId: params.id },
        data: { brochureMediaId: null },
      });
      await tx.supplier.updateMany({
        where: { logoMediaId: params.id },
        data: { logoMediaId: null },
      });
      await tx.supplier.updateMany({
        where: { coverMediaId: params.id },
        data: { coverMediaId: null },
      });
      await tx.client.updateMany({ where: { logoMediaId: params.id }, data: { logoMediaId: null } });
      await tx.location.updateMany({
        where: { imageMediaId: params.id },
        data: { imageMediaId: null },
      });
      await tx.partnershipRequest.updateMany({
        where: { attachmentMediaId: params.id },
        data: { attachmentMediaId: null },
      });
      await tx.seoMeta.updateMany({
        where: { ogImageMediaId: params.id },
        data: { ogImageMediaId: null },
      });

      const remaining = await tx.media.findUnique({
        where: { id: params.id },
        select: {
          _count: {
            select: {
              brandLogos: true,
              brandCovers: true,
              productImages: true,
              productBrochures: true,
              supplierLogos: true,
              supplierCovers: true,
              clientLogos: true,
              locationImages: true,
              partnershipAttachments: true,
              seoOgImages: true,
            },
          },
        },
      });
      if (!remaining || Object.values(remaining._count).some((value) => value > 0)) {
        throw badRequest("Media references could not be safely removed", [
          { path: "id", issue: "referencesRemain" },
        ]);
      }

      await tx.media.delete({ where: { id: params.id } });
      await tx.activityLog.create({
        data: {
          actorId: params.actorId,
          action: "delete",
          entityType: "media",
          entityId: params.id,
          summary: `purged ${existing.originalName} and unlinked media references`,
        },
      });
    });
  } catch (error) {
    logger.error({ err: error, id: params.id }, "Media database cleanup failed; storage unchanged");
    throw error;
  }

  try {
    await getMediaStorage().delete(existing.storageKey);
  } catch (error) {
    logger.error({ err: error, id: params.id }, "Failed to delete media object after database cleanup");
    throw badRequest("Media was unlinked but storage cleanup failed", [
      { path: "id", issue: "storageDeleteFailed" },
    ]);
  }

  logger.info({ mediaId: params.id, actorId: params.actorId }, "Media purged");
}

export interface PublicImageMeta {
  storageKey: string;
  contentType: string;
  etag: string;
}

/**
 * Resolve the storage metadata for a public image (used by
 * `GET /api/media/{id}`). Documents are never exposed publicly (FR-033) —
 * attachments remain behind the permissioned admin download route. Archived
 * images remain public until they are permanently deleted.
 */
export async function getPublicImageMeta(id: string): Promise<PublicImageMeta> {
  const row = await prisma.media.findUnique({
    where: { id },
    select: {
      kind: true,
      storageKey: true,
      mimeType: true,
      sha256: true,
    },
  });
  if (!row || row.kind !== "image") {
    throw notFound("Image not found");
  }
  return {
    storageKey: row.storageKey,
    contentType: row.mimeType,
    etag: `"${row.sha256}"`,
  };
}

export async function readPublicImage(storageKey: string): Promise<Uint8Array> {
  const object = await getMediaStorage().get(storageKey);
  return object.body;
}
