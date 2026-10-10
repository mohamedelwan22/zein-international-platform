import { cacheLife, cacheTag } from "next/cache";
import {
  getAboutExperience,
  getContactInfo,
  getHomeExperience,
  type AboutExperience,
  type ContactInfo,
  type HomeExperience,
} from "@/server/services/content";
import type { AppLocale } from "@/i18n/routing";

/**
 * Cached public-content loaders (T034–T037 page data path).
 *
 * The domain services stay pure and directly testable; this thin layer adds
 * the Cache Components data-level cache. Content changes only when staff
 * publish, so entries use the `max` lifetime paired with cache tags that
 * US6's publish pipeline (T071) invalidates via revalidateTag:
 *
 *   - `cms:home:{locale}` / `cms:about:{locale}` — CMS section publishes
 *   - `settings:contact_info:{locale}` — Settings updates (FR-014)
 *   - `categories:{locale}` — category changes (FR-027 dynamic categories)
 *
 * The active locale is an explicit argument, so it participates in the
 * cache key (per-locale entries, FR-004).
 */

export async function loadHomeExperience(locale: AppLocale): Promise<HomeExperience> {
  "use cache";
  cacheLife("max");
  cacheTag(`cms:home:${locale}`, `categories:${locale}`);
  return getHomeExperience(locale);
}

export async function loadAboutExperience(locale: AppLocale): Promise<AboutExperience> {
  "use cache";
  cacheLife("max");
  cacheTag(`cms:about:${locale}`);
  return getAboutExperience(locale);
}

export async function loadContactInfo(locale: AppLocale): Promise<ContactInfo | null> {
  "use cache";
  cacheLife("max");
  cacheTag(`settings:contact_info:${locale}`);
  return getContactInfo(locale);
}

/**
 * Cached current year for copyright lines — reading the clock inside a
 * prerendered shell is a current-time violation under Cache Components;
 * a cached value with a daily refresh keeps shells valid and the year
 * correct without dynamic rendering.
 */
export async function loadCurrentYear(): Promise<number> {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}
