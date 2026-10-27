import { revalidateTag } from "next/cache";
import { prisma } from "@/server/db/prisma";
import { createLogger } from "@/lib/logger";
import { badRequest, notFound, slugConflict, versionConflict } from "@/server/http/errors";
import { requirePermission } from "@/server/auth/authorize";
import { issueDetails } from "@/server/validation/common";
import {
  adminListQuerySchema,
  brandCreateSchema,
  brandUpdateSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  clientCreateSchema,
  clientUpdateSchema,
  locationCreateSchema,
  locationUpdateSchema,
  productCreateSchema,
  productUpdateSchema,
  supplierCreateSchema,
  supplierUpdateSchema,
  type AdminListQuery,
} from "@/server/validation/admin-entities";
import type { z } from "zod";
import type { EntityType } from "@/generated/prisma/client";
import { recordSlugChange } from "./redirects";

/**
 * Generic admin data-service layer (US7, T075, admin-api.md §3, data-model §3).
 *
 * Six catalog/directory resources share one governed CRUD lifecycle. Each
 * operation:
 *   1. enforces the matching `{resource}:{action}` permission server-side
 *      (`requirePermission` — the DB row, not the JWT claims, is authoritative);
 *   2. validates the payload against the per-resource Zod schema (rejects
 *      unknown keys — no free-form payloads reach the database);
 *   3. runs inside a transaction that also writes exactly one `ActivityLog`
 *      row (SC-012);
 *   4. keeps the publication predicate consistent and invalidates the public
 *      cache tags a publish/visibility/update can change (SC-005).
 *
 * `update` is optimistic-locked on `version` (stale → `409 VERSION_CONFLICT`);
 * duplicate slugs surface as `409 SLUG_CONFLICT` (FR-036); delete is refused
 * while an entity is published or still referenced (admin-api §3).
 */

const logger = createLogger("admin");

export const ADMIN_RESOURCES = [
  "brands",
  "products",
  "categories",
  "suppliers",
  "clients",
  "locations",
] as const;
export type AdminResource = (typeof ADMIN_RESOURCES)[number];

export type EntityStatus = "draft" | "published" | "archived";

interface JunctionConfig {
  /** Explicit join model (e.g. `brandCategory`). */
  model: string;
  /** FK column back to the owner (e.g. `brandId`). */
  foreignKey: string;
}

interface EntityConfig {
  resource: AdminResource;
  /** `ActivityLog.entityType` value. */
  entityType: string;
  /** Prisma delegate name. */
  model: string;
  slug: { en: string; ar: string } | null;
  createSchema: z.ZodTypeAny;
  updateSchema: z.ZodTypeAny;
  listSelect: Record<string, boolean>;
  searchFields: string[];
  listOrderBy: Record<string, "asc" | "desc">[];
  detailInclude: Record<string, unknown>;
  categoryJunction: JunctionConfig | null;
  imageJunction: JunctionConfig | null;
  /** Public Cache-Components tags this entity can affect. */
  publicTags: (row: Record<string, unknown>) => string[];
  /** True while no other record references this row (delete guard). */
  isUnreferenced: (id: string) => Promise<boolean>;
}

type AnyDelegate = {
  findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
  count: (args?: unknown) => Promise<number>;
  findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
  findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
  create: (args: unknown) => Promise<Record<string, unknown>>;
  update: (args: unknown) => Promise<Record<string, unknown>>;
  updateMany: (args: unknown) => Promise<{ count: number }>;
  delete: (args: unknown) => Promise<unknown>;
  createMany: (args: unknown) => Promise<{ count: number }>;
  deleteMany: (args: unknown) => Promise<{ count: number }>;
};

const db = prisma as unknown as Record<string, AnyDelegate>;

const scalarSummary = {
  id: true,
  status: true,
  isActive: true,
  version: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} satisfies Record<string, boolean>;

const localeTags = (prefix: string) => [`${prefix}:en`, `${prefix}:ar`];

