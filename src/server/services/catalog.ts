import { prisma } from "@/server/db/prisma";
import { pickLocalized } from "@/i18n/localized";
import type { AppLocale } from "@/i18n/routing";
import type {
  CategoryKind,
  EntityType,
  Prisma,
} from "@/generated/prisma/client";
import { resolveSlugRedirect } from "./redirects";

/**
 * Public catalog reads (T041, FR-008 / FR-009 / SC-002).
 *
 * Brand and product directories + detail pages are pure database reads. Every
 * query enforces the single canonical publication predicate
 * `status = 'published' AND isActive = true` (data-model §2), and — per
 * data-model §2.4 — a product additionally requires a published+active brand
 * and at least one published+active category, so archived references can never
 * produce an orphan public page.
 *
 * Localized columns resolve through the shared T027 fallback helper; optional
 * fields hide (null) when neither locale has an approved value.
 */

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

export interface LocalizedRef {
  id: string;
  name: string;
  slug: string;
}

export interface PublishedCategoryRef extends LocalizedRef {
  kind: CategoryKind;
}

export interface PublishedBrandSummary {
  id: string;
  name: string;
  slug: string;
  summary: string | null;
  originCountry: string | null;
  featured: boolean;
  logoMediaId: string | null;
  coverMediaId: string | null;
  categories: PublishedCategoryRef[];
}

export interface PublishedProductSummary {
  id: string;
  name: string;
  slug: string;
  summary: string | null;
  countryOfOrigin: string | null;
  brand: LocalizedRef;
  categories: PublishedCategoryRef[];
}

export interface ProductImageRef {
  mediaId: string;
  alt: string | null;
  sortOrder: number;
}

export interface ProductDetail extends PublishedProductSummary {
  description: string | null;
  specifications: Record<string, unknown> | null;
  sku: string | null;
  reference: string | null;
  brochureMediaId: string | null;
  images: ProductImageRef[];
}

export interface BrandDetail extends PublishedBrandSummary {
  history: string | null;
  distribution: string | null;
  website: string | null;
  products: PublishedProductSummary[];
}

export interface CatalogFilters {
  brandSlug?: string;
  categorySlug?: string;
  /** Matches either locale's `countryOfOrigin` column (FR-009). */
  country?: string;
}

// ---------------------------------------------------------------------------
// Column helpers
// ---------------------------------------------------------------------------

const PUBLISHED = "published" as const;

function slugColumn(locale: AppLocale): "slugEn" | "slugAr" {
  return locale === "en" ? "slugEn" : "slugAr";
}

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

interface CategoryColumns {
  id: string;
  kind: CategoryKind;
  nameEn: string;
  nameAr: string;
  slugEn: string;
  slugAr: string;
}

interface LocalizedBrandColumns {
  id: string;
  nameEn: string;
  nameAr: string;
  slugEn: string;
  slugAr: string;
}

interface BrandSummaryRow {
  id: string;
  nameEn: string;
  nameAr: string;
  slugEn: string;
  slugAr: string;
  summaryEn: string | null;
  summaryAr: string | null;
  originCountryEn: string | null;
  originCountryAr: string | null;
  featured: boolean;
  logoMediaId: string | null;
  coverMediaId: string | null;
  categories: { category: CategoryColumns }[];
}

interface BrandDetailRow extends BrandSummaryRow {
  historyEn: string | null;
  historyAr: string | null;
  distributionEn: string | null;
  distributionAr: string | null;
  website: string | null;
  products: ProductSummaryRow[];
}

interface ProductSummaryRow {
  id: string;
  nameEn: string;
  nameAr: string;
  slugEn: string;
  slugAr: string;
  summaryEn: string | null;
  summaryAr: string | null;
  countryOfOriginEn: string | null;
  countryOfOriginAr: string | null;
  brand: LocalizedBrandColumns;
  categories: { category: CategoryColumns }[];
}

