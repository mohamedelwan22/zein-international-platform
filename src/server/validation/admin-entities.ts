import { z } from "zod";
import {
  GOOGLE_MAPS_EMBED_MAX_LENGTH,
  normalizeGoogleMapsEmbedUrl,
} from "@/lib/google-maps-embed";

/**
 * Catalog/directory entity validation (US7, T075, admin-api.md §3,
 * data-model.md §2.2–§2.7).
 *
 * One governed registry for the six admin-managed entities: brands, products,
 * categories, suppliers, clients, locations. Every column the services may
 * write is declared here with a length cap; unknown keys are rejected
 * (`strictObject`) so nothing the schema does not model can reach the database
 * (Constitution IV — no free-form payloads). Field caps are defensive bounds,
 * not content decisions.
 *
 * Both locales are required for the core name/slug pair of every searchable
 * entity; optional localized copy hides (null) when neither locale carries a
 * value. Issue `message`s are keys into the `validation` message namespace
 * (FR-003), never user-facing strings.
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const requiredText = (max = 200) =>
  z.string({ error: "required" }).trim().min(1, { error: "required" }).max(max, { error: "maxLength" });

const optionalText = (max = 5000) =>
  z
    .string()
    .trim()
    .max(max, { error: "maxLength" })
    .nullish()
    .transform((value) => (value && value.length > 0 ? value : null));

/**
 * Slugs are URL segments: letters/digits (Latin or Arabic — mixed-script rule)
 * joined by single hyphens, no whitespace. Per-(kind, locale) uniqueness is a
 * database constraint surfaced as `409 SLUG_CONFLICT` (FR-036).
 */
const slugText = z
  .string({ error: "required" })
  .trim()
  .min(1, { error: "required" })
  .max(200, { error: "maxLength" })
  .regex(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u, { error: "invalidSlug" });

const optionalUrl = z
  .string()
  .trim()
  .max(1000, { error: "maxLength" })
  .url({ error: "invalidUrl" })
  .nullish()
  .transform((value) => (value && value.length > 0 ? value : null));

const optionalEmail = z
  .string()
  .trim()
  .max(320, { error: "maxLength" })
  .email({ error: "invalidEmail" })
  .nullish()
  .transform((value) => (value && value.length > 0 ? value : null));

const optionalMapEmbedUrl = z
  .string()
  .trim()
  .max(GOOGLE_MAPS_EMBED_MAX_LENGTH, { error: "maxLength" })
  .nullish()
  .superRefine((value, ctx) => {
    if (value && value.length > 0 && normalizeGoogleMapsEmbedUrl(value) === null) {
      ctx.addIssue({ code: "custom", message: "invalidMapEmbedUrl" });
    }
  })
  .transform((value) => (value && value.length > 0 ? normalizeGoogleMapsEmbedUrl(value) : null));

const optionalUuid = z
  .string()
  .uuid({ error: "invalidType" })
  .nullish()
  .transform((value) => value ?? null);

const optionalSortOrder = z.coerce
  .number()
  .int({ error: "invalidType" })
  .min(0, { error: "invalidType" })
  .max(100_000, { error: "invalidType" })
  .optional();

const countryCode = z
  .string({ error: "required" })
  .trim()
  .length(2, { error: "invalidType" })
  .toUpperCase();

const socialLinks = z
  .array(
    z.strictObject({
      platform: requiredText(100),
      url: z.string({ error: "required" }).trim().min(1, { error: "required" }).max(1000, { error: "maxLength" }),
    }),
  )
  .max(20, { error: "maxLength" })
  .nullish()
  .transform((value) => (value && value.length > 0 ? value : null));

const specifications = z
  .record(z.string().max(100, { error: "maxLength" }), z.string().max(2000, { error: "maxLength" }))
  .nullish()
  .transform((value) => (value && Object.keys(value).length > 0 ? value : null));

const categoryIdList = z
  .array(z.string().uuid({ error: "invalidType" }))
  .min(1, { error: "required" });

