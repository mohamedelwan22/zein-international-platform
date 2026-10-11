import { cacheLife, cacheTag } from "next/cache";
import {
  brandDetail,
  listPublishedBrands,
  listPublishedProducts,
  productDetail,
  type BrandDetail,
  type CatalogFilters,
  type ProductDetail,
  type PublishedBrandSummary,
  type PublishedProductSummary,
} from "@/server/services/catalog";
import { listPublishedCategories } from "@/server/services/categories";
import type { PublishedCategoryPreview } from "@/server/services/categories";
import type { AppLocale } from "@/i18n/routing";

/**
 * Cached public catalog loaders (T042/T043, US2 page data path).
 *
 * Mirrors the public-content cache layer: the domain services in
 * `server/services/catalog.ts` stay pure and directly testable, while this
 * thin wrapper adds the Cache Components data-level cache. Catalog reads are
 * published-only snapshots that change when staff publish, so entries use the
 * `max` lifetime paired with tags that the US6 publish pipeline (T071) and the
 * US7 entity edits invalidate via revalidateTag:
 *
 *   - `brands:{locale}`       — brand directory + any brand card
 *   - `brand:{locale}:{slug}` — a single brand detail page
 *   - `products:{locale}`     — product directory (any filter combination) +
 *                               any product card
 *   - `product:{locale}:{slug}` — a single product detail page
 *   - `categories:{locale}`   — the published product-category filter options
 */

export async function loadBrands(locale: AppLocale): Promise<PublishedBrandSummary[]> {
  "use cache";
  cacheLife("max");
  cacheTag(`brands:${locale}`);
  return listPublishedBrands(locale);
}

export async function loadBrandDetail(
  locale: AppLocale,
  slug: string,
): Promise<BrandDetail | null> {
  "use cache";
  cacheLife("max");
  cacheTag(`brand:${locale}:${slug}`, `brands:${locale}`);
  return brandDetail(locale, slug);
}

/**
 * Product directory for one filter combination (FR-009). Filters are part of
 * the cache key, so each brand/category/country combination is its own cached
 * entry — an empty filter object is the full published catalog.
 */
export async function loadProducts(
  locale: AppLocale,
  filters: CatalogFilters = {},
): Promise<PublishedProductSummary[]> {
  "use cache";
  cacheLife("max");
  cacheTag(`products:${locale}`);
  return listPublishedProducts(locale, filters);
}

export async function loadProductDetail(
  locale: AppLocale,
  slug: string,
): Promise<ProductDetail | null> {
  "use cache";
  cacheLife("max");
  cacheTag(`product:${locale}:${slug}`, `products:${locale}`);
  return productDetail(locale, slug);
}

/** Published product categories (T044) as the FR-009 category filter options. */
export async function loadCategories(
  locale: AppLocale,
): Promise<PublishedCategoryPreview[]> {
  "use cache";
  cacheLife("max");
  cacheTag(`categories:${locale}`);
  return listPublishedCategories(locale, { kind: "product" });
}
