import { revalidateTag } from "next/cache";
import { prisma } from "@/server/db/prisma";
import { createLogger } from "@/lib/logger";
import { badRequest, notFound, versionConflict } from "@/server/http/errors";
import {
  CMS_SECTION_SCHEMAS,
  statisticApprovalKey,
  type CmsSectionKey,
  type SectionFor,
} from "@/server/validation/cms";
import type { AppLocale } from "@/i18n/routing";
import type { Prisma } from "@/generated/prisma/client";

/**
 *
 * `getPublishedSection` reads `published_content` ONLY — the publication
 * predicate is "the row exists AND published_content is not null". Draft
 * content never crosses this boundary (publish safety, SC-005; US6 T071
 * triggers cache-tag invalidation on publish).
 *
 * Stored payloads are re-validated against the fixed per-section schema on
 * every read: malformed content is treated as unavailable rather than
 * rendered (FR-039) and flagged in logs for staff.
 */

const logger = createLogger("cms");

export async function getPublishedSection<K extends CmsSectionKey>(
  sectionKey: K,
  locale: AppLocale,
): Promise<SectionFor<K> | null> {
  const row = await prisma.cmsSection.findUnique({
    where: { sectionKey_locale: { sectionKey, locale } },
    select: { publishedContent: true },
  });

  if (!row?.publishedContent) {
    return null;
  }

  const parsed = CMS_SECTION_SCHEMAS[sectionKey].safeParse(row.publishedContent);
  if (!parsed.success) {
    logger.warn(
      { sectionKey, locale, issues: parsed.error.issues.length },
      "Stored CMS content failed schema validation — treating as unpublished",
    );
    return null;
  }

  return parsed.data as SectionFor<K>;
}

/**
 * Published payload plus the server-side approval register (T114).
 *
 * `approvedFlags` is written exclusively by `approveStatistic` (permission
 * `cms:publish`); it is never accepted from a draft PUT. Public rendering
 * requires BOTH the in-payload flag and a matching register entry, so an
 * editor cannot publish an unapproved claim simply by posting
 * `approved: true` as part of the draft (FR-007).
 */
export async function getPublishedSectionRecord<K extends CmsSectionKey>(
  sectionKey: K,
  locale: AppLocale,
): Promise<{ content: SectionFor<K>; approvedFlags: Record<string, unknown> | null } | null> {
  const row = await prisma.cmsSection.findUnique({
    where: { sectionKey_locale: { sectionKey, locale } },
    select: { publishedContent: true, approvedFlags: true },
  });

  if (!row?.publishedContent) {
    return null;
  }

  const parsed = CMS_SECTION_SCHEMAS[sectionKey].safeParse(row.publishedContent);
  if (!parsed.success) {
    logger.warn(
      { sectionKey, locale, issues: parsed.error.issues.length },
      "Stored CMS content failed schema validation — treating as unpublished",
    );
    return null;
  }

  return {
    content: parsed.data as SectionFor<K>,
    approvedFlags: (row.approvedFlags as Record<string, unknown> | null) ?? null,
  };
}

