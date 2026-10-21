import type { MetadataRoute } from "next";
import { loadPublicSitemap } from "@/server/cache/seo-content";

/**
 * Public sitemap (US10, T103): localized static pages plus every published,
 * active brand/product/supplier, with hreflang alternates. `loadPublicSitemap`
 * runs behind `use cache` + the `seo:sitemap` tag so admin SEO edits and slug
 * changes refresh it.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return loadPublicSitemap();
}