interface ProductDetailRow extends ProductSummaryRow {
  descriptionEn: string | null;
  descriptionAr: string | null;
  specificationsEn: Prisma.JsonValue | null;
  specificationsAr: Prisma.JsonValue | null;
  sku: string | null;
  reference: string | null;
  brochureMediaId: string | null;
  images: {
    mediaId: string;
    sortOrder: number;
    media: { altEn: string | null; altAr: string | null };
  }[];
}

// ---------------------------------------------------------------------------
// Selects (declaration order matters: dependents come after dependencies)
// ---------------------------------------------------------------------------

const categoryColumns = {
  id: true,
  kind: true,
  nameEn: true,
  nameAr: true,
  slugEn: true,
  slugAr: true,
} satisfies Prisma.CategorySelect;

const brandColumns = {
  id: true,
  nameEn: true,
  nameAr: true,
  slugEn: true,
  slugAr: true,
} satisfies Prisma.BrandSelect;

/** Only published+active categories are ever rendered/aggregated. */
const publishedCategoryWhere = {
  status: PUBLISHED,
  isActive: true,
} as const;

/** Published-only category junction selection (shared by brand + product). */
const publishedCategorySelect = {
  where: { category: publishedCategoryWhere },
  select: { category: { select: categoryColumns } },
} as const;

const productSummarySelect = {
  id: true,
  nameEn: true,
  nameAr: true,
  slugEn: true,
  slugAr: true,
  summaryEn: true,
  summaryAr: true,
  countryOfOriginEn: true,
  countryOfOriginAr: true,
  brand: { select: brandColumns },
  categories: publishedCategorySelect,
} satisfies Prisma.ProductSelect;

const productDetailSelect = {
  ...productSummarySelect,
  descriptionEn: true,
  descriptionAr: true,
  specificationsEn: true,
  specificationsAr: true,
  sku: true,
  reference: true,
  brochureMediaId: true,
  images: {
    orderBy: { sortOrder: "asc" },
    select: {
      mediaId: true,
      sortOrder: true,
      media: { select: { altEn: true, altAr: true } },
    },
  },
} satisfies Prisma.ProductSelect;

const brandSummarySelect = {
  id: true,
  nameEn: true,
  nameAr: true,
  slugEn: true,
  slugAr: true,
  summaryEn: true,
  summaryAr: true,
  originCountryEn: true,
  originCountryAr: true,
  featured: true,
  logoMediaId: true,
  coverMediaId: true,
  categories: publishedCategorySelect,
} satisfies Prisma.BrandSelect;

const brandDetailSelect = {
  ...brandSummarySelect,
  historyEn: true,
  historyAr: true,
  distributionEn: true,
  distributionAr: true,
  website: true,
  products: {
    where: {
      status: PUBLISHED,
      isActive: true,
      categories: { some: { category: publishedCategoryWhere } },
    },
    orderBy: { sortOrder: "asc" },
    select: productSummarySelect,
  },
} satisfies Prisma.BrandSelect;

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function mapCategoryRef(
  locale: AppLocale,
  category: CategoryColumns,
): PublishedCategoryRef | null {
  const name = pickLocalized(locale, {
    en: category.nameEn,
    ar: category.nameAr,
  });
  const slug = pickLocalized(locale, {
    en: category.slugEn,
    ar: category.slugAr,
  });
  if (!name || !slug) return null;

  return {
    id: category.id,
    kind: category.kind,
    name: name.text,
    slug: slug.text,
  };
}

function mapCategoryRefs(
  locale: AppLocale,
  categories: { category: CategoryColumns }[],
): PublishedCategoryRef[] {
  return categories.flatMap(({ category }) => {
    const ref = mapCategoryRef(locale, category);
    return ref ? [ref] : [];
  });
}

