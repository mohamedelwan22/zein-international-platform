import { prisma } from "@/server/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { badRequest } from "@/server/http/errors";
import type { AppLocale } from "@/i18n/routing";
import { publicMediaUrl } from "./media";
import {
  DEFAULT_PAGE_SIZE,
  MAX_FACETS,
  MAX_PAGE_SIZE,
  MIN_QUERY_LENGTH,
  SEARCH_TYPES,
  buildTrgmPattern,
  isSearchQueryUsable,
  normalizeSearchQuery,
  pickSearchSlug,
  pickSearchText,
  resolvePagination,
  resolveSearchTypes,
  searchHref,
  type SearchType,
} from "./search-query";

/**
 * Public catalog search (T098, FR-015, SC-006, US9).
 *
 * One PostgreSQL round trip unions the four searchable entities — Product,
 * Brand, Supplier, Category — and returns a merged, ranked, typed result set
 * (contracts/public-api.md). Two complementary matchers feed the same WHERE:
 *
 * - `search_document @@ plainto_tsquery('simple', q)` — the stored generated
 *   column from T097, language-neutral so Arabic is not stemmed by an English
 *   dictionary (research.md §8);
 * - `ILIKE '%q%'` over name/slug/summary/description — backed by the
 *   `pg_trgm` GIN indexes, covering the substring/prefix matches tsvector
 *   cannot (e.g. "cem" → "cement").
 *
 * Publication predicates are applied HERE, at the query layer, and are never
 * relaxed: Product/Brand/Category require `status = 'published' AND
 * isActive = true`; Supplier additionally requires `disclosureApproved = true`
 * (data-model §2.5). `Client` is not searchable at all (data-model §5) — a
 * confidential reference must never leak through a public search side channel.
 *
 * Only public projection columns leave this module: audit, status, version
 * and disclosure columns are never selected.
 */

// ---------------------------------------------------------------------------
// Public shapes (contracts/public-api.md)
// ---------------------------------------------------------------------------

export interface SearchParams {
  q: string;
  types: SearchType[];
  locale: AppLocale;
  page: number;
  pageSize: number;
}

export interface SearchResultItem {
  id: string;
  type: SearchType;
  /** Alias of `type`, kept for the documented response contract. */
  entityType: SearchType;
  title: string;
  /** The active locale's bare slug. */
  slug: string;
  /** Locale-prefixed detail path the result opens in the active language. */
  href: string;
  summary: string | null;
  imageUrl: string | null;
  brandName: string | null;
}

export interface SearchCategoryFacet {
  kind: "brand" | "product" | "supplier";
  id: string;
  label: string;
  count: number;
}

