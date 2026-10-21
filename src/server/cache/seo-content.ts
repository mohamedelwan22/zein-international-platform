import { cacheLife, cacheTag } from "next/cache";
import { env } from "@/lib/env";
import {
  buildPublicSitemap,
  loadEntitySeo,
  loadPageSeo,
} from "@/server/services/seo";
import type { SeoPageKey } from "@/lib/seo-pages";
import type { SeoOverride } from "@/lib/seo";
import type { AppLocale } from "@/i18n/routing";
import type { EntityType } from "@/generated/prisma/client";

/**
 * Cached public SEO loaders (US10, T103).
 *
 * `generateMetadata`, page bodies and the sitemap read external data, so under
 * Cache Components they must run behind `use cache`. Staff SEO edits
 * invalidate the matching tag from the admin API; the shared `seo:sitemap`
 * tag refreshes the sitemap for any metadata/slug change.
 */

export async function loadPageSeoOverride(
  pageKey: SeoPageKey,
  locale: AppLocale,
): Promise<SeoOverride | null> {
  "use cache";
  cacheLife("max");
  cacheTag(`seo:page:${pageKey}:${locale}`, "seo:sitemap");
  return loadPageSeo(pageKey, locale);
}

export async function loadEntitySeoOverride(
  targetType: EntityType,
  targetId: string,
  locale: AppLocale,
): Promise<SeoOverride | null> {
  "use cache";
  cacheLife("max");
  cacheTag(`seo:${targetType}:${targetId}:${locale}`, "seo:sitemap");
  return loadEntitySeo(targetType, targetId, locale);
}

export async function loadPublicSitemap() {
  "use cache";
  cacheLife("max");
  cacheTag("seo:sitemap");
  return buildPublicSitemap(env.NEXT_PUBLIC_SITE_URL);
}