const CONFIGS: Record<AdminResource, EntityConfig> = {
  brands: {
    resource: "brands",
    entityType: "brand",
    model: "brand",
    slug: { en: "slugEn", ar: "slugAr" },
    createSchema: brandCreateSchema,
    updateSchema: brandUpdateSchema,
    listSelect: { ...scalarSummary, nameEn: true, nameAr: true, slugEn: true, slugAr: true, featured: true },
    searchFields: ["nameEn", "nameAr", "slugEn", "slugAr"],
    listOrderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    detailInclude: { categories: { select: { categoryId: true } } },
    categoryJunction: { model: "brandCategory", foreignKey: "brandId" },
    imageJunction: null,
    publicTags: (row) => [
      ...localeTags("brands"),
      `brand:en:${row.slugEn}`,
      `brand:ar:${row.slugAr}`,
    ],
    isUnreferenced: async (id) => (await prisma.product.count({ where: { brandId: id } })) === 0,
  },
  products: {
    resource: "products",
    entityType: "product",
    model: "product",
    slug: { en: "slugEn", ar: "slugAr" },
    createSchema: productCreateSchema,
    updateSchema: productUpdateSchema,
    listSelect: {
      ...scalarSummary,
      nameEn: true,
      nameAr: true,
      slugEn: true,
      slugAr: true,
      brandId: true,
      supplierId: true,
      countryOfOriginEn: true,
      countryOfOriginAr: true,
    },
    searchFields: ["nameEn", "nameAr", "slugEn", "slugAr", "sku", "reference"],
    listOrderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    detailInclude: {
      categories: { select: { categoryId: true } },
      images: { select: { mediaId: true, sortOrder: true }, orderBy: { sortOrder: "asc" } },
    },
    categoryJunction: { model: "productCategory", foreignKey: "productId" },
    imageJunction: { model: "productImage", foreignKey: "productId" },
    publicTags: (row) => [
      ...localeTags("products"),
      `product:en:${row.slugEn}`,
      `product:ar:${row.slugAr}`,
    ],
    isUnreferenced: async () => true,
  },
  categories: {
    resource: "categories",
    entityType: "category",
    model: "category",
    slug: { en: "slugEn", ar: "slugAr" },
    createSchema: categoryCreateSchema,
    updateSchema: categoryUpdateSchema,
    listSelect: {
      ...scalarSummary,
      kind: true,
      parentId: true,
      nameEn: true,
      nameAr: true,
      slugEn: true,
      slugAr: true,
    },
    searchFields: ["nameEn", "nameAr", "slugEn", "slugAr"],
    listOrderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    detailInclude: {},
    categoryJunction: null,
    imageJunction: null,
    publicTags: () => localeTags("categories"),
    isUnreferenced: async (id) => {
      const [brands, products, suppliers, children] = await Promise.all([
        prisma.brandCategory.count({ where: { categoryId: id } }),
        prisma.productCategory.count({ where: { categoryId: id } }),
        prisma.supplierCategory.count({ where: { categoryId: id } }),
        prisma.category.count({ where: { parentId: id } }),
      ]);
      return brands + products + suppliers + children === 0;
    },
  },
  suppliers: {
    resource: "suppliers",
    entityType: "supplier",
    model: "supplier",
    slug: { en: "slugEn", ar: "slugAr" },
    createSchema: supplierCreateSchema,
    updateSchema: supplierUpdateSchema,
    listSelect: {
      ...scalarSummary,
      nameEn: true,
      nameAr: true,
      slugEn: true,
      slugAr: true,
      disclosureApproved: true,
    },
    searchFields: ["nameEn", "nameAr", "slugEn", "slugAr"],
    listOrderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    detailInclude: { categories: { select: { categoryId: true } } },
    categoryJunction: { model: "supplierCategory", foreignKey: "supplierId" },
      imageJunction: null,
      publicTags: (row) => [
        ...localeTags("suppliers"),
        `supplier:en:${row.slugEn}`,
        `supplier:ar:${row.slugAr}`,
      ],
      isUnreferenced: async (id) => (await prisma.product.count({ where: { supplierId: id } })) === 0,
    },
    clients: {
    resource: "clients",
    entityType: "client",
    model: "client",
    slug: null,
    createSchema: clientCreateSchema,
    updateSchema: clientUpdateSchema,
    listSelect: {
      ...scalarSummary,
      nameEn: true,
      nameAr: true,
      disclosureApproved: true,
      industryEn: true,
      industryAr: true,
    },
    searchFields: ["nameEn", "nameAr", "industryEn", "industryAr"],
    listOrderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      detailInclude: {},
      categoryJunction: null,
      imageJunction: null,
      publicTags: () => localeTags("clients"),
      isUnreferenced: async () => true,
    },
    locations: {
    resource: "locations",
    entityType: "location",
    model: "location",
    slug: null,
    createSchema: locationCreateSchema,
    updateSchema: locationUpdateSchema,
    listSelect: {
      ...scalarSummary,
      cityEn: true,
      cityAr: true,
      countryCode: true,
      isVerified: true,
    },
    searchFields: ["cityEn", "cityAr", "addressEn", "addressAr"],
    listOrderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    detailInclude: {},
    categoryJunction: null,
    imageJunction: null,
    publicTags: () => localeTags("locations"),
    isUnreferenced: async () => true,
  },
};

