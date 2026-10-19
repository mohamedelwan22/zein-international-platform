import { prisma } from "@/server/db/prisma";
import { pickLocalized } from "@/i18n/localized";
import type { AppLocale } from "@/i18n/routing";
import type { CategoryKind, EntityType, Prisma } from "@/generated/prisma/client";
import { resolveSlugRedirect } from "./redirects";
import {
  listPublishedProductsBySupplier,
  type PublishedCategoryRef,
  type PublishedProductSummary,
} from "./catalog";

/**
 * Public directory reads (T085/T086, FR-011 / FR-012, US8).
 *
 * Supplier and client directories are pure database reads. Suppliers reuse the
 * canonical publication predicate `status = 'published' AND isActive = true`
 * PLUS `disclosureApproved = true` (data-model §2.5) — a supplier under NDA
 * never appears even while published. Clients are confidential by default: a
 * client reference is public ONLY when `disclosureApproved = true` AND
 * published AND active (data-model §2.6), and only the approved public fields
 * are ever selected (FR-012) — audit/status columns never leave this layer.
 *
 * Localized columns resolve through the shared T027 fallback helper; optional
 * fields hide (null) when neither locale has an approved value, and a row is
 * skipped entirely when its required localized name is missing.
 */

const PUBLISHED = "published" as const;

const DISCLOSED = { disclosureApproved: true } as const;

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

export interface PublicSupplierSummary {
  id: string;
  name: string;
  slug: string;
  summary: string | null;
  originCountry: string | null;
  logoMediaId: string | null;
  coverMediaId: string | null;
  categories: PublishedCategoryRef[];
}

export interface PublicSupplierDetail extends PublicSupplierSummary {
  description: string | null;
  history: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  products: PublishedProductSummary[];
}

export interface PublicClientSummary {
  id: string;
  name: string;
  logoMediaId: string | null;
  industry: string | null;
  location: string | null;
  website: string | null;
  description: string | null;
}

// ---------------------------------------------------------------------------
// Row shapes + selects
// ---------------------------------------------------------------------------

const PUBLISHED_CATEGORY = { status: PUBLISHED, isActive: true } as const;

const categoryColumns = {
  id: true,
  kind: true,
  nameEn: true,
  nameAr: true,
  slugEn: true,
  slugAr: true,
} satisfies Prisma.CategorySelect;

const publishedCategorySelect = {
  where: { category: PUBLISHED_CATEGORY },
  select: { category: { select: categoryColumns } },
} as const;

interface CategoryColumns {
  id: string;
  kind: CategoryKind;
  nameEn: string;
  nameAr: string;
  slugEn: string;
  slugAr: string;
}

interface SupplierSummaryRow {
  id: string;
  nameEn: string;
  nameAr: string;
  slugEn: string;
  slugAr: string;
  summaryEn: string | null;
  summaryAr: string | null;
  originCountryEn: string | null;
  originCountryAr: string | null;
  logoMediaId: string | null;
  coverMediaId: string | null;
  categories: { category: CategoryColumns }[];
}

interface ClientRow {
  id: string;
  nameEn: string;
  nameAr: string;
  logoMediaId: string | null;
  industryEn: string | null;
  industryAr: string | null;
  locationEn: string | null;
  locationAr: string | null;
  website: string | null;
  descriptionEn: string | null;
  descriptionAr: string | null;
}

const supplierSummarySelect = {
  id: true,
  nameEn: true,
  nameAr: true,
  slugEn: true,
  slugAr: true,
  summaryEn: true,
  summaryAr: true,
  originCountryEn: true,
  originCountryAr: true,
  logoMediaId: true,
  coverMediaId: true,
  categories: publishedCategorySelect,
} satisfies Prisma.SupplierSelect;

const supplierDetailSelect = {
  ...supplierSummarySelect,
  descriptionEn: true,
  descriptionAr: true,
  historyEn: true,
  historyAr: true,
  website: true,
  phone: true,
  email: true,
} satisfies Prisma.SupplierSelect;

const clientColumns = {
  id: true,
  nameEn: true,
  nameAr: true,
  logoMediaId: true,
  industryEn: true,
  industryAr: true,
  locationEn: true,
  locationAr: true,
  website: true,
  descriptionEn: true,
  descriptionAr: true,
} satisfies Prisma.ClientSelect;

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function mapCategoryRefs(
  locale: AppLocale,
  categories: { category: CategoryColumns }[],
): PublishedCategoryRef[] {
  return categories.flatMap(({ category }) => {
    const name = pickLocalized(locale, { en: category.nameEn, ar: category.nameAr });
    const slug = pickLocalized(locale, { en: category.slugEn, ar: category.slugAr });
    if (!name || !slug) return [];
    return [
      {
        id: category.id,
        kind: category.kind,
        name: name.text,
        slug: slug.text,
      },
    ];
  });
}

