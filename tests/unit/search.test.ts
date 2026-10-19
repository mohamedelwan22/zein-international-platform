import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MIN_QUERY_LENGTH,
  SEARCH_TYPES,
  buildSearchDocumentSql,
  buildTrgmPattern,
  isSearchType,
  isSearchQueryUsable,
  normalizeSearchQuery,
  pickSearchSlug,
  pickSearchText,
  resolvePagination,
  resolveSearchTypes,
  searchHref,
  type SearchType,
} from "../../src/server/services/search-query";

/**
 * T094 [US9] — search query builder (FR-015, SC-006, data-model §5).
 *
 * The builder is pure so it can be unit-tested without a database:
 * - `normalizeSearchQuery` trims and collapses whitespace (Constitution VI:
 *   never search on padded input, and never let user whitespace break the
 *   SQL match expression);
 * - `isSearchQueryUsable` enforces the contract's `q` min-2-chars rule
 *   (contracts/public-api.md);
 * - `buildSearchDocumentSql` is the `to_tsvector('simple', …)` projection
 *   over BOTH locales' name/summary columns (data-model §5) — language-neutral
 *   `simple` config is the researched choice for Arabic (research.md §8);
 * - `buildTrgmPattern` produces a `pg_trgm`-friendly ILIKE pattern with the
 *   LIKE wildcards escaped so a literal `%` in the query stays literal;
 * - `resolveSearchTypes` defaults to all four searchable entities and
 *   rejects unknown ones;
 * - `resolvePagination` clamps to the contract's page/pageSize bounds;
 * - `pickSearchText` / `pickSearchSlug` are the locale-aware title/slug
 *   selection with the shared T027 fallback (active locale, then the other);
 * - `searchHref` produces the locale-prefixed detail path a result opens.
 */

describe("normalizeSearchQuery", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeSearchQuery("  cement  ")).toBe("cement");
  });

  it("collapses internal whitespace runs to a single space", () => {
    expect(normalizeSearchQuery("hollow   block\tset")).toBe("hollow block set");
  });

  it("keeps Arabic script intact and trims it", () => {
    expect(normalizeSearchQuery("  بلاط  ")).toBe("بلاط");
  });

  it("returns an empty string for whitespace-only input", () => {
    expect(normalizeSearchQuery("   \t  ")).toBe("");
  });
});

describe("isSearchQueryUsable — min-length 2 guard", () => {
  it("rejects an empty query", () => {
    expect(isSearchQueryUsable("")).toBe(false);
  });

  it("rejects a single character (below MIN_QUERY_LENGTH)", () => {
    expect(MIN_QUERY_LENGTH).toBe(2);
    expect(isSearchQueryUsable("a")).toBe(false);
  });

  it("accepts exactly two characters", () => {
    expect(isSearchQueryUsable("ab")).toBe(true);
  });

  it("accepts a two-character Arabic query", () => {
    expect(isSearchQueryUsable("سلع")).toBe(true);
  });

  it("accepts a longer query", () => {
    expect(isSearchQueryUsable("cement")).toBe(true);
  });
});

describe("buildSearchDocumentSql — tsvector('simple') projection", () => {
  it("concatenates both locales' name columns with the simple config", () => {
    const sql = buildSearchDocumentSql({
      nameEn: "name_en",
      nameAr: "name_ar",
      textColumns: [],
    });
    expect(sql).toContain("to_tsvector('simple'");
    expect(sql).toContain("name_en");
    expect(sql).toContain("name_ar");
  });

  it("includes the optional summary/description columns when supplied", () => {
    const sql = buildSearchDocumentSql({
      nameEn: "name_en",
      nameAr: "name_ar",
      textColumns: ["summary_en", "summary_ar", "description_en"],
    });
    expect(sql).toContain("summary_en");
    expect(sql).toContain("summary_ar");
    expect(sql).toContain("description_en");
  });

  it("wraps every column in coalesce + lower so NULLs never null the document", () => {
    const sql = buildSearchDocumentSql({
      nameEn: "name_en",
      nameAr: "name_ar",
      textColumns: ["summary_en"],
    });
    expect(sql).toContain("coalesce");
    expect(sql).toContain("lower");
  });

  it("is deterministic — identical inputs produce identical SQL", () => {
    const args = { nameEn: "name_en", nameAr: "name_ar", textColumns: ["summary_en"] };
    expect(buildSearchDocumentSql(args)).toBe(buildSearchDocumentSql(args));
  });
});

describe("buildTrgmPattern — pg_trgm partial matching", () => {
  it("wraps the term in wildcards for substring matching", () => {
    expect(buildTrgmPattern("cement")).toBe("%cement%");
  });

  it("escapes the LIKE wildcard %", () => {
    expect(buildTrgmPattern("100%")).toBe("%100\\%%");
  });

  it("escapes the LIKE wildcard _", () => {
    expect(buildTrgmPattern("a_b")).toBe("%a\\_b%");
  });

  it("escapes the LIKE escape character itself", () => {
    expect(buildTrgmPattern("a\\b")).toBe("%a\\\\b%");
  });

  it("leaves Arabic script untouched", () => {
    expect(buildTrgmPattern("إسمنت")).toBe("%إسمنت%");
  });
});