const imageIdList = z
  .array(z.string().uuid({ error: "invalidType" }))
  .max(10, { error: "maxLength" });

const versionField = z.coerce.number().int({ error: "invalidType" }).nonnegative({ error: "invalidType" });

// ---------------------------------------------------------------------------
// Quality: categories (kind, depth ≤ 2, bilingual, sortOrder)
// ---------------------------------------------------------------------------

export const CATEGORY_KINDS = ["brand", "product", "supplier"] as const;
export type CategoryKindValue = (typeof CATEGORY_KINDS)[number];

export const categoryCreateSchema = z.strictObject({
  kind: z.enum(CATEGORY_KINDS, { error: "invalidType" }),
  parentId: optionalUuid,
  nameEn: requiredText(),
  nameAr: requiredText(),
  slugEn: slugText,
  slugAr: slugText,
  descriptionEn: optionalText(),
  descriptionAr: optionalText(),
  sourceDoc: optionalText(300),
  isActive: z.boolean({ error: "invalidType" }).optional(),
  sortOrder: optionalSortOrder,
});

export const categoryUpdateSchema = categoryCreateSchema
  .partial()
  .extend({ version: versionField });

export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;

// ---------------------------------------------------------------------------
// Catalog: brands
// ---------------------------------------------------------------------------

const brandFields = {
  nameEn: requiredText(),
  nameAr: requiredText(),
  slugEn: slugText,
  slugAr: slugText,
  summaryEn: optionalText(1000),
  summaryAr: optionalText(1000),
  originCountryEn: optionalText(),
  originCountryAr: optionalText(),
  historyEn: optionalText(10_000),
  historyAr: optionalText(10_000),
  distributionEn: optionalText(10_000),
  distributionAr: optionalText(10_000),
  website: optionalUrl,
  socialLinks: socialLinks.optional(),
  featured: z.boolean({ error: "invalidType" }).optional(),
  logoMediaId: optionalUuid,
  coverMediaId: optionalUuid,
  isActive: z.boolean({ error: "invalidType" }).optional(),
  sortOrder: optionalSortOrder,
};

export const brandCreateSchema = z.strictObject({
  ...brandFields,
  categoryIds: categoryIdList,
});

export const brandUpdateSchema = z.strictObject({
  ...brandFields,
  categoryIds: categoryIdList.optional(),
  version: versionField,
});

// ---------------------------------------------------------------------------
// Catalog: products
// ---------------------------------------------------------------------------

const productFields = {
  brandId: z.string({ error: "required" }).uuid({ error: "invalidType" }),
  supplierId: optionalUuid,
  nameEn: requiredText(),
  nameAr: requiredText(),
  slugEn: slugText,
  slugAr: slugText,
  summaryEn: optionalText(1000),
  summaryAr: optionalText(1000),
  descriptionEn: optionalText(20_000),
  descriptionAr: optionalText(20_000),
  specificationsEn: specifications.optional(),
  specificationsAr: specifications.optional(),
  sku: optionalText(100),
  reference: optionalText(100),
  countryOfOriginEn: optionalText(),
  countryOfOriginAr: optionalText(),
  brochureMediaId: optionalUuid,
  isActive: z.boolean({ error: "invalidType" }).optional(),
  sortOrder: optionalSortOrder,
};

export const productCreateSchema = z.strictObject({
  ...productFields,
  categoryIds: categoryIdList,
  imageIds: imageIdList.optional(),
});

export const productUpdateSchema = z.strictObject({
  ...productFields,
  categoryIds: categoryIdList.optional(),
  imageIds: imageIdList.optional(),
  version: versionField,
});

// ---------------------------------------------------------------------------
// Catalog: suppliers
// ---------------------------------------------------------------------------

