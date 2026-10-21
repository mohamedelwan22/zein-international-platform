import type { MetadataRoute } from "next";
import { revalidateTag } from "next/cache";
import type { z } from "zod";
import { prisma } from "@/server/db/prisma";
import { createLogger } from "@/lib/logger";
import { badRequest, notFound, slugConflict, versionConflict } from "@/server/http/errors";
import { requirePermission } from "@/server/auth/authorize";
import { issueDetails } from "@/server/validation/common";
import {
  seoUpdateSchema,
  slugRedirectCreateSchema,
  type SeoUpdateInput,
  type SlugRedirectCreateInput,
} from "@/server/validation/seo";
import { isSeoPageKey, SEO_PAGE_KEYS, SEO_PAGE_PATHS, type SeoPageKey } from "@/lib/seo-pages";
import type { SeoOverride } from "@/lib/seo";
import type { AppLocale } from "@/i18n/routing";
import { publicMediaUrl } from "./media";
import { recordSlugChange } from "./redirects";
import type { EntityType, Prisma } from "@/generated/prisma/client";

/**
 * SEO metadata service (US10, T103/T104/T105, FR-043, admin-api.md §7).
 *
 * Reads are split in two layers:
 *   - public lookups (`loadPageSeo`, `loadEntitySeo`, `buildPublicSitemap`)
 *     merge `SeoMeta` overrides over the localized defaults and never expose
 *     unpublished records;
 *   - admin lookups/mutations enforce `seo:read|update`, validate payloads,
 *     optimistic-lock on `SeoMeta.version`, write exactly one `ActivityLog`
 *     row, and persist `SlugRedirect` rows when the slug changes so old public
 *     URLs keep resolving with a 301 (US10.3).
 *
 * `buildPublicSitemap` applies the same publication predicates as the public
 * read services: brands/products/suppliers must be published + active (and
 * products additionally need a published brand/category), suppliers must be
 * disclosure-approved, and any locale whose `SeoMeta.noindex` is set is
 * omitted from the sitemap.
 */

const logger = createLogger("seo");

const SITE_LOCALES: readonly AppLocale[] = ["en", "ar"] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ENTITY_TYPES: readonly EntityType[] = [
  "page",
  "brand",
  "product",
  "supplier",
  "category",
  "client",
  "location",
] as const;

const SLUG_ENTITY_TYPES = ["brand", "product", "supplier", "category"] as const;
type SlugEntityType = (typeof SLUG_ENTITY_TYPES)[number];

function isEntityType(value: string): value is EntityType {
  return (ENTITY_TYPES as readonly string[]).includes(value);
}

