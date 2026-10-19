import { pickLocalized } from "@/i18n/localized";

/**
 * Search query builder — pure functions, no I/O (T094/T098, FR-015, SC-006).
 *
 * Split out from `search.ts` so the unit test can exercise the query shape,
 * guards, pagination and locale selection without constructing a Prisma
 * client or loading the media/storage stack. The only dependency is the
 * shared T027 localized-fallback helper.
 *
 * PostgreSQL-native by design (research.md §8, data-model §5): a
 * `to_tsvector('simple', …)` generated column per searchable entity plus
 * `pg_trgm` GIN indexes for substring/prefix matching. `simple` (not
 * `english`/`arabic`) is the researched choice — it is language-neutral, so
 * Arabic is not stemmed by an English dictionary.
 *
 * `Client` is deliberately NOT searchable (data-model §5): a client
 * reference is confidential until `disclosureApproved`, and search must
 * never become a side channel that leaks it.
 */

export const SEARCH_TYPES = ["product", "brand", "supplier", "category"] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

/** Contract minimum for `q` (contracts/public-api.md). */
export const MIN_QUERY_LENGTH = 2;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;
export const MAX_FACETS = 20;

/** Public detail route per entity type. Categories have no detail page. */
const HREF_SEGMENT: Record<SearchType, string | null> = {
  product: "products",
  brand: "brands",
  supplier: "suppliers",
  category: null,
};

// ---------------------------------------------------------------------------
// Query normalization + guards
// ---------------------------------------------------------------------------

/**
 * Trim and collapse internal whitespace runs. Never let padded or
 * tab-separated input reach the match expression — it would silently produce
 * zero matches and waste a round trip.
 */
export function normalizeSearchQuery(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** The contract's min-2-chars rule for `q`. */
export function isSearchQueryUsable(query: string): boolean {
  return query.length >= MIN_QUERY_LENGTH;
}

/**
 * An ILIKE pattern for `pg_trgm` substring matching. LIKE metacharacters in
 * the user's term are escaped so a literal `%` searches for a literal `%`.
 * Postgres' default ILIKE escape character is `\`.
 */
export function buildTrgmPattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

// ---------------------------------------------------------------------------
// Projection (data-model §5)
// ---------------------------------------------------------------------------

/**
 * The `to_tsvector('simple', …)` expression for a generated column, over
 * BOTH locales so a query in either language finds the row.
 *
 * Every column is `coalesce`d to `''` so a NULL summary can never null the
 * whole document, and `lower`d because `simple` lexemes are lowercase.
 * The expression is IMMUTABLE, which Postgres requires of a stored
 * generated column.
 */
export function buildSearchDocumentSql(columns: {
  nameEn: string;
  nameAr: string;
  textColumns: readonly string[];
}): string {
  const parts = [columns.nameEn, columns.nameAr, ...columns.textColumns].map(
    (column) => `coalesce(lower(${column}), '')`,
  );
  return `to_tsvector('simple', ${parts.join(" || ' ' || ")})`;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export function isSearchType(value: string): value is SearchType {
  return (SEARCH_TYPES as readonly string[]).includes(value);
}

/**
 * Resolve the `type` filter. Omitted/blank means "all four"; a
 * comma-separated list is accepted; unknown entries are dropped so a typo
 * degrades to the valid subset instead of erroring on a public endpoint.
 */
export function resolveSearchTypes(raw: string | undefined | null): SearchType[] {
  if (raw === undefined || raw === null || raw.trim() === "") {
    return [...SEARCH_TYPES];
  }
  const entries = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  return [...new Set(entries.filter(isSearchType))];
}

/**
 * Clamp `page`/`pageSize` into the contract's bounds. Public endpoints never
 * echo unbounded values back into a LIMIT clause.
 */
export function resolvePagination(
  pageRaw: string | number | undefined | null,
  pageSizeRaw: string | number | undefined | null,
): { page: number; pageSize: number } {
  return {
    page: clampInt(pageRaw, 1, Number.MAX_SAFE_INTEGER, 1),
    pageSize: clampInt(pageSizeRaw, 1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE),
  };
}

function clampInt(
  raw: string | number | undefined | null,
  min: number,
  max: number,
  fallback: number,
): number {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const parsed = typeof raw === "number" ? raw : Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

// ---------------------------------------------------------------------------
// Locale-aware projection (Constitution VI, T027 fallback)
// ---------------------------------------------------------------------------

/** The active locale's name, falling back to the other locale, else null. */
export function pickSearchText(
  locale: "en" | "ar",
  row: { nameEn: string | null; nameAr: string | null },
): string | null {
  return pickLocalized(locale, { en: row.nameEn, ar: row.nameAr })?.text ?? null;
}

/** The active locale's slug, falling back to the other locale's slug. */
export function pickSearchSlug(
  locale: "en" | "ar",
  slugEn: string | null,
  slugAr: string | null,
): string {
  return pickLocalized(locale, { en: slugEn, ar: slugAr })?.text ?? slugEn ?? slugAr ?? "";
}

// ---------------------------------------------------------------------------
// Result links
// ---------------------------------------------------------------------------

/**
 * Encode a slug for a path segment without double-encoding an escape that is
 * already present (Arabic slugs such as `الا` are stored raw in the DB and
 * must be percent-encoded once).
 */
function encodeSlugSegment(slug: string): string {
  return slug.replace(
    /%(?![0-9A-Fa-f]{2})|[^A-Za-z0-9\-._~%]/g,
    (ch) => encodeURIComponent(ch),
  );
}

/**
 * The locale-prefixed detail path a result opens in the active language.
 * Throws for `category` — categories are browsable facets, not detail pages
 * (`routes/plan.md`), so emitting a link would only produce a 404.
 */
export function searchHref(type: SearchType, slug: string, locale: "en" | "ar"): string {
  const segment = HREF_SEGMENT[type];
  if (!segment) {
    throw new Error(`Search type "${type}" has no public detail route`);
  }
  return `/${locale}/${segment}/${encodeSlugSegment(slug)}`;
}