const supplierFields = {
  nameEn: requiredText(),
  nameAr: requiredText(),
  slugEn: slugText,
  slugAr: slugText,
  summaryEn: optionalText(1000),
  summaryAr: optionalText(1000),
  descriptionEn: optionalText(20_000),
  descriptionAr: optionalText(20_000),
  originCountryEn: optionalText(),
  originCountryAr: optionalText(),
  historyEn: optionalText(10_000),
  historyAr: optionalText(10_000),
  website: optionalUrl,
  phone: optionalText(50),
  email: optionalEmail,
  logoMediaId: optionalUuid,
  coverMediaId: optionalUuid,
  disclosureApproved: z.boolean({ error: "invalidType" }).optional(),
  isActive: z.boolean({ error: "invalidType" }).optional(),
  sortOrder: optionalSortOrder,
};

export const supplierCreateSchema = z.strictObject({
  ...supplierFields,
  categoryIds: categoryIdList,
});

export const supplierUpdateSchema = z.strictObject({
  ...supplierFields,
  categoryIds: categoryIdList.optional(),
  version: versionField,
});

// ---------------------------------------------------------------------------
// Directory: clients (confidential — disclosureApproved defaults false)
// ---------------------------------------------------------------------------

const clientFields = {
  nameEn: requiredText(),
  nameAr: requiredText(),
  logoMediaId: optionalUuid,
  industryEn: optionalText(),
  industryAr: optionalText(),
  locationEn: optionalText(),
  locationAr: optionalText(),
  website: optionalUrl,
  descriptionEn: optionalText(10_000),
  descriptionAr: optionalText(10_000),
  disclosureApproved: z.boolean({ error: "invalidType" }).optional(),
  isActive: z.boolean({ error: "invalidType" }).optional(),
  sortOrder: optionalSortOrder,
};

export const clientCreateSchema = z.strictObject(clientFields);

export const clientUpdateSchema = z.strictObject({
  ...clientFields,
  version: versionField,
});

// ---------------------------------------------------------------------------
// Directory: locations (nullable coordinates — never invented, FR-013)
// ---------------------------------------------------------------------------

const latitude = z.coerce
  .number()
  .min(-90, { error: "invalidType" })
  .max(90, { error: "invalidType" })
  .nullish()
  .transform((value) => value ?? null);

const longitude = z.coerce
  .number()
  .min(-180, { error: "invalidType" })
  .max(180, { error: "invalidType" })
  .nullish()
  .transform((value) => value ?? null);

const locationFields = {
  cityEn: requiredText(200),
  cityAr: requiredText(200),
  addressEn: requiredText(500),
  addressAr: requiredText(500),
  region: optionalText(200),
  countryCode: countryCode.optional(),
  latitude,
  longitude,
  isVerified: z.boolean({ error: "invalidType" }).optional(),
  locationType: optionalText(100),
  coverageEn: optionalText(2000),
  coverageAr: optionalText(2000),
  phone: optionalText(50),
  email: optionalEmail,
  mapUrl: optionalUrl,
  mapEmbedUrl: optionalMapEmbedUrl,
  imageMediaId: optionalUuid,
  isActive: z.boolean({ error: "invalidType" }).optional(),
  sortOrder: optionalSortOrder,
};

export const locationCreateSchema = z.strictObject(locationFields);

export const locationUpdateSchema = z.strictObject({
  ...locationFields,
  version: versionField,
});

// ---------------------------------------------------------------------------
// List query (admin-api.md §3: `?page&pageSize&status&q`)
// ---------------------------------------------------------------------------

export const PUBLISH_STATUSES = ["draft", "published", "archived"] as const;

export const adminListQuerySchema = z.object({
  status: z.enum(PUBLISH_STATUSES, { error: "invalidType" }).optional(),
  q: z.string().trim().max(200, { error: "maxLength" }).optional(),
  page: z.coerce.number().int().min(1, { error: "invalidType" }).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1, { error: "invalidType" })
    .max(100, { error: "invalidType" })
    .default(20),
});

export type AdminListQuery = z.infer<typeof adminListQuerySchema>;