function mapProductSummary(
  locale: AppLocale,
  row: ProductSummaryRow,
): PublishedProductSummary | null {
  const name = pickLocalized(locale, { en: row.nameEn, ar: row.nameAr });
  const slug = pickLocalized(locale, { en: row.slugEn, ar: row.slugAr });
  const summary = pickLocalized(locale, { en: row.summaryEn, ar: row.summaryAr });
  const country = pickLocalized(locale, {
    en: row.countryOfOriginEn,
    ar: row.countryOfOriginAr,
  });
  const brandName = pickLocalized(locale, {
    en: row.brand.nameEn,
    ar: row.brand.nameAr,
  });
  const brandSlug = pickLocalized(locale, {
    en: row.brand.slugEn,
    ar: row.brand.slugAr,
  });

  if (!name || !slug || !brandName || !brandSlug) return null;

  return {
    id: row.id,
    name: name.text,
    slug: slug.text,
    summary: summary?.text ?? null,
    countryOfOrigin: country?.text ?? null,
    brand: {
      id: row.brand.id,
      name: brandName.text,
      slug: brandSlug.text,
    },
    categories: mapCategoryRefs(locale, row.categories),
  };
}

function mapBrandSummary(
  locale: AppLocale,
  row: BrandSummaryRow,
): PublishedBrandSummary | null {
  const name = pickLocalized(locale, { en: row.nameEn, ar: row.nameAr });
  const slug = pickLocalized(locale, { en: row.slugEn, ar: row.slugAr });
  const summary = pickLocalized(locale, { en: row.summaryEn, ar: row.summaryAr });
  const origin = pickLocalized(locale, {
    en: row.originCountryEn,
    ar: row.originCountryAr,
  });

  if (!name || !slug) return null;

  return {
    id: row.id,
    name: name.text,
    slug: slug.text,
    summary: summary?.text ?? null,
    originCountry: origin?.text ?? null,
    featured: row.featured,
    logoMediaId: row.logoMediaId,
    coverMediaId: row.coverMediaId,
    categories: mapCategoryRefs(locale, row.categories),
  };
}

function mapProductDetail(
  locale: AppLocale,
  row: ProductDetailRow,
): ProductDetail | null {
  const base = mapProductSummary(locale, row);
  if (!base) return null;

  const description = pickLocalized(locale, {
    en: row.descriptionEn,
    ar: row.descriptionAr,
  });

  const primarySpecs =
    locale === "en" ? row.specificationsEn : row.specificationsAr;
  const fallbackSpecs =
    locale === "en" ? row.specificationsAr : row.specificationsEn;
  const specifications = (primarySpecs ??
    fallbackSpecs) as Record<string, unknown> | null;

  return {
    ...base,
    description: description?.text ?? null,
    specifications,
    sku: row.sku,
    reference: row.reference,
    brochureMediaId: row.brochureMediaId,
    images: row.images.map((image) => {
      const alt = pickLocalized(locale, {
        en: image.media.altEn,
        ar: image.media.altAr,
      });
      return {
        mediaId: image.mediaId,
        alt: alt?.text ?? null,
        sortOrder: image.sortOrder,
      };
    }),
  };
}