function mapSupplierSummary(
  locale: AppLocale,
  row: SupplierSummaryRow,
): PublicSupplierSummary | null {
  const name = pickLocalized(locale, { en: row.nameEn, ar: row.nameAr });
  const slug = pickLocalized(locale, { en: row.slugEn, ar: row.slugAr });
  if (!name || !slug) return null;

  const summary = pickLocalized(locale, { en: row.summaryEn, ar: row.summaryAr });
  const origin = pickLocalized(locale, {
    en: row.originCountryEn,
    ar: row.originCountryAr,
  });

  return {
    id: row.id,
    name: name.text,
    slug: slug.text,
    summary: summary?.text ?? null,
    originCountry: origin?.text ?? null,
    logoMediaId: row.logoMediaId,
    coverMediaId: row.coverMediaId,
    categories: mapCategoryRefs(locale, row.categories),
  };
}

function mapClient(locale: AppLocale, row: ClientRow): PublicClientSummary | null {
  const name = pickLocalized(locale, { en: row.nameEn, ar: row.nameAr });
  if (!name) return null;

  const industry = pickLocalized(locale, { en: row.industryEn, ar: row.industryAr });
  const location = pickLocalized(locale, { en: row.locationEn, ar: row.locationAr });
  const description = pickLocalized(locale, {
    en: row.descriptionEn,
    ar: row.descriptionAr,
  });

  return {
    id: row.id,
    name: name.text,
    logoMediaId: row.logoMediaId,
    industry: industry?.text ?? null,
    location: location?.text ?? null,
    website: row.website,
    description: description?.text ?? null,
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Disclosed + published + active supplier directory, ordered by `sortOrder`.
 * Returns an empty array (never a partial disclosure) when nothing is approved.
 */
export async function listPublicSuppliers(
  locale: AppLocale,
): Promise<PublicSupplierSummary[]> {
  const rows = await prisma.supplier.findMany({
    where: { ...DISCLOSED, status: PUBLISHED, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: supplierSummarySelect,
  });

  return rows.flatMap((row) => {
    const mapped = mapSupplierSummary(locale, row);
    return mapped ? [mapped] : [];
  });
}

/** True when a supplier slug exists in either locale (any publication state). */
async function supplierSlugExists(slug: string): Promise<boolean> {
  const row = await prisma.supplier.findFirst({
    where: { OR: [{ slugEn: slug }, { slugAr: slug }] },
    select: { id: true },
  });
  return row !== null;
}

/**
 * Disclosed + published supplier detail with its published products. Returns
 * null when the supplier is undisclosed or unpublished, so an NDA supplier can
 * never produce a public page. Slug resolution honors `SlugRedirect` (US10.3).
 */
export async function publicSupplierDetail(
  locale: AppLocale,
  slug: string,
): Promise<PublicSupplierDetail | null> {
  const entityType: EntityType = "supplier";
  const resolved = await resolveSlugRedirect({
    entityType,
    locale,
    slug,
    exists: supplierSlugExists,
  });

  const row = await prisma.supplier.findFirst({
    where: {
      ...DISCLOSED,
      status: PUBLISHED,
      isActive: true,
      ...(locale === "en" ? { slugEn: resolved } : { slugAr: resolved }),
    },
    select: supplierDetailSelect,
  });
  if (!row) return null;

  const base = mapSupplierSummary(locale, row);
  if (!base) return null;

  const description = pickLocalized(locale, {
    en: row.descriptionEn,
    ar: row.descriptionAr,
  });
  const history = pickLocalized(locale, { en: row.historyEn, ar: row.historyAr });

  const products = await listPublishedProductsBySupplier(locale, row.id);

  return {
    ...base,
    description: description?.text ?? null,
    history: history?.text ?? null,
    website: row.website,
    phone: row.phone,
    email: row.email,
    products,
  };
}

/**
 * Disclosed + published + active client references, ordered by `sortOrder`
 * (FR-012). Every non-approved client is excluded at the query layer; only the
 * approved public fields are selected.
 */
export async function listPublicClients(
  locale: AppLocale,
): Promise<PublicClientSummary[]> {
  const rows = await prisma.client.findMany({
    where: { ...DISCLOSED, status: PUBLISHED, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: clientColumns,
  });

  return rows.flatMap((row) => {
    const mapped = mapClient(locale, row);
    return mapped ? [mapped] : [];
  });
}