describe("resolveSearchTypes — type filter", () => {
  it("exposes exactly the four searchable entities (Client is excluded)", () => {
    expect([...SEARCH_TYPES]).toEqual(["product", "brand", "supplier", "category"]);
    expect(SEARCH_TYPES).not.toContain("client");
  });

  it("isSearchType narrows known types", () => {
    expect(isSearchType("product")).toBe(true);
    expect(isSearchType("category")).toBe(true);
    expect(isSearchType("client")).toBe(false);
    expect(isSearchType("location")).toBe(false);
  });

  it("defaults to all four types when the filter is omitted", () => {
    expect(resolveSearchTypes(undefined)).toEqual([...SEARCH_TYPES]);
  });

  it("accepts a single type", () => {
    expect(resolveSearchTypes("brand")).toEqual(["brand"]);
  });

  it("accepts a comma-separated list of types", () => {
    expect(resolveSearchTypes("product,brand")).toEqual(["product", "brand"]);
  });

  it("drops unknown entries from a list", () => {
    expect(resolveSearchTypes("product,nonsense,brand")).toEqual(["product", "brand"]);
  });

  it("returns an empty list when nothing valid is left", () => {
    expect(resolveSearchTypes("nonsense")).toEqual([]);
  });
});

describe("resolvePagination — pagination clamping", () => {
  it("defaults to page 1 and the default page size", () => {
    expect(resolvePagination(undefined, undefined)).toEqual({
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
    });
  });

  it("clamps a page below 1 up to 1", () => {
    expect(resolvePagination(0, 10).page).toBe(1);
    expect(resolvePagination(-3, 10).page).toBe(1);
  });

  it("clamps a pageSize above the maximum down", () => {
    expect(MAX_PAGE_SIZE).toBe(50);
    expect(resolvePagination(1, 999).pageSize).toBe(MAX_PAGE_SIZE);
  });

  it("clamps a pageSize below 1 up to 1", () => {
    expect(resolvePagination(1, 0).pageSize).toBe(1);
  });

  it("keeps in-range values as given", () => {
    expect(resolvePagination(3, 15)).toEqual({ page: 3, pageSize: 15 });
  });
});

describe("pickSearchText — locale-aware title selection", () => {
  const row = { nameEn: "Cement Blocks", nameAr: "بلاط إسمنت" };

  it("uses the active locale when it has a value", () => {
    expect(pickSearchText("en", row)).toBe("Cement Blocks");
    expect(pickSearchText("ar", row)).toBe("بلاط إسمنت");
  });

  it("falls back to the other locale when the active one is missing", () => {
    expect(pickSearchText("ar", { nameEn: "Cement Blocks", nameAr: null })).toBe(
      "Cement Blocks",
    );
    expect(pickSearchText("en", { nameEn: "", nameAr: "بلاط إسمنت" })).toBe("بلاط إسمنت");
  });

  it("returns null when neither locale has a value", () => {
    expect(pickSearchText("en", { nameEn: null, nameAr: null })).toBeNull();
  });
});

describe("pickSearchSlug — locale-aware slug selection", () => {
  it("uses the active locale's slug", () => {
    expect(pickSearchSlug("en", "cement-blocks", "al-bana")).toBe("cement-blocks");
    expect(pickSearchSlug("ar", "cement-blocks", "al-bana")).toBe("al-bana");
  });

  it("falls back to the other locale's slug when the active one is empty", () => {
    expect(pickSearchSlug("ar", "cement-blocks", "")).toBe("cement-blocks");
  });
});

describe("searchHref — locale-prefixed detail path", () => {
  const cases: Array<[SearchType, string, "en" | "ar", string]> = [
    ["product", "cement-blocks", "en", "/en/products/cement-blocks"],
    ["product", "cement-blocks", "ar", "/ar/products/cement-blocks"],
    ["brand", "bestway", "en", "/en/brands/bestway"],
    ["brand", "bestway", "ar", "/ar/brands/bestway"],
    ["supplier", "gulf-supply", "en", "/en/suppliers/gulf-supply"],
    ["supplier", "gulf-supply", "ar", "/ar/suppliers/gulf-supply"],
  ];

  it.each(cases)("builds the %s path for %s in %s", (type, slug, locale, expected) => {
    expect(searchHref(type, slug, locale)).toBe(expected);
  });

  it("percent-encodes non-ASCII slugs so the link is a valid URL", () => {
    expect(searchHref("supplier", "الا", "ar")).toBe("/ar/suppliers/%D8%A7%D9%84%D8%A7");
  });

  it("does not double-encode an already encoded slug", () => {
    expect(searchHref("brand", "best%20way", "en")).toBe("/en/brands/best%20way");
  });

  it("has no category detail route, so categories are not linkable", () => {
    // Categories are browsable facets, not detail pages (routes/plan.md).
    // The builder throws rather than emit a link that would 404.
    expect(() => searchHref("category", "building-materials", "en")).toThrow();
  });
});