export function isAdminResource(value: string): value is AdminResource {
  return (ADMIN_RESOURCES as readonly string[]).includes(value);
}

function configFor(resource: AdminResource): EntityConfig {
  return CONFIGS[resource];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002"
  );
}

/**
 * A P2002 whose target is a slug column is a duplicate slug (FR-036). Category
 * slugs are unique per `(kind, locale)`, brand/product/supplier slugs per
 * locale — inspecting the constraint target lets the DB stay authoritative
 * while still returning `409 SLUG_CONFLICT`.
 */
function isSlugViolation(config: EntityConfig, error: unknown): boolean {
  if (!config.slug || !isUniqueViolation(error)) return false;
  const target = JSON.stringify((error as { meta?: { target?: unknown } }).meta?.target ?? "");
  const message = error instanceof Error ? error.message : "";
  const haystack = `${target} ${message}`;
  return haystack.includes(config.slug.en) || haystack.includes(config.slug.ar);
}

function parseOrThrow<T extends z.ZodTypeAny>(schema: T, raw: unknown, message: string): z.infer<T> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw badRequest(message, issueDetails(parsed.error));
  }
  return parsed.data;
}

/** Revalidate the public cache tags a mutation may have changed (best-effort). */
function invalidateFor(config: EntityConfig, rows: (Record<string, unknown> | null)[]): void {
  const tags = new Set<string>(["seo:sitemap"]);
  for (const row of rows) {
    if (!row) continue;
    for (const tag of config.publicTags(row)) tags.add(tag);
  }
  for (const tag of tags) {
    try {
      revalidateTag(tag, { expire: 0 });
    } catch (err) {
      logger.warn({ err, tag }, "Failed to invalidate cache tag after admin mutation");
    }
  }
}

async function assertParentDepth(
  config: EntityConfig,
  raw: Record<string, unknown>,
): Promise<void> {
  if (config.resource !== "categories") return;
  const parentId = raw.parentId;
  if (typeof parentId !== "string" || parentId.length === 0) return;
  const parent = await prisma.category.findUnique({
    where: { id: parentId },
    select: { id: true, parentId: true },
  });
  if (!parent) {
    throw badRequest("Parent category not found", [{ path: "parentId", issue: "notFound" }]);
  }
  if (parent.parentId) {
    throw badRequest("Categories support at most two levels", [
      { path: "parentId", issue: "maxDepth" },
    ]);
  }
}