export interface SearchResponse {
  items: SearchResultItem[];
  categoryFacets: SearchCategoryFacet[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Request parsing
// ---------------------------------------------------------------------------

/**
 * Parse and validate the query string. `q` is required and must be at least
 * MIN_QUERY_LENGTH characters (400 otherwise); `type`, `locale`, `page` and
 * `pageSize` are optional and clamped rather than rejected, so a public
 * endpoint degrades gracefully instead of erroring on a stray parameter.
 */
export function parseSearchParams(params: URLSearchParams): SearchParams {
  const q = normalizeSearchQuery(params.get("q") ?? "");
  if (!isSearchQueryUsable(q)) {
    throw badRequest(`Search query must be at least ${MIN_QUERY_LENGTH} characters`, [
      { field: "q", min: MIN_QUERY_LENGTH },
    ]);
  }

  const localeParam = params.get("locale");
  const locale: AppLocale = localeParam === "ar" ? "ar" : "en";
  const { page, pageSize } = resolvePagination(params.get("page"), params.get("pageSize"));

  return {
    q,
    types: resolveSearchTypes(params.get("type")),
    locale,
    page,
    pageSize,
  };
}

// ---------------------------------------------------------------------------
// SQL construction
// ---------------------------------------------------------------------------

const PUBLISHED = Prisma.raw("'published'");

/**
 * One UNION branch per entity, projecting an identical column list so the
 * branches can be unioned and paginated as a single set.
 *
 * Each branch hard-codes its own publication predicate — they differ per
 * entity, which is exactly why they cannot be hoisted into a shared partial
 * index (see the migration header).
 */
function branch(type: SearchType): Prisma.Sql {
  switch (type) {
    case "product":
      return Prisma.sql`
        SELECT
          'product'::text AS type,
          p."id" AS id,
          p."nameEn" AS name_en, p."nameAr" AS name_ar,
          p."slugEn" AS slug_en, p."slugAr" AS slug_ar,
          p."summaryEn" AS summary_en, p."summaryAr" AS summary_ar,
          (
            SELECT pi."mediaId" FROM "ProductImage" pi
             WHERE pi."productId" = p."id"
             ORDER BY pi."sortOrder" ASC
             LIMIT 1
          ) AS image_id,
          b."nameEn" AS brand_name_en, b."nameAr" AS brand_name_ar,
          (
            ts_rank(p."search_document", t.tsq) * 3
            + similarity(
                lower(coalesce(p."nameEn", '') || ' ' || coalesce(p."nameAr", '')),
                t.q_text
              )
          ) AS rank,
          CASE WHEN t.locale = 'ar'
               THEN coalesce(p."nameAr", p."nameEn", '')
               ELSE coalesce(p."nameEn", p."nameAr", '')
          END AS sort_title
        FROM "Product" p
        CROSS JOIN term t
        LEFT JOIN "Brand" b ON b."id" = p."brandId"
        WHERE p."status" = ${PUBLISHED} AND p."isActive" = true
          AND (
            p."search_document" @@ t.tsq
            OR p."nameEn" ILIKE t.like_pattern
            OR p."nameAr" ILIKE t.like_pattern
            OR p."slugEn" ILIKE t.like_pattern
            OR p."slugAr" ILIKE t.like_pattern
            OR coalesce(p."summaryEn", '') ILIKE t.like_pattern
            OR coalesce(p."summaryAr", '') ILIKE t.like_pattern
            OR coalesce(p."descriptionEn", '') ILIKE t.like_pattern
            OR coalesce(p."descriptionAr", '') ILIKE t.like_pattern
          )
      `;
    case "brand":
      return Prisma.sql`
        SELECT
          'brand'::text AS type,
          b."id" AS id,
          b."nameEn" AS name_en, b."nameAr" AS name_ar,
          b."slugEn" AS slug_en, b."slugAr" AS slug_ar,
          b."summaryEn" AS summary_en, b."summaryAr" AS summary_ar,
          coalesce(b."coverMediaId", b."logoMediaId") AS image_id,
          NULL::text AS brand_name_en, NULL::text AS brand_name_ar,
          (
            ts_rank(b."search_document", t.tsq) * 3
            + similarity(
                lower(coalesce(b."nameEn", '') || ' ' || coalesce(b."nameAr", '')),
                t.q_text
              )
          ) AS rank,
          CASE WHEN t.locale = 'ar'
               THEN coalesce(b."nameAr", b."nameEn", '')
               ELSE coalesce(b."nameEn", b."nameAr", '')
          END AS sort_title
        FROM "Brand" b
        CROSS JOIN term t
        WHERE b."status" = ${PUBLISHED} AND b."isActive" = true
          AND (
            b."search_document" @@ t.tsq
            OR b."nameEn" ILIKE t.like_pattern
            OR b."nameAr" ILIKE t.like_pattern
            OR b."slugEn" ILIKE t.like_pattern
            OR b."slugAr" ILIKE t.like_pattern
            OR coalesce(b."summaryEn", '') ILIKE t.like_pattern
            OR coalesce(b."summaryAr", '') ILIKE t.like_pattern
          )
      `;
    case "supplier":
      return Prisma.sql`
        SELECT
          'supplier'::text AS type,
          s."id" AS id,
          s."nameEn" AS name_en, s."nameAr" AS name_ar,
          s."slugEn" AS slug_en, s."slugAr" AS slug_ar,
          s."summaryEn" AS summary_en, s."summaryAr" AS summary_ar,
          coalesce(s."coverMediaId", s."logoMediaId") AS image_id,
          NULL::text AS brand_name_en, NULL::text AS brand_name_ar,
          (
            ts_rank(s."search_document", t.tsq) * 3
            + similarity(
                lower(coalesce(s."nameEn", '') || ' ' || coalesce(s."nameAr", '')),
                t.q_text
              )
          ) AS rank,
          CASE WHEN t.locale = 'ar'
               THEN coalesce(s."nameAr", s."nameEn", '')
               ELSE coalesce(s."nameEn", s."nameAr", '')
          END AS sort_title
        FROM "Supplier" s
        CROSS JOIN term t
        WHERE s."status" = ${PUBLISHED} AND s."isActive" = true
          -- data-model §2.5: a supplier under NDA never appears even while published.
          AND s."disclosureApproved" = true
          AND (
            s."search_document" @@ t.tsq
            OR s."nameEn" ILIKE t.like_pattern
            OR s."nameAr" ILIKE t.like_pattern
            OR s."slugEn" ILIKE t.like_pattern
            OR s."slugAr" ILIKE t.like_pattern
            OR coalesce(s."summaryEn", '') ILIKE t.like_pattern
            OR coalesce(s."summaryAr", '') ILIKE t.like_pattern
            OR coalesce(s."descriptionEn", '') ILIKE t.like_pattern
            OR coalesce(s."descriptionAr", '') ILIKE t.like_pattern
          )
      `;
    case "category":
      return Prisma.sql`
        SELECT
          'category'::text AS type,
          c."id" AS id,
          c."nameEn" AS name_en, c."nameAr" AS name_ar,
          c."slugEn" AS slug_en, c."slugAr" AS slug_ar,
          NULL::text AS summary_en, NULL::text AS summary_ar,
          NULL::uuid AS image_id,
          NULL::text AS brand_name_en, NULL::text AS brand_name_ar,
          (
            ts_rank(c."search_document", t.tsq) * 3
            + similarity(
                lower(coalesce(c."nameEn", '') || ' ' || coalesce(c."nameAr", '')),
                t.q_text
              )
          ) AS rank,
          CASE WHEN t.locale = 'ar'
               THEN coalesce(c."nameAr", c."nameEn", '')
               ELSE coalesce(c."nameEn", c."nameAr", '')
          END AS sort_title
        FROM "Category" c
        CROSS JOIN term t
        WHERE c."status" = ${PUBLISHED} AND c."isActive" = true
          AND (
            c."search_document" @@ t.tsq
            OR c."nameEn" ILIKE t.like_pattern
            OR c."nameAr" ILIKE t.like_pattern
            OR c."slugEn" ILIKE t.like_pattern
            OR c."slugAr" ILIKE t.like_pattern
            OR coalesce(c."descriptionEn", '') ILIKE t.like_pattern
            OR coalesce(c."descriptionAr", '') ILIKE t.like_pattern
          )
      `;
  }
}

/**
 * The shared `term` CTE (normalized query, escaped ILIKE pattern, compiled
 * tsquery, active locale) followed by the `matches` CTE unioning the
 * requested entity types.
 */
function matchesCte(params: SearchParams): Prisma.Sql {
  const { q, types, locale } = params;
  const branches = types.map(branch);
  return Prisma.sql`
    WITH term AS (
      SELECT
        lower(${q}) AS q_text,
        ${buildTrgmPattern(q)} AS like_pattern,
        ${locale} AS locale,
        plainto_tsquery('simple', ${q}) AS tsq
    ),
    matches AS (
      ${Prisma.join(branches, "UNION ALL")}
    )
  `;
}

interface MatchRow {
  type: SearchType;
  id: string;
  name_en: string | null;
  name_ar: string | null;
  slug_en: string;
  slug_ar: string;
  summary_en: string | null;
  summary_ar: string | null;
  image_id: string | null;
  brand_name_en: string | null;
  brand_name_ar: string | null;
  rank: number;
  total_count: number;
}

interface FacetRow {
  kind: "brand" | "product" | "supplier";
  id: string;
  name_en: string | null;
  name_ar: string | null;
  count: number;
}

// ---------------------------------------------------------------------------
// Search execution
// ---------------------------------------------------------------------------

export async function runSearch(params: SearchParams): Promise<SearchResponse> {
  // An all-invalid `type` filter means nothing is searchable — answer with the
  // documented empty payload instead of emitting invalid SQL (zero UNION branches).
  if (params.types.length === 0) {
    return { items: [], categoryFacets: [], total: 0, page: params.page, pageSize: params.pageSize };
  }

  const offset = (params.page - 1) * params.pageSize;
  const cte = matchesCte(params);
  const itemsSql = Prisma.sql`
    ${cte}
    SELECT m.*, count(*) OVER ()::int AS total_count
    FROM matches m
    ORDER BY m.rank DESC, m.sort_title ASC
    LIMIT ${params.pageSize} OFFSET ${offset}
  `;

  const [rows, facets] = await Promise.all([
    prisma.$queryRaw<MatchRow[]>(itemsSql),
    loadFacets(cte, params.types, params.locale),
  ]);

  const total = rows[0]?.total_count ?? 0;

  return {
    items: rows.map((row) => toItem(row, params.locale)),
    categoryFacets: facets,
    total,
    page: params.page,
    pageSize: params.pageSize,
  };
}

/** Category facets over the matched rows (contracts/public-api.md). */
async function loadFacets(
  cte: Prisma.Sql,
  types: SearchType[],
  locale: AppLocale,
): Promise<SearchCategoryFacet[]> {
  const joins: Prisma.Sql[] = [];
  if (types.includes("product")) {
    joins.push(Prisma.sql`
      SELECT c."kind" AS kind, c."id" AS id, c."nameEn" AS name_en, c."nameAr" AS name_ar
      FROM matches m
      JOIN "ProductCategory" pc ON pc."productId" = m.id
      JOIN "Category" c ON c."id" = pc."categoryId" AND c."status" = ${PUBLISHED} AND c."isActive" = true
    `);
  }
  if (types.includes("brand")) {
    joins.push(Prisma.sql`
      SELECT c."kind" AS kind, c."id" AS id, c."nameEn" AS name_en, c."nameAr" AS name_ar
      FROM matches m
      JOIN "BrandCategory" bc ON bc."brandId" = m.id
      JOIN "Category" c ON c."id" = bc."categoryId" AND c."status" = ${PUBLISHED} AND c."isActive" = true
    `);
  }
  if (types.includes("supplier")) {
    joins.push(Prisma.sql`
      SELECT c."kind" AS kind, c."id" AS id, c."nameEn" AS name_en, c."nameAr" AS name_ar
      FROM matches m
      JOIN "SupplierCategory" sc ON sc."supplierId" = m.id
      JOIN "Category" c ON c."id" = sc."categoryId" AND c."status" = ${PUBLISHED} AND c."isActive" = true
    `);
  }
  if (joins.length === 0) return [];

  const sql = Prisma.sql`
    ${cte}
    SELECT kind, id, name_en, name_ar, count(*)::int AS count
    FROM (${Prisma.join(joins, "UNION ALL")}) x
    GROUP BY kind, id, name_en, name_ar
    ORDER BY count DESC, name_en ASC
    LIMIT ${MAX_FACETS}
  `;

  const rows = await prisma.$queryRaw<FacetRow[]>(sql);
  return rows.map((row) => ({
    kind: row.kind,
    id: row.id,
    label: pickSearchText(locale, { nameEn: row.name_en, nameAr: row.name_ar }) ?? "",
    count: row.count,
  }));
}

function toItem(row: MatchRow, locale: AppLocale): SearchResultItem {
  const slug = pickSearchSlug(locale, row.slug_en, row.slug_ar);
  return {
    id: row.id,
    type: row.type,
    entityType: row.type,
    title: pickSearchText(locale, { nameEn: row.name_en, nameAr: row.name_ar }) ?? slug,
    slug,
    // `category` has no public detail route, so it is returned without a link.
    href: row.type === "category" ? "" : searchHref(row.type, slug, locale),
    summary: pickSearchText(locale, { nameEn: row.summary_en, nameAr: row.summary_ar }),
    imageUrl: row.image_id ? publicMediaUrl(row.image_id) : null,
    brandName: pickSearchText(locale, {
      nameEn: row.brand_name_en,
      nameAr: row.brand_name_ar,
    }),
  };
}

export { SEARCH_TYPES, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MIN_QUERY_LENGTH };
export type { SearchType };
