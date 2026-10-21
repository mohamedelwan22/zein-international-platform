import { z } from "zod";

/**
 * SEO metadata validation (US10, T104, admin-api.md §7, data-model §2.10).
 *
 * Staff overrides are deliberately bounded: titles and descriptions fit the
 * crawler guidance used by `lib/seo.ts` (60/160 characters) and the optional
 * canonical URL is either absolute or site-relative. Slugs reuse the catalog
 * rule (letters/digits joined by single hyphens), so a slug edited through the
 * SEO module obeys the same contract as US7 entity edits (FR-036).
 */

export const SEO_LOCALES = ["en", "ar"] as const;
export type SeoLocale = (typeof SEO_LOCALES)[number];

/** Entity namespaces that own a public detail page (and therefore a slug). */
export const SEO_ENTITY_TYPES = [
  "brand",
  "product",
  "supplier",
  "category",
  "client",
  "location",
] as const;

/** Entity namespaces addressed by a public slug route. */
export const SEO_SLUG_ENTITY_TYPES = ["brand", "product", "supplier", "category"] as const;
export type SeoSlugEntityType = (typeof SEO_SLUG_ENTITY_TYPES)[number];

const optionalTitle = z
  .string()
  .trim()
  .max(60, { error: "maxLength" })
  .nullish()
  .transform((value) => (value && value.length > 0 ? value : null));

const optionalDescription = z
  .string()
  .trim()
  .max(160, { error: "maxLength" })
  .nullish()
  .transform((value) => (value && value.length > 0 ? value : null));

const optionalCanonical = z
  .string()
  .trim()
  .max(1000, { error: "maxLength" })
  .refine(
    (value) => value.length === 0 || value.startsWith("/") || /^https?:\/\//i.test(value),
    { error: "invalidUrl" },
  )
  .nullish()
  .transform((value) => (value && value.length > 0 ? value : null));

const optionalMediaId = z
  .string()
  .uuid({ error: "invalidType" })
  .nullish()
  .transform((value) => value ?? null);

const optionalSlug = z
  .string()
  .trim()
  .max(200, { error: "maxLength" })
  .regex(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u, { error: "invalidSlug" })
  .nullish()
  .transform((value) => (value && value.length > 0 ? value : null));

/**
 * `PUT /api/admin/seo/{targetKey}/{locale}` body. A full replacement: omitted
 * text/image fields clear the stored override and fall back to the localized
 * default (US10.2). `version` is the optimistic lock; `slug` is only accepted
 * for slug-bearing entity targets.
 */
export const seoUpdateSchema = z.strictObject({
  metaTitle: optionalTitle,
  metaDescription: optionalDescription,
  canonicalUrl: optionalCanonical,
  ogImageMediaId: optionalMediaId,
  noindex: z.boolean({ error: "invalidType" }).optional(),
  slug: optionalSlug,
  version: z.coerce.number().int({ error: "invalidType" }).nonnegative({ error: "invalidType" }).optional(),
});

export type SeoUpdateInput = z.infer<typeof seoUpdateSchema>;

/** `POST /api/admin/seo/redirects` body (data-model §2.11). */
export const slugRedirectCreateSchema = z.strictObject({
  entityType: z.enum(SEO_SLUG_ENTITY_TYPES, { error: "invalidType" }),
  locale: z.enum(SEO_LOCALES, { error: "invalidType" }),
  oldSlug: z
    .string({ error: "required" })
    .trim()
    .min(1, { error: "required" })
    .max(200, { error: "maxLength" }),
  newSlug: z
    .string({ error: "required" })
    .trim()
    .min(1, { error: "required" })
    .max(200, { error: "maxLength" })
    .regex(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u, { error: "invalidSlug" }),
});

export type SlugRedirectCreateInput = z.infer<typeof slugRedirectCreateSchema>;