async function writeJunctions(
  tx: Record<string, AnyDelegate>,
  config: EntityConfig,
  id: string,
  categoryIds: string[] | undefined,
  imageIds: string[] | undefined,
): Promise<void> {
  if (config.categoryJunction && categoryIds !== undefined) {
    const junction = config.categoryJunction;
    await tx[junction.model].deleteMany({ where: { [junction.foreignKey]: id } });
    const unique = [...new Set(categoryIds)];
    if (unique.length > 0) {
      await tx[junction.model].createMany({
        data: unique.map((categoryId) => ({ [junction.foreignKey]: id, categoryId })),
      });
    }
  }
  if (config.imageJunction && imageIds !== undefined) {
    const junction = config.imageJunction;
    await tx[junction.model].deleteMany({ where: { [junction.foreignKey]: id } });
    const unique = [...new Set(imageIds)];
    if (unique.length > 0) {
      await tx[junction.model].createMany({
        data: unique.map((mediaId, index) => ({
          [junction.foreignKey]: id,
          mediaId,
          sortOrder: index,
        })),
      });
    }
  }
}

function toDetail(config: EntityConfig, row: Record<string, unknown>): Record<string, unknown> {
  const { categories, images, ...rest } = row as {
    categories?: { categoryId: string }[];
    images?: { mediaId: string; sortOrder: number }[];
  } & Record<string, unknown>;
  const detail: Record<string, unknown> = { ...rest };
  if (config.categoryJunction) {
    detail.categoryIds = (categories ?? []).map((entry) => entry.categoryId);
  }
  if (config.imageJunction) {
    detail.imageIds = (images ?? []).map((entry) => entry.mediaId);
  }
  return detail;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface AdminPage {
  items: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminReferences {
  categories: { id: string; nameEn: string; nameAr: string; kind: string; parentId: string | null }[];
  brands: { id: string; nameEn: string; nameAr: string }[];
  suppliers: { id: string; nameEn: string; nameAr: string }[];
}

/**
 * Reference option lists for the admin forms (T082). Only ever called by the
 * server admin pages, which already enforced `{resource}:read`, so it exposes
 * nothing beyond id + bilingual label (+ category kind/parent for the parent
 * picker and junction filtering).
 */
export async function getAdminReferences(): Promise<AdminReferences> {
  const [categories, brands, suppliers] = await Promise.all([
    prisma.category.findMany({
      select: { id: true, nameEn: true, nameAr: true, kind: true, parentId: true },
      orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { nameEn: "asc" }],
    }),
    prisma.brand.findMany({
      select: { id: true, nameEn: true, nameAr: true },
      orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
    }),
    prisma.supplier.findMany({
      select: { id: true, nameEn: true, nameAr: true },
      orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
    }),
  ]);
  return {
    categories: categories.map((entry) => ({
      id: entry.id,
      nameEn: entry.nameEn,
      nameAr: entry.nameAr,
      kind: entry.kind,
      parentId: entry.parentId,
    })),
    brands,
    suppliers,
  };
}

export async function listAdminEntities(
  resource: AdminResource,
  rawQuery: unknown,
): Promise<AdminPage> {
  await requirePermission(`${resource}:read`);
  const config = configFor(resource);
  const query = parseOrThrow(adminListQuerySchema, rawQuery, "Invalid query") as AdminListQuery;

  const where: Record<string, unknown> = {};
  if (query.status) where.status = query.status;
  if (query.q) {
    where.OR = config.searchFields.map((field) => ({
      [field]: { contains: query.q, mode: "insensitive" },
    }));
  }

  const delegate = db[config.model];
  const [items, total] = await Promise.all([
    delegate.findMany({
      where,
      orderBy: config.listOrderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: config.listSelect,
    }),
    delegate.count({ where }),
  ]);

  return { items, total, page: query.page, pageSize: query.pageSize };
}

export async function getAdminEntity(
  resource: AdminResource,
  id: string,
): Promise<Record<string, unknown>> {
  await requirePermission(`${resource}:read`);
  const config = configFor(resource);
  const row = await db[config.model].findUnique({
    where: { id },
    include: config.detailInclude,
  });
  if (!row) {
    throw notFound("Record not found");
  }
  return toDetail(config, row);
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createAdminEntity(
  resource: AdminResource,
  raw: unknown,
): Promise<Record<string, unknown>> {
  const actor = await requirePermission(`${resource}:create`);
  const config = configFor(resource);
  const input = parseOrThrow(config.createSchema, raw, "Invalid payload") as Record<string, unknown>;
  const { categoryIds, imageIds, ...data } = input as {
    categoryIds?: string[];
    imageIds?: string[];
  } & Record<string, unknown>;

  await assertParentDepth(config, data);

  try {
    const created = await prisma.$transaction(async (tx) => {
      const txDb = tx as unknown as Record<string, AnyDelegate>;
      const row = await txDb[config.model].create({
        data: { ...data, createdById: actor.id },
        select: { id: true },
      });
      await writeJunctions(txDb, config, row.id as string, categoryIds, imageIds);
      await tx.activityLog.create({
        data: {
          actorId: actor.id,
          action: "create",
          entityType: config.entityType,
          entityId: row.id as string,
          summary: `created ${config.entityType}`,
        },
      });
      return row.id as string;
    });

    logger.info({ resource, id: created, actorId: actor.id }, "Admin entity created");
    return getAdminEntity(resource, created);
  } catch (error) {
    if (isSlugViolation(config, error)) {
      throw slugConflict();
    }
    throw error;
  }
}

export async function updateAdminEntity(
  resource: AdminResource,
  id: string,
  raw: unknown,
): Promise<Record<string, unknown>> {
  const actor = await requirePermission(`${resource}:update`);
  const config = configFor(resource);
  const input = parseOrThrow(config.updateSchema, raw, "Invalid payload") as Record<string, unknown>;
  const { version, categoryIds, imageIds, ...changes } = input as {
    version: number;
    categoryIds?: string[];
    imageIds?: string[];
  } & Record<string, unknown>;

  const delegate = db[config.model];
  const current = await delegate.findUnique({
    where: { id },
    select: { id: true, version: true, status: true, ...(config.slug ? { [config.slug.en]: true, [config.slug.ar]: true } : {}) },
  });
  if (!current) {
    throw notFound("Record not found");
  }
  if ((current.version as number) !== version) {
    throw versionConflict(current.version);
  }

  await assertParentDepth(config, changes);
  const changed = Object.keys(changes);
  if (categoryIds !== undefined) changed.push("categories");
  if (imageIds !== undefined) changed.push("images");

  // Slug changes keep old public URLs alive via SlugRedirect (US10.3, T105).
  const slugChanges = config.slug
    ? (["en", "ar"] as const).flatMap((locale) => {
        const column = config.slug![locale];
        const oldSlug = current[column];
        const newSlug = changes[column];
        return typeof oldSlug === "string" &&
          typeof newSlug === "string" &&
          oldSlug !== newSlug
          ? [{ locale, oldSlug, newSlug }]
          : [];
      })
    : [];

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const txDb = tx as unknown as Record<string, AnyDelegate>;
      const result = await txDb[config.model].updateMany({
        where: { id, version },
        data: { ...changes, updatedById: actor.id, version: { increment: 1 } },
      });
      if (result.count === 0) {
        throw versionConflict(version);
      }
      await writeJunctions(txDb, config, id, categoryIds, imageIds);
      for (const change of slugChanges) {
        await recordSlugChange(tx, {
          entityType: config.entityType as EntityType,
          ...change,
        });
      }
      await tx.activityLog.create({
        data: {
          actorId: actor.id,
          action: "update",
          entityType: config.entityType,
          entityId: id,
          summary: changed.length > 0 ? changed.join(", ") : "updated",
        },
      });
      return id;
    });

    const detail = await getAdminEntity(resource, updated);
    // A published record's public output changed — refresh its cached tags.
    if ((current.status as string) === "published") {
      invalidateFor(config, [current, detail]);
    }
    logger.info({ resource, id, actorId: actor.id }, "Admin entity updated");
    return detail;
  } catch (error) {
    if (isSlugViolation(config, error)) {
      throw slugConflict();
    }
    throw error;
  }
}

