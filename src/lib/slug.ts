/**
 * Dynamic route path-param decoding (BUG-001).
 *
 * Next.js decodes percent-encoded dynamic-segment values for route handlers
 * and for prerendered (SSG) pages, but NOT for dynamically rendered pages —
 * see `next/dist/server/lib/router-utils/decode-path-params.js`, whose comment
 * still reads "TODO: investigate adding this handling for non-SSG pages so
 * non-ascii names also work there." The public product/brand detail pages are
 * runtime-rendered, so a localized Arabic slug arrives as `%D9%84…` and never
 * matches the stored slug, producing a 404 for the exact URL the directory
 * links to.
 *
 * Valid slugs (see `slugText` in server/validation/admin-entities.ts) contain
 * only letters, digits, and single hyphens — never `%` — so it is safe to treat
 * any `%` as an encoded escape and decode once. The guard also makes the call
 * idempotent (already-decoded values are returned unchanged) and tolerates
 * malformed input by returning it as-is.
 */
export function decodeSlugParam(value: string): string {
  if (!value.includes("%")) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