function isSlugEntityType(value: EntityType): value is SlugEntityType {
  return (SLUG_ENTITY_TYPES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Public reads
// ---------------------------------------------------------------------------

const seoSelect = {
  metaTitle: true,
  metaDescription: true,
  canonicalUrl: true,
  noindex: true,
  ogImage: { select: { id: true, kind: true, archivedAt: true } },
} satisfies Prisma.SeoMetaSelect;

interface SeoRow {
  metaTitle: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  noindex: boolean;
  ogImage: { id: string; kind: string; archivedAt: Date | null } | null;
}

function toOverride(row: SeoRow | null): SeoOverride | null {
  if (!row) return null;

  const ogImageUrl =
    row.ogImage && row.ogImage.kind === "image" && !row.ogImage.archivedAt
      ? publicMediaUrl(row.ogImage.id)
      : null;

  const override: SeoOverride = {
    title: row.metaTitle,
    description: row.metaDescription,
    canonicalUrl: row.canonicalUrl,
    ogImageUrl,
    noindex: row.noindex,
  };

  const meaningful =
    Boolean(override.title || override.description || override.canonicalUrl || override.ogImageUrl) ||
    override.noindex;
  return meaningful ? override : null;
}

/** Approved overrides for a static public page (US10.2 fallback otherwise). */
export async function loadPageSeo(
  pageKey: SeoPageKey,
  locale: AppLocale,
): Promise<SeoOverride | null> {
  const row = await prisma.seoMeta.findUnique({
    where: { pageKey_locale: { pageKey, locale } },
    select: seoSelect,
  });
  return toOverride(row);
}

/** Approved overrides for a brand/product/supplier/category detail page. */
export async function loadEntitySeo(
  targetType: EntityType,
  targetId: string,
  locale: AppLocale,
): Promise<SeoOverride | null> {
  if (targetType === "page") return null;
  const row = await prisma.seoMeta.findUnique({
    where: { targetType_targetId_locale: { targetType, targetId, locale } },
    select: seoSelect,
  });
  return toOverride(row);
}

export interface NoindexSeo {
  pageKeys: Set<string>;
  targetKeys: Set<string>;
}

/** Locale-specific `noindex` targets used to filter the sitemap. */
export async function listNoindexSeo(locale: AppLocale): Promise<NoindexSeo> {
  const rows = await prisma.seoMeta.findMany({
    where: { locale, noindex: true },
    select: { pageKey: true, targetType: true, targetId: true },
  });

  const pageKeys = new Set<string>();
  const targetKeys = new Set<string>();
  for (const row of rows) {
    if (row.pageKey) pageKeys.add(row.pageKey);
    if (row.targetId) targetKeys.add(`${row.targetType}:${row.targetId}`);
  }
  return { pageKeys, targetKeys };
}

interface SitemapEntity {
  id: string;
  slugEn: string;
  slugAr: string;
  updatedAt: Date;
}

function absoluteUrl(siteUrl: string, locale: AppLocale, path: string): string {
  return `${siteUrl}/${locale}${path === "/" ? "" : path}`;
}

function languageAlternates(
  siteUrl: string,
  paths: Record<AppLocale, string>,
): Record<string, string> {
  return {
    en: absoluteUrl(siteUrl, "en", paths.en),
    ar: absoluteUrl(siteUrl, "ar", paths.ar),
  };
}

/**
 * Public sitemap (T103, FR-043): every indexable static page plus every
 * published brand, product and disclosed supplier in both locales. Entries
 * marked `noindex` for a locale are omitted for that locale only.
 */
export async function buildPublicSitemap(siteUrl: string): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl.replace(/\/$/, "");

  const [brands, products, suppliers, noindexRows] = await Promise.all([
    prisma.brand.findMany({
      where: { status: "published", isActive: true },
      select: { id: true, slugEn: true, slugAr: true, updatedAt: true },
    }),
    prisma.product.findMany({
      where: {
        status: "published",
        isActive: true,
        brand: { status: "published", isActive: true },
        categories: { some: { category: { status: "published", isActive: true } } },
      },
      select: { id: true, slugEn: true, slugAr: true, updatedAt: true },
    }),
    prisma.supplier.findMany({
      where: { status: "published", isActive: true, disclosureApproved: true },
      select: { id: true, slugEn: true, slugAr: true, updatedAt: true },
    }),
    prisma.seoMeta.findMany({
      where: { noindex: true },
      select: { locale: true, pageKey: true, targetType: true, targetId: true },
    }),
  ]);

  const noindexPages = new Set<string>();
  const noindexTargets = new Set<string>();
  for (const row of noindexRows) {
    const locale = row.locale as AppLocale;
    if (row.pageKey) noindexPages.add(`${locale}:${row.pageKey}`);
    if (row.targetId) noindexTargets.add(`${locale}:${row.targetType}:${row.targetId}`);
  }

  const entries: MetadataRoute.Sitemap = [];

  for (const locale of SITE_LOCALES) {
    for (const pageKey of SEO_PAGE_KEYS) {
      if (noindexPages.has(`${locale}:${pageKey}`)) continue;
      const path = SEO_PAGE_PATHS[pageKey];
      entries.push({
        url: absoluteUrl(base, locale, path),
        changeFrequency: pageKey === "home" ? "weekly" : "monthly",
        priority: pageKey === "home" ? 1 : 0.6,
        alternates: { languages: languageAlternates(base, { en: path, ar: path }) },
      });
    }
  }

  const entityGroups: { type: SlugEntityType; path: string; rows: SitemapEntity[] }[] = [
    { type: "brand", path: "brands", rows: brands },
    { type: "product", path: "products", rows: products },
    { type: "supplier", path: "suppliers", rows: suppliers },
  ];

  for (const group of entityGroups) {
    for (const row of group.rows) {
      const paths: Record<AppLocale, string> = {
        en: `/${group.path}/${row.slugEn}`,
        ar: `/${group.path}/${row.slugAr}`,
      };
      for (const locale of SITE_LOCALES) {
        if (noindexTargets.has(`${locale}:${group.type}:${row.id}`)) continue;
        entries.push({
          url: absoluteUrl(base, locale, paths[locale]),
          lastModified: row.updatedAt,
          changeFrequency: "monthly",
          priority: 0.7,
          alternates: { languages: languageAlternates(base, paths) },
        });
      }
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Admin reads
// ---------------------------------------------------------------------------

export interface SeoMetaRecord {
  id: string;
  targetType: EntityType;
  targetId: string | null;
  pageKey: string | null;
  locale: AppLocale;
  metaTitle: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  slugOverride: string | null;
  ogImageMediaId: string | null;
  ogImageUrl: string | null;
  noindex: boolean;
  version: number;
  updatedAt: Date;
}

function toRecord(row: {
  id: string;
  targetType: EntityType;
  targetId: string | null;
  pageKey: string | null;
  locale: string;
  metaTitle: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  slugOverride: string | null;
  ogImageMediaId: string | null;
  noindex: boolean;
  version: number;
  updatedAt: Date;
  ogImage: { id: string; kind: string; archivedAt: Date | null } | null;
}): SeoMetaRecord {
  const { ogImage, ...rest } = row;
  return {
    ...rest,
    locale: row.locale as AppLocale,
    ogImageUrl:
      ogImage && ogImage.kind === "image" && !ogImage.archivedAt
        ? publicMediaUrl(ogImage.id)
        : null,
  };
}

const adminSeoSelect = {
  id: true,
  targetType: true,
  targetId: true,
  pageKey: true,
  locale: true,
  metaTitle: true,
  metaDescription: true,
  canonicalUrl: true,
  slugOverride: true,
  ogImageMediaId: true,
  noindex: true,
  version: true,
  updatedAt: true,
  ogImage: { select: { id: true, kind: true, archivedAt: true } },
} satisfies Prisma.SeoMetaSelect;

export interface SeoTargetEntity {
  id: string;
  nameEn: string;
  nameAr: string;
  slugEn: string | null;
  slugAr: string | null;
  status: string;
  kind?: string;
}

export interface SeoTargets {
  pages: readonly SeoPageKey[];
  brands: SeoTargetEntity[];
  products: SeoTargetEntity[];
  suppliers: SeoTargetEntity[];
  categories: SeoTargetEntity[];
}

/** Admin target picker data: static pages + entities with public pages. */
export async function getSeoTargets(): Promise<SeoTargets> {
  await requirePermission("seo:read");

  const [brands, products, suppliers, categories] = await Promise.all([
    prisma.brand.findMany({
      select: { id: true, nameEn: true, nameAr: true, slugEn: true, slugAr: true, status: true },
      orderBy: [{ nameEn: "asc" }],
    }),
    prisma.product.findMany({
      select: { id: true, nameEn: true, nameAr: true, slugEn: true, slugAr: true, status: true },
      orderBy: [{ nameEn: "asc" }],
    }),
    prisma.supplier.findMany({
      select: { id: true, nameEn: true, nameAr: true, slugEn: true, slugAr: true, status: true },
      orderBy: [{ nameEn: "asc" }],
    }),
    prisma.category.findMany({
      select: {
        id: true,
        nameEn: true,
        nameAr: true,
        slugEn: true,
        slugAr: true,
        status: true,
        kind: true,
      },
      orderBy: [{ kind: "asc" }, { nameEn: "asc" }],
    }),
  ]);

  return { pages: SEO_PAGE_KEYS, brands, products, suppliers, categories };
}

export async function listSeoMeta(): Promise<SeoMetaRecord[]> {
  await requirePermission("seo:read");
  const rows = await prisma.seoMeta.findMany({
    select: adminSeoSelect,
    orderBy: [{ updatedAt: "desc" }],
  });
  return rows.map(toRecord);
}

// ---------------------------------------------------------------------------
// Target parsing + entity helpers
// ---------------------------------------------------------------------------

interface ParsedTarget {
  targetType: EntityType;
  targetId: string | null;
  pageKey: SeoPageKey | null;
}

export function parseSeoTargetKey(raw: string): ParsedTarget {
  if (raw.startsWith("page:")) {
    const pageKey = raw.slice("page:".length);
    if (!isSeoPageKey(pageKey)) {
      throw badRequest("Unknown SEO page", [{ path: "target", issue: "notFound" }]);
    }
    return { targetType: "page", targetId: null, pageKey };
  }

  const separator = raw.indexOf(":");
  if (separator === -1) {
    throw badRequest("Invalid SEO target", [{ path: "target", issue: "invalidType" }]);
  }
  const targetType = raw.slice(0, separator);
  const targetId = raw.slice(separator + 1);
  if (!isEntityType(targetType) || targetType === "page" || !UUID_RE.test(targetId)) {
    throw badRequest("Invalid SEO target", [{ path: "target", issue: "invalidType" }]);
  }
  return { targetType, targetId, pageKey: null };
}

interface EntitySlugRow {
  id: string;
  slugEn: string | null;
  slugAr: string | null;
  updatedAt: Date;
  kind?: string;
}

async function findSeoEntity(
  targetType: Exclude<EntityType, "page">,
  id: string,
): Promise<EntitySlugRow | null> {
  switch (targetType) {
    case "brand":
      return prisma.brand.findUnique({
        where: { id },
        select: { id: true, slugEn: true, slugAr: true, updatedAt: true },
      });
    case "product":
      return prisma.product.findUnique({
        where: { id },
        select: { id: true, slugEn: true, slugAr: true, updatedAt: true },
      });
    case "supplier":
      return prisma.supplier.findUnique({
        where: { id },
        select: { id: true, slugEn: true, slugAr: true, updatedAt: true },
      });
    case "category":
      return prisma.category.findUnique({
        where: { id },
        select: { id: true, slugEn: true, slugAr: true, updatedAt: true, kind: true },
      });
    case "client": {
      const row = await prisma.client.findUnique({
        where: { id },
        select: { id: true, updatedAt: true },
      });
      return row ? { ...row, slugEn: null, slugAr: null } : null;
    }
    case "location": {
      const row = await prisma.location.findUnique({
        where: { id },
        select: { id: true, updatedAt: true },
      });
      return row ? { ...row, slugEn: null, slugAr: null } : null;
    }
  }
}

async function findEntityBySlug(
  entityType: SlugEntityType,
  locale: AppLocale,
  slug: string,
): Promise<{ id: string } | null> {
  const where = locale === "en" ? { slugEn: slug } : { slugAr: slug };
  switch (entityType) {
    case "brand":
      return prisma.brand.findFirst({ where, select: { id: true } });
    case "product":
      return prisma.product.findFirst({ where, select: { id: true } });
    case "supplier":
      return prisma.supplier.findFirst({ where, select: { id: true } });
    case "category":
      return prisma.category.findFirst({ where, select: { id: true } });
  }
}

async function writeSlug(
  tx: Prisma.TransactionClient,
  targetType: SlugEntityType,
  id: string,
  locale: AppLocale,
  slug: string,
  actorId: string,
): Promise<void> {
  const data =
    locale === "en"
      ? { slugEn: slug, updatedById: actorId, version: { increment: 1 } }
      : { slugAr: slug, updatedById: actorId, version: { increment: 1 } };

  switch (targetType) {
    case "brand":
      await tx.brand.update({ where: { id }, data });
      return;
    case "product":
      await tx.product.update({ where: { id }, data });
      return;
    case "supplier":
      await tx.supplier.update({ where: { id }, data });
      return;
    case "category":
      await tx.category.update({ where: { id }, data });
      return;
  }
}

function parseOrThrow<T>(schema: z.ZodType<T>, raw: unknown, message: string): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw badRequest(message, issueDetails(parsed.error));
  }
  return parsed.data;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

/** Best-effort public cache invalidation after an SEO/slug mutation. */
function invalidate(tags: Iterable<string>): void {
  for (const tag of new Set(tags)) {
    try {
      revalidateTag(tag, { expire: 0 });
    } catch (err) {
      logger.warn({ err, tag }, "Failed to invalidate SEO cache tag");
    }
  }
}

// ---------------------------------------------------------------------------
// Admin mutations
// ---------------------------------------------------------------------------

export async function getSeoMeta(
  rawTargetKey: string,
  locale: AppLocale,
): Promise<SeoMetaRecord | null> {
  await requirePermission("seo:read");
  const target = parseSeoTargetKey(rawTargetKey);

  const row =
    target.pageKey !== null
      ? await prisma.seoMeta.findUnique({
          where: { pageKey_locale: { pageKey: target.pageKey, locale } },
          select: adminSeoSelect,
        })
      : await prisma.seoMeta.findUnique({
          where: {
            targetType_targetId_locale: {
              targetType: target.targetType,
              targetId: target.targetId as string,
              locale,
            },
          },
          select: adminSeoSelect,
        });

  return row ? toRecord(row) : null;
}

/**
 * `PUT /api/admin/seo/{targetKey}/{locale}` implementation. Saves the metadata
 * override and, when a slug is supplied for a slug-bearing entity, updates the
 * entity slug + records the redirect in the same transaction (T105).
 */
export async function saveSeoMeta(
  rawTargetKey: string,
  locale: AppLocale,
  raw: unknown,
): Promise<SeoMetaRecord> {
  const actor = await requirePermission("seo:update");
  const target = parseSeoTargetKey(rawTargetKey);
  const input = parseOrThrow(seoUpdateSchema, raw, "Invalid payload") as SeoUpdateInput;

  const entity =
    target.targetId !== null
      ? await findSeoEntity(target.targetType as Exclude<EntityType, "page">, target.targetId)
      : null;
  if (target.targetId !== null && !entity) {
    throw notFound("Record not found");
  }

  if (input.slug && !isSlugEntityType(target.targetType)) {
    throw badRequest("This target does not have a slug", [
      { path: "slug", issue: "invalidType" },
    ]);
  }

  const existing =
    target.pageKey !== null
      ? await prisma.seoMeta.findUnique({
          where: { pageKey_locale: { pageKey: target.pageKey, locale } },
          select: { id: true, version: true },
        })
      : await prisma.seoMeta.findUnique({
          where: {
            targetType_targetId_locale: {
              targetType: target.targetType,
              targetId: target.targetId as string,
              locale,
            },
          },
          select: { id: true, version: true },
        });

  if (input.version !== undefined && existing && input.version !== existing.version) {
    throw versionConflict(existing.version);
  }

  const slugColumn = locale === "en" ? "slugEn" : "slugAr";
  const currentSlug = entity ? entity[slugColumn] : null;
  const nextSlug = input.slug ?? null;
  const slugChanged = Boolean(nextSlug && currentSlug && nextSlug !== currentSlug);

  const data = {
    targetType: target.targetType,
    targetId: target.targetId,
    pageKey: target.pageKey,
    locale,
    metaTitle: input.metaTitle,
    metaDescription: input.metaDescription,
    canonicalUrl: input.canonicalUrl,
    ogImageMediaId: input.ogImageMediaId,
    noindex: input.noindex ?? false,
    slugOverride: nextSlug ?? currentSlug ?? null,
  };

  try {
    const record = await prisma.$transaction(async (tx) => {
      if (slugChanged && target.targetType !== "page" && target.targetId && nextSlug && currentSlug) {
        await writeSlug(
          tx,
          target.targetType as SlugEntityType,
          target.targetId,
          locale,
          nextSlug,
          actor.id,
        );
        await recordSlugChange(tx, {
          entityType: target.targetType,
          locale,
          oldSlug: currentSlug,
          newSlug: nextSlug,
        });
      }

      let savedId: string;
      if (existing) {
        const result = await tx.seoMeta.updateMany({
          where: { id: existing.id, version: existing.version },
          data: { ...data, updatedById: actor.id, version: { increment: 1 } },
        });
        if (result.count === 0) {
          throw versionConflict(existing.version);
        }
        savedId = existing.id;
      } else {
        const created = await tx.seoMeta.create({
          data: { ...data, createdById: actor.id },
          select: { id: true },
        });
        savedId = created.id;
      }

      await tx.activityLog.create({
        data: {
          actorId: actor.id,
          action: existing ? "update" : "create",
          entityType: target.targetType,
          entityId: (target.targetId ?? target.pageKey) as string,
          summary: `seo ${target.pageKey ?? target.targetType} (${locale})`,
        },
      });

      return savedId;
    });

    const saved = await prisma.seoMeta.findUnique({
      where: { id: record },
      select: adminSeoSelect,
    });
    if (!saved) throw notFound("Record not found");

    const tags = new Set<string>(["seo:sitemap"]);
    if (target.pageKey) {
      tags.add(`seo:page:${target.pageKey}:${locale}`);
    } else {
      tags.add(`seo:${target.targetType}:${target.targetId}:${locale}`);
    }
    if (
      target.targetType === "brand" ||
      target.targetType === "product" ||
      target.targetType === "supplier"
    ) {
      tags.add(`${target.targetType}s:${locale}`);
      if (currentSlug) tags.add(`${target.targetType}:${locale}:${currentSlug}`);
      if (nextSlug) tags.add(`${target.targetType}:${locale}:${nextSlug}`);
    }
    invalidate(tags);

    logger.info(
      { target: rawTargetKey, locale, actorId: actor.id, slugChanged },
      "SEO metadata saved",
    );
    return toRecord(saved);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw slugConflict();
    }
    throw error;
  }
}

export interface SlugRedirectRecord {
  id: string;
  entityType: EntityType;
  locale: AppLocale;
  oldSlug: string;
  newSlug: string;
  createdAt: Date;
}

export async function listSlugRedirects(): Promise<SlugRedirectRecord[]> {
  await requirePermission("seo:update");
  const rows = await prisma.slugRedirect.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return rows.map((row) => ({ ...row, locale: row.locale as AppLocale }));
}

export async function createSlugRedirect(raw: unknown): Promise<SlugRedirectRecord> {
  const actor = await requirePermission("seo:update");
  const input = parseOrThrow(slugRedirectCreateSchema, raw, "Invalid payload") as SlugRedirectCreateInput;

  if (input.oldSlug === input.newSlug) {
    throw badRequest("The slugs are identical", [{ path: "newSlug", issue: "invalidType" }]);
  }

  const target = await findEntityBySlug(input.entityType, input.locale as AppLocale, input.newSlug);
  if (!target) {
    throw badRequest("The target slug does not exist", [
      { path: "newSlug", issue: "notFound" },
    ]);
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.slugRedirect.create({
        data: {
          entityType: input.entityType,
          locale: input.locale as AppLocale,
          oldSlug: input.oldSlug,
          newSlug: input.newSlug,
        },
      });
      await tx.activityLog.create({
        data: {
          actorId: actor.id,
          action: "create",
          entityType: "slug_redirect",
          entityId: row.id,
          summary: `redirect ${input.entityType} ${input.locale} ${input.oldSlug} -> ${input.newSlug}`,
        },
      });
      return row;
    });
    invalidate([
      `${input.entityType}:${input.locale}:${input.oldSlug}`,
      `${input.entityType}s:${input.locale}`,
      "seo:sitemap",
    ]);
    return { ...created, locale: created.locale as AppLocale };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw slugConflict("A redirect for this slug already exists");
    }
    throw error;
  }
}

export async function deleteSlugRedirect(id: string): Promise<{ id: string; deleted: true }> {
  const actor = await requirePermission("seo:update");
  const row = await prisma.slugRedirect.findUnique({ where: { id } });
  if (!row) throw notFound("Redirect not found");

  await prisma.$transaction(async (tx) => {
    await tx.slugRedirect.delete({ where: { id } });
    await tx.activityLog.create({
      data: {
        actorId: actor.id,
        action: "delete",
        entityType: "slug_redirect",
        entityId: id,
        summary: `redirect ${row.entityType} ${row.locale} ${row.oldSlug} -> ${row.newSlug}`,
      },
    });
  });

  invalidate([
    `${row.entityType}:${row.locale}:${row.oldSlug}`,
    "seo:sitemap",
  ]);

  return { id, deleted: true };
}