const TRANSITION_PERMISSION = {
  publish: "publish",
  unpublish: "publish",
  archive: "archive",
  restore: "archive",
  visibility: "visibility",
  verify: "update",
  unverify: "update",
} as const;

const STATUS_TARGET = {
  publish: "published",
  unpublish: "draft",
  archive: "archived",
  restore: "draft",
} as const satisfies Record<"publish" | "unpublish" | "archive" | "restore", EntityStatus>;

export type TransitionAction = keyof typeof TRANSITION_PERMISSION;

export function isTransitionAction(value: string): value is TransitionAction {
  return value in TRANSITION_PERMISSION;
}

function isLocationVerificationAction(
  action: TransitionAction,
): action is "verify" | "unverify" {
  return action === "verify" || action === "unverify";
}

export async function transitionAdminEntity(
  resource: AdminResource,
  id: string,
  action: TransitionAction,
  raw: unknown,
): Promise<Record<string, unknown>> {
  if (isLocationVerificationAction(action) && resource !== "locations") {
    throw badRequest("Verification is only supported for locations", [
      { path: "action", issue: "invalidType" },
    ]);
  }

  const actor = await requirePermission(`${resource}:${TRANSITION_PERMISSION[action]}`);
  const config = configFor(resource);
  const body = (raw ?? {}) as { version?: number; isActive?: boolean };

  const delegate = db[config.model];
  const current = await delegate.findUnique({
    where: { id },
    include: config.detailInclude,
  });
  if (!current) {
    throw notFound("Record not found");
  }
  if (body.version !== undefined && (current.version as number) !== body.version) {
    throw versionConflict(current.version);
  }

  const data: Record<string, unknown> = action === "visibility"
    ? { isActive: typeof body.isActive === "boolean" ? body.isActive : !current.isActive }
    : isLocationVerificationAction(action)
      ? { isVerified: action === "verify" }
      : { status: STATUS_TARGET[action] };

  const activityAction =
    action === "visibility"
      ? "visibilityChange"
      : action === "restore" || isLocationVerificationAction(action)
        ? "update"
        : action;

  const updatedId = await prisma.$transaction(async (tx) => {
    const txDb = tx as unknown as Record<string, AnyDelegate>;
    const result = await txDb[config.model].updateMany({
      where: { id, version: current.version as number },
      data: { ...data, updatedById: actor.id, version: { increment: 1 } },
    });
    if (result.count === 0) {
      throw versionConflict(current.version);
    }
    await tx.activityLog.create({
      data: {
        actorId: actor.id,
        action: activityAction,
        entityType: config.entityType,
        entityId: id,
        summary: `${action} ${config.entityType}`,
      },
    });
    return id;
  });

  const detail = await getAdminEntity(resource, updatedId);
  invalidateFor(config, [current, detail]);
  logger.info({ resource, id, action, actorId: actor.id }, "Admin entity transitioned");
  return detail;
}

export async function deleteAdminEntity(
  resource: AdminResource,
  id: string,
): Promise<{ id: string; deleted: true }> {
  const actor = await requirePermission(`${resource}:delete`);
  const config = configFor(resource);
  const delegate = db[config.model];
  const current = await delegate.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!current) {
    throw notFound("Record not found");
  }
  if ((current.status as string) === "published") {
    throw badRequest("Unpublish the record before deleting it", [
      { path: "id", issue: "published" },
    ]);
  }
  if (!(await config.isUnreferenced(id))) {
    throw badRequest("The record is still referenced", [{ path: "id", issue: "stillReferenced" }]);
  }

  await prisma.$transaction(async (tx) => {
    const txDb = tx as unknown as Record<string, AnyDelegate>;
    await txDb[config.model].delete({ where: { id } });
    await tx.activityLog.create({
      data: {
        actorId: actor.id,
        action: "delete",
        entityType: config.entityType,
        entityId: id,
        summary: `deleted ${config.entityType}`,
      },
    });
  });

  logger.info({ resource, id, actorId: actor.id }, "Admin entity deleted");
  return { id, deleted: true };
}
