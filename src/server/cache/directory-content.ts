import { cacheLife, cacheTag } from "next/cache";
import {
  listPublicClients,
  listPublicSuppliers,
  publicSupplierDetail,
  type PublicClientSummary,
  type PublicSupplierDetail,
  type PublicSupplierSummary,
} from "@/server/services/directory";
import type { AppLocale } from "@/i18n/routing";

/**
 * Cached public directory loaders (T085/T086, US8 page data path).
 *
 * Mirrors the catalog cache layer: the domain services in
 * `server/services/directory.ts` stay pure and directly testable, while this
 * thin wrapper adds the Cache Components data-level cache. Directory reads are
 * disclosure-gated published snapshots, so entries use the `max` lifetime
 * paired with tags the US6 publish pipeline (T071) and the US7 entity edits
 * invalidate via revalidateTag:
 *
 *   - `suppliers:{locale}`         — supplier directory + any supplier card
 *   - `supplier:{locale}:{slug}`   — a single supplier detail page
 *   - `clients:{locale}`           — the public client references
 */

export async function loadSuppliers(
  locale: AppLocale,
): Promise<PublicSupplierSummary[]> {
  "use cache";
  cacheLife("max");
  cacheTag(`suppliers:${locale}`);
  return listPublicSuppliers(locale);
}

export async function loadSupplierDetail(
  locale: AppLocale,
  slug: string,
): Promise<PublicSupplierDetail | null> {
  "use cache";
  cacheLife("max");
  cacheTag(`supplier:${locale}:${slug}`, `suppliers:${locale}`);
  return publicSupplierDetail(locale, slug);
}

export async function loadClients(locale: AppLocale): Promise<PublicClientSummary[]> {
  "use cache";
  cacheLife("max");
  cacheTag(`clients:${locale}`);
  return listPublicClients(locale);
}