export interface CmsSectionRow {
  id: string;
  sectionKey: CmsSectionKey;
  locale: AppLocale;
  draftContent: unknown;
  publishedContent: unknown | null;
  approvedFlags: unknown | null;
  sourceDoc: string | null;
  publishedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export async function getCmsSection(
  sectionKey: CmsSectionKey,
  locale: AppLocale,
): Promise<CmsSectionRow | null> {
  const row = await prisma.cmsSection.findUnique({
    where: { sectionKey_locale: { sectionKey, locale } },
  });
  if (!row) return null;
  return row as CmsSectionRow;
}

/** All registry rows for the admin CMS surface (drafts included, admin-api.md §6). */
export async function listCmsSections(): Promise<CmsSectionRow[]> {
  const rows = await prisma.cmsSection.findMany({
    orderBy: [{ sectionKey: "asc" }, { locale: "asc" }],
  });
  return rows as CmsSectionRow[];
}

/** Map Zod issues to the contract `details` shape for a 400 response. */
function validationDetails(issues: { path: PropertyKey[]; message: string }[]) {
  return issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}

export async function getOrCreateCmsSection(
  sectionKey: CmsSectionKey,
  locale: AppLocale,
  createdById: string,
): Promise<CmsSectionRow> {
  const existing = await getCmsSection(sectionKey, locale);
  if (existing) return existing;

  const row = await prisma.cmsSection.create({
    data: {
      sectionKey,
      locale,
      draftContent: {},
      publishedContent: null as unknown as Prisma.InputJsonValue,
      createdById,
    },
  });
  return row as CmsSectionRow;
}

export async function updateDraftContent(params: {
  sectionKey: CmsSectionKey;
  locale: AppLocale;
  content: unknown;
  actorId: string;
  version: number;
}): Promise<CmsSectionRow> {
  const { sectionKey, locale, content, actorId, version } = params;
  const parsed = CMS_SECTION_SCHEMAS[sectionKey].safeParse(content);
  if (!parsed.success) {
    throw badRequest("Invalid CMS content", validationDetails(parsed.error.issues));
  }

  const current = await prisma.cmsSection.findUnique({
    where: { sectionKey_locale: { sectionKey, locale } },
    select: { id: true, version: true },
  });
  if (!current) {
    throw notFound("CMS section not found");
  }
  if (current.version !== version) {
    throw versionConflict(current.version);
  }

  const row = await prisma.cmsSection.update({
    where: { id: current.id },
    data: {
      draftContent: parsed.data as object,
      updatedById: actorId,
      version: { increment: 1 },
    },
  });

  await prisma.activityLog.create({
    data: {
      actorId,
      action: "update",
      entityType: "cmsSection",
      entityId: row.id,
      summary: `Updated draft for ${sectionKey}:${locale}`,
    },
  });

  return row as CmsSectionRow;
}

export async function publishSection(params: {
  sectionKey: CmsSectionKey;
  locale: AppLocale;
  actorId: string;
  version: number;
}): Promise<CmsSectionRow> {
  const { sectionKey, locale, actorId, version } = params;
  const current = await prisma.cmsSection.findUnique({
    where: { sectionKey_locale: { sectionKey, locale } },
    select: { id: true, version: true, draftContent: true },
  });
  if (!current) {
    throw notFound("CMS section not found");
  }
  if (current.version !== version) {
    throw versionConflict(current.version);
  }

  const parsed = CMS_SECTION_SCHEMAS[sectionKey].safeParse(current.draftContent);
  if (!parsed.success) {
    throw badRequest("Draft content is invalid", validationDetails(parsed.error.issues));
  }

  const row = await prisma.cmsSection.update({
    where: { id: current.id },
    data: {
      publishedContent: parsed.data as object,
      publishedAt: new Date(),
      updatedById: actorId,
      version: { increment: 1 },
    },
  });

  await prisma.activityLog.create({
    data: {
      actorId,
      action: "publish",
      entityType: "cmsSection",
      entityId: row.id,
      summary: `Published ${sectionKey}:${locale}`,
    },
  });

  // Invalidate cache tags (T071). Publishing must go live on the very next
  // request (SC-005), so expire immediately with `{ expire: 0 }` instead of the
  // stale-while-revalidate `"max"` profile, which would serve the old copy once
  // more before refreshing in the background.
  try {
    revalidateTag(`cms:${sectionKey}:${locale}`, { expire: 0 });
    if (sectionKey === "home") {
      revalidateTag(`categories:${locale}`, { expire: 0 });
    }
    if (sectionKey === "contact") {
      revalidateTag(`settings:contact_info:${locale}`, { expire: 0 });
    }
  } catch (err) {
    logger.warn({ err }, "Failed to invalidate cache tags after CMS publish");
  }

  return row as CmsSectionRow;
}

export async function unpublishSection(params: {
  sectionKey: CmsSectionKey;
  locale: AppLocale;
  actorId: string;
  version: number;
}): Promise<CmsSectionRow> {
  const { sectionKey, locale, actorId, version } = params;
  const current = await prisma.cmsSection.findUnique({
    where: { sectionKey_locale: { sectionKey, locale } },
    select: { id: true, version: true },
  });
  if (!current) {
    throw notFound("CMS section not found");
  }
  if (current.version !== version) {
    throw versionConflict(current.version);
  }

  const row = await prisma.cmsSection.update({
    where: { id: current.id },
    data: {
      publishedContent: null as unknown as Prisma.InputJsonValue,
      publishedAt: null,
      updatedById: actorId,
      version: { increment: 1 },
    },
  });

  await prisma.activityLog.create({
    data: {
      actorId,
      action: "unpublish",
      entityType: "cmsSection",
      entityId: row.id,
      summary: `Unpublished ${sectionKey}:${locale}`,
    },
  });

  try {
    revalidateTag(`cms:${sectionKey}:${locale}`, { expire: 0 });
  } catch (err) {
    logger.warn({ err }, "Failed to invalidate cache tags after CMS unpublish");
  }

  return row as CmsSectionRow;
}

/**
 * FR-007 statistic approval gate (admin-api.md §6 `approve-stat`).
 *
 * Flips the `approved` flag on a single home statistic in the DRAFT content
 * and records the decision in `approvedFlags`. Public rendering only ever
 * shows statistics carrying `approved === true` (`services/content.ts`), so a
 * claim (including the "50 years of success" wording) stays out of the public
 * site until this is called AND the section is published. Never touches the
 * published payload — approve-stat alone cannot change what visitors see.
 */
export async function approveStatistic(params: {
  sectionKey: CmsSectionKey;
  locale: AppLocale;
  actorId: string;
  version: number;
  statisticIndex: number;
  approved?: boolean;
}): Promise<CmsSectionRow> {
  const { sectionKey, locale, actorId, version, statisticIndex, approved = true } = params;
  if (sectionKey !== "home") {
    throw badRequest("Statistics can only be approved on the home section");
  }
  if (!Number.isInteger(statisticIndex) || statisticIndex < 0) {
    throw badRequest("A valid statistic index is required");
  }

  const current = await prisma.cmsSection.findUnique({
    where: { sectionKey_locale: { sectionKey, locale } },
    select: { id: true, version: true, draftContent: true, approvedFlags: true },
  });
  if (!current) {
    throw notFound("CMS section not found");
  }
  if (current.version !== version) {
    throw versionConflict(current.version);
  }

  const parsed = CMS_SECTION_SCHEMAS.home.safeParse(current.draftContent);
  if (!parsed.success) {
    throw badRequest("Draft content is invalid", validationDetails(parsed.error.issues));
  }
  if (statisticIndex >= parsed.data.statistics.length) {
    throw badRequest("Statistic index out of range");
  }

  const statistics = parsed.data.statistics.map((statistic, index) =>
    index === statisticIndex ? { ...statistic, approved } : statistic,
  );

  const target = statistics[statisticIndex];
  const approvedFlags: Record<string, unknown> = {
    ...((current.approvedFlags as Record<string, unknown> | null) ?? {}),
    // Keyed by the claim text (T114): an edit invalidates the approval.
    [statisticApprovalKey(target)]: approved,
  };

  const row = await prisma.cmsSection.update({
    where: { id: current.id },
    data: {
      draftContent: { ...parsed.data, statistics } as object,
      approvedFlags: approvedFlags as Prisma.InputJsonValue,
      updatedById: actorId,
      version: { increment: 1 },
    },
  });

  await prisma.activityLog.create({
    data: {
      actorId,
      action: "update",
      entityType: "cmsSection",
      entityId: row.id,
      summary: `${approved ? "Approved" : "Unapproved"} statistic #${statisticIndex} for home:${locale}`,
    },
  });

  return row as CmsSectionRow;
}