function mapBrandDetail(
  locale: AppLocale,
  row: BrandDetailRow,
): BrandDetail | null {
  const base = mapBrandSummary(locale, row);
  if (!base) return null;

  const history = pickLocalized(locale, {
    en: row.historyEn,
    ar: row.historyAr,
  });
  const distribution = pickLocalized(locale, {
    en: row.distributionEn,
    ar: row.distributionAr,
  });

  return {
    ...base,
    history: history?.text ?? null,
    distribution: distribution?.text ?? null,
    website: row.website,
    products: row.products.flatMap((product) => {
      const mapped = mapProductSummary(locale, product);
      return mapped ? [mapped] : [];
    }),
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Published+active brand directory, ordered by `sortOrder`. */
export async function listPublishedBrands(
  locale: AppLocale,
): Promise<PublishedBrandSummary[]> {
  const rows = await prisma.brand.findMany({
    where: { status: PUBLISHED, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: brandSummarySelect,
  });

  return rows.flatMap((row) => {
    const mapped = mapBrandSummary(locale, row);
    return mapped ? [mapped] : [];
  });
}

/**
 * Published+active product directory. Filters (brand, category, country of
 * origin) may be used individually or combined; clearing them restores the
 * full published set (FR-009).
 */
export async function listPublishedProducts(
  locale: AppLocale,
  filters: CatalogFilters = {},
): Promise<PublishedProductSummary[]> {
  const slugKey = slugColumn(locale);

  const where: Prisma.ProductWhereInput = {
    status: PUBLISHED,
    isActive: true,
    brand: { status: PUBLISHED, isActive: true },
    categories: { some: { category: publishedCategoryWhere } },
  };

  if (filters.brandSlug) {
    where.brand =
      slugKey === "slugEn"
        ? { status: PUBLISHED, isActive: true, slugEn: filters.brandSlug }
        : { status: PUBLISHED, isActive: true, slugAr: filters.brandSlug };
  }

  if (filters.categorySlug) {
    where.categories =
      slugKey === "slugEn"
        ? {
            some: {
              category: {
                status: PUBLISHED,
                isActive: true,
                slugEn: filters.categorySlug,
              },
            },
          }
        : {
            some: {
              category: {
                status: PUBLISHED,
                isActive: true,
                slugAr: filters.categorySlug,
              },
            },
          };
  }

  if (filters.country) {
    // Country of origin matches either locale's column (FR-009).
    where.OR = [
      { countryOfOriginEn: filters.country },
      { countryOfOriginAr: filters.country },
    ];
  }

  const rows = await prisma.product.findMany({
    where,
    orderBy: { sortOrder: "asc" },
    select: productSummarySelect,
  });

  return rows.flatMap((row) => {
    const mapped = mapProductSummary(locale, row);
    return mapped ? [mapped] : [];
  });
}

/** True when a slug is currently owned by an entity (any publication state). */
async function entitySlugExists(
  entityType: EntityType,
  locale: AppLocale,
  slug: string,
): Promise<boolean> {
  const slugKey = slugColumn(locale);
  const where = slugKey === "slugEn" ? { slugEn: slug } : { slugAr: slug };

  if (entityType === "brand") {
    const row = await prisma.brand.findFirst({ where, select: { id: true } });
    return row !== null;
  }

  if (entityType === "product") {
    const row = await prisma.product.findFirst({ where, select: { id: true } });
    return row !== null;
  }

  return false;
}

/**
 * Published product detail. Returns null when the product, its brand, or its
 * only categories are not published — no orphan public pages (data-model §2.4).
 * Slug resolution honors `SlugRedirect` (US10.3 behavior).
 */
export async function productDetail(
  locale: AppLocale,
  slug: string,
): Promise<ProductDetail | null> {
  const resolved = await resolveSlugRedirect({
    entityType: "product",
    locale,
    slug,
    exists: (candidate) => entitySlugExists("product", locale, candidate),
  });

  const row = await prisma.product.findFirst({
    where: {
      status: PUBLISHED,
      isActive: true,
      brand: { status: PUBLISHED, isActive: true },
      categories: { some: { category: publishedCategoryWhere } },
      ...(locale === "en" ? { slugEn: resolved } : { slugAr: resolved }),
    },
    select: productDetailSelect,
  });

  return row ? mapProductDetail(locale, row) : null;
}

/**
 * Published brand detail with its published products. Returns null when the
 * brand is not published. Slug resolution honors `SlugRedirect` (US10.3).
 */
export async function brandDetail(
  locale: AppLocale,
  slug: string,
): Promise<BrandDetail | null> {
  const resolved = await resolveSlugRedirect({
    entityType: "brand",
    locale,
    slug,
    exists: (candidate) => entitySlugExists("brand", locale, candidate),
  });

  const row = await prisma.brand.findFirst({
    where: {
      status: PUBLISHED,
      isActive: true,
      ...(locale === "en" ? { slugEn: resolved } : { slugAr: resolved }),
    },
    select: brandDetailSelect,
  });

  return row ? mapBrandDetail(locale, row) : null;
}
