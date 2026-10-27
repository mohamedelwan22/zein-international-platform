import { GOOGLE_MAPS_EMBED_MAX_LENGTH } from "@/lib/google-maps-embed";
import type { AdminResource } from "@/server/services/admin";

/**
 * Reusable admin entity field configuration (US7, T082).
 *
 * One declarative registry drives the generic `EntityManager`: which fields
 * each resource exposes, which are bilingual (En/Ar pairs), and which columns
 * the list table shows. The server still validates every payload against the
 * authoritative Zod schemas (`validation/admin-entities.ts`); this file only
 * tells the UI how to render and collect the same fields, so the two cannot
 * drift into free-form input.
 *
 * `AdminResource` is imported as a type only — the server service module is
 * never pulled into the client bundle.
 */

export type FieldKind =
  | "text"
  | "textarea"
  | "url"
  | "email"
  | "number"
  | "boolean"
  | "select"
  | "media"
  | "categories"
  | "images"
  | "socialLinks"
  | "specifications"
  | "brandRef"
  | "supplierRef"
  | "parentCategory";

export interface FieldDef {
  /** Base field name; bilingual fields expand to `{name}En` / `{name}Ar`. */
  name: string;
  /** Translation key in the `admin` namespace. */
  labelKey: string;
  /**
   * Optional secondary translation key (also in `admin`) rendered under the
   * control. Used where the field is a hard prerequisite for a separate
   * lifecycle step — e.g. `disclosureApproved` gates public listing for
   * suppliers/clients independently of Publish (data-model §2.5/§2.6).
   */
  hintKey?: string;
  kind: FieldKind;
  localized?: boolean;
  required?: boolean;
  /** Numeric fields: an empty input becomes `null` instead of being omitted. */
  nullable?: boolean;
  /** Initial value for this field on create; booleans default to `false`. */
  default?: boolean;
  /** Static options for `select`. */
  options?: readonly string[];
  max?: number;
}

export type ColumnKind = "localized" | "text" | "status" | "active" | "boolean";

export interface ColumnDef {
  key: string;
  labelKey: string;
  kind: ColumnKind;
}

export interface EntityMeta {
  resource: AdminResource;
  /** Category kind used to filter assignable categories (when applicable). */
  categoryKind: "brand" | "product" | "supplier" | null;
  hasSlug: boolean;
  hasImages: boolean;
  fields: readonly FieldDef[];
  columns: readonly ColumnDef[];
}

