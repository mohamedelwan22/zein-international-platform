import { cacheLife, cacheTag } from "next/cache";
import { listPublicLocations, type PublicLocation } from "@/server/services/locations";
import type { AppLocale } from "@/i18n/routing";

/**
 * Cached public geographic-presence loaders (US8 page data path).
 *
 * Mirrors the other public cache layers: the domain service stays pure and
 * directly testable, while this wrapper adds the Cache Components data-level
 * cache. A location changes only when staff verify/publish it, so entries use
 * the `max` lifetime paired with the `locations:{locale}` tag that the admin
 * location edits invalidate (see `server/services/admin.ts`).
 */

export async function loadVerifiedLocations(
  locale: AppLocale,
): Promise<PublicLocation[]> {
  "use cache";
  cacheLife("max");
  cacheTag(`locations:${locale}`);
  return listPublicLocations(locale);
}
