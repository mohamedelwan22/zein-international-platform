/**
 * Public SEO page registry (T103, US10, FR-043).
 *
 * Static public routes have no entity row to hang a `SeoMeta` record on, so
 * they are addressed by a stable `pageKey`. The same registry drives the
 * admin SEO module, the public metadata lookup, and the sitemap, keeping the
 * three in lockstep. Paths omit the locale prefix (next-intl adds it).
 */

export const SEO_PAGE_KEYS = [
  "home",
  "about",
  "brands",
  "products",
  "suppliers",
  "clients",
  "contact",
  "geographic-presence",
  "innovation",
  "partnership",
  "sustainability",
  "values",
] as const;

export type SeoPageKey = (typeof SEO_PAGE_KEYS)[number];

export const SEO_PAGE_PATHS: Record<SeoPageKey, string> = {
  home: "/",
  about: "/about",
  brands: "/brands",
  products: "/products",
  suppliers: "/suppliers",
  clients: "/clients",
  contact: "/contact",
  "geographic-presence": "/geographic-presence",
  innovation: "/innovation",
  partnership: "/partnership",
  sustainability: "/sustainability",
  values: "/values",
};

export function isSeoPageKey(value: string): value is SeoPageKey {
  return (SEO_PAGE_KEYS as readonly string[]).includes(value);
}