export const ENTITY_META: Record<AdminResource, EntityMeta> = {
  brands: {
    resource: "brands",
    categoryKind: "brand",
    hasSlug: true,
    hasImages: false,
    columns: [
      { key: "name", labelKey: "fieldName", kind: "localized" },
      { key: "status", labelKey: "entityTableStatus", kind: "status" },
      { key: "isActive", labelKey: "entityTableActive", kind: "active" },
    ],
    fields: [
      { name: "name", labelKey: "fieldName", kind: "text", localized: true, required: true, max: 200 },
      { name: "slug", labelKey: "fieldSlug", kind: "text", localized: true, required: true, max: 200 },
      { name: "summary", labelKey: "fieldSummary", kind: "textarea", localized: true, max: 1000 },
      { name: "originCountry", labelKey: "fieldOriginCountry", kind: "text", localized: true },
      { name: "history", labelKey: "fieldHistory", kind: "textarea", localized: true },
      { name: "distribution", labelKey: "fieldDistribution", kind: "textarea", localized: true },
      { name: "website", labelKey: "fieldWebsite", kind: "url" },
      { name: "socialLinks", labelKey: "fieldSocialLinks", kind: "socialLinks" },
      { name: "logoMediaId", labelKey: "fieldLogo", kind: "media" },
      { name: "coverMediaId", labelKey: "fieldCover", kind: "media" },
      { name: "categoryIds", labelKey: "fieldCategories", kind: "categories", required: true },
      { name: "featured", labelKey: "fieldFeatured", kind: "boolean" },
      { name: "isActive", labelKey: "fieldActive", kind: "boolean", default: true },
      { name: "sortOrder", labelKey: "fieldSortOrder", kind: "number" },
    ],
  },
  products: {
    resource: "products",
    categoryKind: "product",
    hasSlug: true,
    hasImages: true,
    columns: [
      { key: "name", labelKey: "fieldName", kind: "localized" },
      { key: "status", labelKey: "entityTableStatus", kind: "status" },
      { key: "isActive", labelKey: "entityTableActive", kind: "active" },
    ],
    fields: [
      { name: "name", labelKey: "fieldName", kind: "text", localized: true, required: true, max: 200 },
      { name: "slug", labelKey: "fieldSlug", kind: "text", localized: true, required: true, max: 200 },
      { name: "brandId", labelKey: "fieldBrand", kind: "brandRef", required: true },
      { name: "supplierId", labelKey: "fieldSupplier", kind: "supplierRef" },
      { name: "summary", labelKey: "fieldSummary", kind: "textarea", localized: true, max: 1000 },
      { name: "description", labelKey: "fieldDescription", kind: "textarea", localized: true },
      { name: "specifications", labelKey: "fieldSpecifications", kind: "specifications", localized: true },
      { name: "sku", labelKey: "fieldSku", kind: "text", max: 100 },
      { name: "reference", labelKey: "fieldReference", kind: "text", max: 100 },
      { name: "countryOfOrigin", labelKey: "fieldCountryOfOrigin", kind: "text", localized: true },
      { name: "brochureMediaId", labelKey: "fieldBrochure", kind: "media" },
      { name: "categoryIds", labelKey: "fieldCategories", kind: "categories", required: true },
      { name: "imageIds", labelKey: "fieldImages", kind: "images" },
      { name: "isActive", labelKey: "fieldActive", kind: "boolean", default: true },
      { name: "sortOrder", labelKey: "fieldSortOrder", kind: "number" },
    ],
  },
  categories: {
    resource: "categories",
    categoryKind: null,
    hasSlug: true,
    hasImages: false,
    columns: [
      { key: "name", labelKey: "fieldName", kind: "localized" },
      { key: "kind", labelKey: "fieldKind", kind: "text" },
      { key: "status", labelKey: "entityTableStatus", kind: "status" },
      { key: "isActive", labelKey: "entityTableActive", kind: "active" },
    ],
    fields: [
      { name: "kind", labelKey: "fieldKind", kind: "select", required: true, options: ["brand", "product", "supplier"] },
      { name: "parentId", labelKey: "fieldParent", kind: "parentCategory" },
      { name: "name", labelKey: "fieldName", kind: "text", localized: true, required: true, max: 200 },
      { name: "slug", labelKey: "fieldSlug", kind: "text", localized: true, required: true, max: 200 },
      { name: "description", labelKey: "fieldDescription", kind: "textarea", localized: true },
      { name: "sourceDoc", labelKey: "fieldSourceDoc", kind: "text", max: 300 },
      { name: "isActive", labelKey: "fieldActive", kind: "boolean", default: true },
      { name: "sortOrder", labelKey: "fieldSortOrder", kind: "number" },
    ],
  },
  suppliers: {
    resource: "suppliers",
    categoryKind: "supplier",
    hasSlug: true,
    hasImages: false,
    columns: [
      { key: "name", labelKey: "fieldName", kind: "localized" },
      { key: "disclosureApproved", labelKey: "fieldDisclosure", kind: "boolean" },
      { key: "status", labelKey: "entityTableStatus", kind: "status" },
      { key: "isActive", labelKey: "entityTableActive", kind: "active" },
    ],
    fields: [
      { name: "name", labelKey: "fieldName", kind: "text", localized: true, required: true, max: 200 },
      { name: "slug", labelKey: "fieldSlug", kind: "text", localized: true, required: true, max: 200 },
      { name: "summary", labelKey: "fieldSummary", kind: "textarea", localized: true, max: 1000 },
      { name: "description", labelKey: "fieldDescription", kind: "textarea", localized: true },
      { name: "originCountry", labelKey: "fieldOriginCountry", kind: "text", localized: true },
      { name: "history", labelKey: "fieldHistory", kind: "textarea", localized: true },
      { name: "website", labelKey: "fieldWebsite", kind: "url" },
      { name: "phone", labelKey: "fieldPhone", kind: "text", max: 50 },
      { name: "email", labelKey: "fieldEmail", kind: "email" },
      { name: "logoMediaId", labelKey: "fieldLogo", kind: "media" },
      { name: "coverMediaId", labelKey: "fieldCover", kind: "media" },
      { name: "categoryIds", labelKey: "fieldCategories", kind: "categories", required: true },
      { name: "disclosureApproved", labelKey: "fieldDisclosure", hintKey: "fieldDisclosureHint", kind: "boolean" },
      { name: "isActive", labelKey: "fieldActive", kind: "boolean", default: true },
      { name: "sortOrder", labelKey: "fieldSortOrder", kind: "number" },
    ],
  },
  clients: {
    resource: "clients",
    categoryKind: null,
    hasSlug: false,
    hasImages: false,
    columns: [
      { key: "name", labelKey: "fieldName", kind: "localized" },
      { key: "industry", labelKey: "fieldIndustry", kind: "localized" },
      { key: "disclosureApproved", labelKey: "fieldDisclosure", kind: "boolean" },
      { key: "status", labelKey: "entityTableStatus", kind: "status" },
      { key: "isActive", labelKey: "entityTableActive", kind: "active" },
    ],
    fields: [
      { name: "name", labelKey: "fieldName", kind: "text", localized: true, required: true, max: 200 },
      { name: "industry", labelKey: "fieldIndustry", kind: "text", localized: true },
      { name: "location", labelKey: "fieldLocation", kind: "text", localized: true },
      { name: "description", labelKey: "fieldDescription", kind: "textarea", localized: true },
      { name: "website", labelKey: "fieldWebsite", kind: "url" },
      { name: "logoMediaId", labelKey: "fieldLogo", kind: "media" },
      { name: "disclosureApproved", labelKey: "fieldDisclosure", hintKey: "fieldDisclosureHint", kind: "boolean" },
      { name: "isActive", labelKey: "fieldActive", kind: "boolean", default: true },
      { name: "sortOrder", labelKey: "fieldSortOrder", kind: "number" },
    ],
  },
  locations: {
    resource: "locations",
    categoryKind: null,
    hasSlug: false,
    hasImages: false,
    columns: [
      { key: "city", labelKey: "fieldCity", kind: "localized" },
      { key: "countryCode", labelKey: "fieldCountryCode", kind: "text" },
      { key: "isVerified", labelKey: "fieldVerified", kind: "boolean" },
      { key: "status", labelKey: "entityTableStatus", kind: "status" },
      { key: "isActive", labelKey: "entityTableActive", kind: "active" },
    ],
    fields: [
      { name: "city", labelKey: "fieldCity", kind: "text", localized: true, required: true, max: 200 },
      { name: "address", labelKey: "fieldAddress", kind: "text", localized: true, required: true, max: 500 },
      { name: "region", labelKey: "fieldRegion", kind: "text", max: 200 },
      { name: "countryCode", labelKey: "fieldCountryCode", kind: "text", max: 2 },
      { name: "latitude", labelKey: "fieldLatitude", kind: "number", nullable: true },
      { name: "longitude", labelKey: "fieldLongitude", kind: "number", nullable: true },
      { name: "isVerified", labelKey: "fieldVerified", hintKey: "fieldVerifiedHint", kind: "boolean" },
      { name: "locationType", labelKey: "fieldLocationType", kind: "text", max: 100 },
      { name: "coverage", labelKey: "fieldCoverage", kind: "textarea", localized: true },
      { name: "phone", labelKey: "fieldPhone", kind: "text", max: 50 },
      { name: "email", labelKey: "fieldEmail", kind: "email" },
      { name: "mapUrl", labelKey: "fieldMapUrl", kind: "url" },
      {
        name: "mapEmbedUrl",
        labelKey: "fieldMapEmbedUrl",
        hintKey: "fieldMapEmbedUrlHint",
        kind: "textarea",
        max: GOOGLE_MAPS_EMBED_MAX_LENGTH,
      },
      { name: "imageMediaId", labelKey: "fieldImage", kind: "media" },
      { name: "isActive", labelKey: "fieldActive", kind: "boolean", default: true },
      { name: "sortOrder", labelKey: "fieldSortOrder", kind: "number" },
    ],
  },
};

export function entityMeta(resource: AdminResource): EntityMeta {
  return ENTITY_META[resource];
}
