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
 * Archive is guarded to unreferenced rows; purge additionally requires an
 * archived, still-unreferenced row. Every mutation writes exactly one
 * `ActivityLog` row (SC-012).
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
 * every request and the storage provider stays swappable.
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

type MediaRow = Prisma.MediaGetPayload<{ select: typeof mediaSelect }>;

function toItem(row: MediaRow): MediaItem {
  return { ...row, url: publicMediaUrl(row.id) };
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
      select: mediaSelect,
    }),
    prisma.media.count({ where }),
  ]);

  return { items: rows.map(toItem), total, page: params.page, pageSize: params.pageSize };
}

export async function getMedia(id: string): Promise<MediaItem | null> {
  const row = await prisma.media.findUnique({ where: { id }, select: mediaSelect });
  return row ? toItem(row) : null;
}

/** True when any entity still references this media row (archive guard). */
export async function isMediaReferenced(id: string): Promise<boolean> {
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
  return Object.values(counts._count).some((value) => value > 0);
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
  if (await isMediaReferenced(params.id)) {
    throw badRequest("Media is still referenced", [{ path: "id", issue: "mediaInUse" }]);
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

/** Purge an archived, unreferenced row: drop the object, then the row. */
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
  if (await isMediaReferenced(params.id)) {
    throw badRequest("Media is still referenced", [{ path: "id", issue: "mediaInUse" }]);
  }

  await getMediaStorage()
    .delete(existing.storageKey)
    .catch((err) => logger.warn({ err, id: params.id }, "Failed to delete media object"));

  await prisma.$transaction(async (tx) => {
    await tx.media.delete({ where: { id: params.id } });
    await tx.activityLog.create({
      data: {
        actorId: params.actorId,
        action: "delete",
        entityType: "media",
        entityId: params.id,
        summary: `purged ${existing.originalName}`,
      },
    });
  });

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
 * attachments remain behind the permissioned admin download route.
 */
export async function getPublicImageMeta(id: string): Promise<PublicImageMeta> {
  const row = await prisma.media.findUnique({
    where: { id },
    select: {
      kind: true,
      storageKey: true,
      mimeType: true,
      sha256: true,
      archivedAt: true,
    },
  });
  if (!row || row.kind !== "image" || row.archivedAt) {
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
