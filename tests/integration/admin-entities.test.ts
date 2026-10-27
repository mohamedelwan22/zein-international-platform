import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * T073 — generic admin entity lifecycle integration (US7, FR-025–FR-030,
 * FR-036, contracts/admin-api.md §3, SC-004/SC-012/SC-013).
 *
 * Runs the real route handlers against an ephemeral Postgres (migrations
 * applied) with the session mocked, exercising the one governed CRUD path:
 * - per-module permission refusals across all four roles (SC-004);
 * - brand/product/category create → preview → publish → edit → deactivate →
 *   archive with public-effect assertions against the pure catalog reads;
 * - the product publication predicate (published+active brand AND category);
 * - category depth ≤2 and per-(kind, locale) slug uniqueness (409 SLUG_CONFLICT);
 * - optimistic lock: a stale `version` is 409 and writes no activity log;
 * - delete is refused while published or referenced;
 * - exactly one ActivityLog row per lifecycle mutation (SC-012).
 */

const authMock = vi.hoisted(() => vi.fn());
vi.mock("../../src/server/auth/auth", () => ({ auth: authMock }));

const revalidateTagMock = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidateTag: revalidateTagMock }));

import { prisma } from "@/server/db/prisma";
import type { Role } from "@/server/auth/permissions";
import { listPublishedBrands, listPublishedProducts } from "@/server/services/catalog";
import { listPublicLocations } from "@/server/services/locations";

import * as brands from "@/app/api/admin/brands/route";
import * as brandItem from "@/app/api/admin/brands/[id]/route";
import * as brandAction from "@/app/api/admin/brands/[id]/[action]/route";
import * as products from "@/app/api/admin/products/route";
import * as productAction from "@/app/api/admin/products/[id]/[action]/route";
import * as categories from "@/app/api/admin/categories/route";
import * as categoryItem from "@/app/api/admin/categories/[id]/route";
import * as categoryAction from "@/app/api/admin/categories/[id]/[action]/route";
import * as suppliers from "@/app/api/admin/suppliers/route";
import * as clients from "@/app/api/admin/clients/route";
import * as clientItem from "@/app/api/admin/clients/[id]/route";
import * as locations from "@/app/api/admin/locations/route";
import * as locationItem from "@/app/api/admin/locations/[id]/route";
import * as locationAction from "@/app/api/admin/locations/[id]/[action]/route";

const TEST_DOMAIN = "@us7-it.test";

type TestUser = { id: string; tokenVersion: number };

function authAs(user: TestUser | null) {
  if (!user) {
    authMock.mockResolvedValue(null);
    return;
  }
  authMock.mockResolvedValue({ user: { id: user.id, tokenVersion: user.tokenVersion } });
}

async function createStaff(role: Role): Promise<TestUser> {
  return prisma.user.create({
    data: {
      email: `staff-${randomUUID()}${TEST_DOMAIN}`,
      name: "US7 Test Staff",
      passwordHash: "not-a-real-hash",
      role,
      tokenVersion: 1,
    },
    select: { id: true, tokenVersion: true },
  });
}

function jsonReq(url: string, method: string, body: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function actionParams(id: string, action: string) {
  return { params: Promise.resolve({ id, action }) };
}

type Detail = { id: string; version: number } & Record<string, unknown>;

async function createCategory(
  actor: TestUser,
  overrides: Record<string, unknown> = {},
): Promise<Detail> {
  authAs(actor);
  const res = await categories.POST(
    jsonReq("/api/admin/categories", "POST", {
      kind: "brand",
      nameEn: "Category",
      nameAr: "فئة",
      slugEn: `cat-${randomUUID()}`,
      slugAr: `فئة-${randomUUID()}`,
      ...overrides,
    }),
  );
  expect(res.status).toBe(201);
  return res.json();
}

function brandPayload(categoryIds: string[], overrides: Record<string, unknown> = {}) {
  return {
    nameEn: "Shield",
    nameAr: "درع",
    slugEn: `shield-${randomUUID()}`,
    slugAr: `درع-${randomUUID()}`,
    categoryIds,
    ...overrides,
  };
}

async function resetDatabase() {
  await prisma.activityLog.deleteMany({});
  await prisma.productImage.deleteMany({});
  await prisma.productCategory.deleteMany({});
  await prisma.brandCategory.deleteMany({});
  await prisma.supplierCategory.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.brand.deleteMany({});
  await prisma.supplier.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.client.deleteMany({});
  await prisma.location.deleteMany({});
  await prisma.media.deleteMany({});
  await prisma.user.deleteMany({ where: { email: { endsWith: TEST_DOMAIN } } });
}

beforeEach(async () => {
  authMock.mockReset();
  revalidateTagMock.mockReset();
  await resetDatabase();
});

afterAll(async () => {
  await resetDatabase();
});

describe("authorization (SC-004)", () => {
  it("rejects unauthenticated access to every module with 401", async () => {
    authAs(null);
    const request = new Request("http://localhost/api/admin/x");
    expect((await brands.GET(request)).status).toBe(401);
    expect((await products.GET(request)).status).toBe(401);
    expect((await categories.GET(request)).status).toBe(401);
    expect((await suppliers.GET(request)).status).toBe(401);
    expect((await clients.GET(request)).status).toBe(401);
    expect((await locations.GET(request)).status).toBe(401);
  });

  it("applies the documented role matrix per module", async () => {
    const sales = await createStaff("SalesBusiness");
    const content = await createStaff("ContentManager");
    const product = await createStaff("ProductManager");

    // SalesBusiness: clients yes, catalog no.
    authAs(sales);
    expect((await clients.GET(new Request("http://x/clients"))).status).toBe(200);
    expect((await brands.GET(new Request("http://x/brands"))).status).toBe(403);
    expect((await products.GET(new Request("http://x/products"))).status).toBe(403);
    expect((await categories.GET(new Request("http://x/categories"))).status).toBe(403);
    expect((await suppliers.GET(new Request("http://x/suppliers"))).status).toBe(403);
    expect((await locations.GET(new Request("http://x/locations"))).status).toBe(403);

    // ProductManager: catalog read, but not clients.
    authAs(product);
    expect((await brands.GET(new Request("http://x/brands"))).status).toBe(200);
    expect((await clients.GET(new Request("http://x/clients"))).status).toBe(403);

    // ContentManager: catalog read but no create.
    authAs(content);
    expect((await products.GET(new Request("http://x/products"))).status).toBe(200);
    const denied = await categories.POST(
      jsonReq("/api/admin/categories", "POST", {
        kind: "brand",
        nameEn: "x",
        nameAr: "x",
        slugEn: "x",
        slugAr: "x",
      }),
    );
    expect(denied.status).toBe(403);
  });
});

describe("brand lifecycle with public effects (FR-025, SC-013)", () => {
  it("creates, previews, publishes, edits, toggles visibility and archives, with one log per step", async () => {
    const pm = await createStaff("ProductManager");
    const category = await createCategory(pm, {
      kind: "brand",
      nameEn: "Sports",
      nameAr: "رياضة",
    });

    // Create.
    authAs(pm);
    const created = await brands.POST(
      jsonReq("/api/admin/brands", "POST", brandPayload([category.id as string])),
    );
    expect(created.status).toBe(201);
    const brand = (await created.json()) as Detail;
    expect(brand.status).toBe("draft");
    expect(brand.categoryIds).toEqual([category.id]);

    // Preview (detail read) returns the joined categories.
    authAs(pm);
    const preview = await brandItem.GET(new Request("http://x/brands"), params(brand.id));
    expect(preview.status).toBe(200);
    expect(((await preview.json()) as Detail).id).toBe(brand.id);

    // Not yet public.
    expect((await listPublishedBrands("en")).some((b) => b.id === brand.id)).toBe(false);

    // Publish → publicly visible.
    authAs(pm);
    const published = await brandAction.POST(
      new Request("http://x/brands/publish", { method: "POST" }),
      actionParams(brand.id, "publish"),
    );
    expect(published.status).toBe(200);
    const publishedBody = (await published.json()) as Detail;
    expect(publishedBody.status).toBe("published");
    expect((await listPublishedBrands("en")).some((b) => b.id === brand.id)).toBe(true);

    // Publishing invalidates the brand list + detail cache tags for both locales.
    expect(revalidateTagMock).toHaveBeenCalledWith("brands:en", { expire: 0 });
    expect(revalidateTagMock).toHaveBeenCalledWith("brands:ar", { expire: 0 });
    expect(revalidateTagMock).toHaveBeenCalledWith(`brand:en:${brand.slugEn}`, { expire: 0 });
    expect(revalidateTagMock).toHaveBeenCalledWith(`brand:ar:${brand.slugAr}`, { expire: 0 });

    // Edit (full replace, optimistic lock).
    authAs(pm);
    const edited = await brandItem.PUT(
      jsonReq("/api/admin/brands/edit", "PUT", {
        ...brandPayload([category.id as string]),
        slugEn: brand.slugEn,
        slugAr: brand.slugAr,
        nameEn: "Shield Industries",
        version: publishedBody.version,
      }),
      params(brand.id),
    );
    expect(edited.status).toBe(200);

    // Deactivate → hidden from the directory.
    authAs(pm);
    const hidden = await brandAction.POST(
      jsonReq("/api/admin/brands/visibility", "POST", { isActive: false }),
      actionParams(brand.id, "visibility"),
    );
    expect(hidden.status).toBe(200);
    expect(((await hidden.json()) as Detail).isActive).toBe(false);
    expect((await listPublishedBrands("en")).some((b) => b.id === brand.id)).toBe(false);

    // Reactivate, then archive.
    authAs(pm);
    await brandAction.POST(
      jsonReq("/api/admin/brands/visibility", "POST", { isActive: true }),
      actionParams(brand.id, "visibility"),
    );
    authAs(pm);
    const archived = await brandAction.POST(
      new Request("http://x/brands/archive", { method: "POST" }),
      actionParams(brand.id, "archive"),
    );
    expect(archived.status).toBe(200);
    expect(((await archived.json()) as Detail).status).toBe("archived");
    expect((await listPublishedBrands("en")).some((b) => b.id === brand.id)).toBe(false);

    // One activity-log row per lifecycle action.
    const logs = await prisma.activityLog.findMany({ where: { entityId: brand.id } });
    const actions = logs.map((log) => log.action).sort();
    expect(actions).toEqual(
      ["archive", "create", "publish", "update", "visibilityChange", "visibilityChange"].sort(),
    );
    expect(logs.every((log) => log.actorId === pm.id)).toBe(true);
  });
});

describe("categories (FR-027)", () => {
  it("enforces depth ≤2 and per-(kind, locale) slug uniqueness", async () => {
    const pm = await createStaff("ProductManager");
    const root = await createCategory(pm, { kind: "product" });
    const child = await createCategory(pm, { kind: "product", parentId: root.id });

    // A third level is rejected.
    authAs(pm);
    const grandchild = await categories.POST(
      jsonReq("/api/admin/categories", "POST", {
        kind: "product",
        parentId: child.id,
        nameEn: "Deep",
        nameAr: "عميق",
        slugEn: `deep-${randomUUID()}`,
        slugAr: `عميق-${randomUUID()}`,
      }),
    );
    expect(grandchild.status).toBe(400);

    // Duplicate slug in the same kind is a conflict…
    authAs(pm);
    const duplicate = await categories.POST(
      jsonReq("/api/admin/categories", "POST", {
        kind: "product",
        nameEn: "Clone",
        nameAr: "نسخة",
        slugEn: root.slugEn,
        slugAr: `نسخة-${randomUUID()}`,
      }),
    );
    expect(duplicate.status).toBe(409);
    expect(((await duplicate.json()) as { error: { code: string } }).error.code).toBe(
      "SLUG_CONFLICT",
    );

    // …but the same slug under a different kind is allowed.
    authAs(pm);
    const otherKind = await categories.POST(
      jsonReq("/api/admin/categories", "POST", {
        kind: "supplier",
        nameEn: "Same slug",
        nameAr: "نفس",
        slugEn: root.slugEn,
        slugAr: `نفس-${randomUUID()}`,
      }),
    );
    expect(otherKind.status).toBe(201);
  });

  it("reorders via a partial sortOrder-only update", async () => {
    const pm = await createStaff("ProductManager");
    const category = await createCategory(pm, { kind: "product" });
    authAs(pm);
    const res = await categoryItem.PUT(
      jsonReq("/api/admin/categories/reorder", "PUT", { sortOrder: 42, version: category.version }),
      params(category.id),
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as Detail).sortOrder).toBe(42);
  });
});

describe("products (FR-026, FR-009 predicate)", () => {
  it("requires brand+categories, orders images, and publishes only under a published brand+category", async () => {
    const pm = await createStaff("ProductManager");
    const brandCategory = await createCategory(pm, { kind: "brand" });
    const productCategory = await createCategory(pm, { kind: "product" });

    // A brand (published) and two media rows for product images.
    authAs(pm);
    const brandRes = await brands.POST(
      jsonReq("/api/admin/brands", "POST", brandPayload([brandCategory.id as string])),
    );
    const brand = (await brandRes.json()) as Detail;
    await brandAction.POST(
      new Request("http://x/brands/publish", { method: "POST" }),
      actionParams(brand.id, "publish"),
    );
    await categoryAction.POST(
      new Request("http://x/categories/publish", { method: "POST" }),
      actionParams(productCategory.id, "publish"),
    );

    const mediaA = await prisma.media.create({
      data: {
        kind: "image",
        mimeType: "image/png",
        byteSize: 10,
        storageKey: `k-${randomUUID()}`,
        originalName: "a.png",
        sha256: "a".repeat(64),
        uploadedById: pm.id,
      },
      select: { id: true },
    });
    const mediaB = await prisma.media.create({
      data: {
        kind: "image",
        mimeType: "image/png",
        byteSize: 10,
        storageKey: `k-${randomUUID()}`,
        originalName: "b.png",
        sha256: "b".repeat(64),
        uploadedById: pm.id,
      },
      select: { id: true },
    });

    // Create the product (brand required, ≥1 category, images ordered).
    authAs(pm);
    const created = await products.POST(
      jsonReq("/api/admin/products", "POST", {
        brandId: brand.id,
        categoryIds: [productCategory.id as string],
        imageIds: [mediaB.id, mediaA.id],
        nameEn: "Flag",
        nameAr: "علم",
        slugEn: `flag-${randomUUID()}`,
        slugAr: `علم-${randomUUID()}`,
      }),
    );
    expect(created.status).toBe(201);
    const product = (await created.json()) as Detail;
    expect(product.imageIds).toEqual([mediaB.id, mediaA.id]);

    // Draft: not public.
    expect((await listPublishedProducts("en")).some((p) => p.id === product.id)).toBe(false);

    // Publish the product → public, because brand+category are published.
    authAs(pm);
    const published = await productAction.POST(
      new Request("http://x/products/publish", { method: "POST" }),
      actionParams(product.id, "publish"),
    );
    expect(published.status).toBe(200);
    const listed = await listPublishedProducts("en");
    expect(listed.some((p) => p.id === product.id)).toBe(true);
    const listItem = listed.find((p) => p.id === product.id);
    expect(listItem?.categories.map((c) => c.id)).toContain(productCategory.id);

    // Unpublishing the brand hides the product (predicate includes brand).
    authAs(pm);
    await brandAction.POST(
      new Request("http://x/brands/unpublish", { method: "POST" }),
      actionParams(brand.id, "unpublish"),
    );
    expect((await listPublishedProducts("en")).some((p) => p.id === product.id)).toBe(false);

    // The images survive as ordered journal rows.
    const images = await prisma.productImage.findMany({
      where: { productId: product.id },
      orderBy: { sortOrder: "asc" },
    });
    expect(images.map((image) => image.mediaId)).toEqual([mediaB.id, mediaA.id]);
  });

  it("rejects a product without a brand or without categories", async () => {
    const pm = await createStaff("ProductManager");
    authAs(pm);
    const noBrand = await products.POST(
      jsonReq("/api/admin/products", "POST", {
        categoryIds: [randomUUID()],
        nameEn: "x",
        nameAr: "x",
        slugEn: `x-${randomUUID()}`,
        slugAr: `x-${randomUUID()}`,
      }),
    );
    expect(noBrand.status).toBe(400);

    authAs(pm);
    const noCategories = await products.POST(
      jsonReq("/api/admin/products", "POST", {
        brandId: randomUUID(),
        nameEn: "x",
        nameAr: "x",
        slugEn: `y-${randomUUID()}`,
        slugAr: `y-${randomUUID()}`,
      }),
    );
    expect(noCategories.status).toBe(400);
  });
});

describe("clients (FR-029) and locations (FR-030)", () => {
  it("defaults client disclosure to false and keeps confidential fields staff-only", async () => {
    const sales = await createStaff("SalesBusiness");
    authAs(sales);
    const res = await clients.POST(
      jsonReq("/api/admin/clients", "POST", {
        nameEn: "Confidential Co",
        nameAr: "شركة",
        industryEn: "Energy",
      }),
    );
    expect(res.status).toBe(201);
    const client = (await res.json()) as Detail;
    expect(client.disclosureApproved).toBe(false);
    expect(client.status).toBe("draft");

    authAs(sales);
    const approved = await clientItem.PUT(
      jsonReq("/api/admin/clients/approve", "PUT", {
        nameEn: "Confidential Co",
        nameAr: "شركة",
        industryEn: "Energy",
        disclosureApproved: true,
        version: client.version,
      }),
      params(client.id),
    );
    expect(approved.status).toBe(200);
    expect(((await approved.json()) as Detail).disclosureApproved).toBe(true);
  });

  it("stores nullable coordinates and defaults a location to unverified", async () => {
    const pm = await createStaff("ProductManager");
    authAs(pm);
    const res = await locations.POST(
      jsonReq("/api/admin/locations", "POST", {
        cityEn: "Jeddah",
        cityAr: "جدة",
        addressEn: "Aziziyah District, 23337 King Fahd Road",
        addressAr: "حي العزيزية، 23337 طريق الملك فهد",
      }),
    );
    expect(res.status).toBe(201);
    const location = (await res.json()) as Detail;
    expect(location.latitude).toBeNull();
    expect(location.longitude).toBeNull();
    expect(location.isVerified).toBe(false);
    expect(location.countryCode).toBe("SA");

    authAs(pm);
    const verified = await locationItem.PUT(
      jsonReq("/api/admin/locations/edit", "PUT", {
        cityEn: "Jeddah",
        cityAr: "جدة",
        addressEn: "Aziziyah District, 23337 King Fahd Road",
        addressAr: "حي العزيزية، 23337 طريق الملك فهد",
        latitude: 21.4858,
        longitude: 39.1925,
        isVerified: true,
        version: location.version,
      }),
      params(location.id),
    );
    expect(verified.status).toBe(200);
    const verifiedBody = (await verified.json()) as Detail;
    expect(Number(verifiedBody.latitude)).toBeCloseTo(21.4858, 3);
    expect(verifiedBody.isVerified).toBe(true);
  });

  it("requires explicit verify and unverify actions before a location is public", async () => {
    const pm = await createStaff("ProductManager");
    authAs(pm);
    const created = await locations.POST(
      jsonReq("/api/admin/locations", "POST", {
        cityEn: "Jeddah",
        cityAr: "جدة",
        addressEn: "Aziziyah District, 23337 King Fahd Road",
        addressAr: "حي العزيزية، 23337 طريق الملك فهد",
      }),
    );
    expect(created.status).toBe(201);
    const location = (await created.json()) as Detail;

    // Creation stays confidential: unverified and draft.
    expect((await listPublicLocations("en")).map((entry) => entry.id)).not.toContain(location.id);

    authAs(pm);
    const verified = await locationAction.POST(
      jsonReq(`/api/admin/locations/${location.id}/verify`, "POST", {
        version: location.version,
      }),
      actionParams(location.id, "verify"),
    );
    expect(verified.status).toBe(200);
    const verifiedBody = (await verified.json()) as Detail;
    expect(verifiedBody.isVerified).toBe(true);
    expect(verifiedBody.status).toBe("draft");

    // Verified alone is not enough: it still has to be published.
    expect((await listPublicLocations("en")).map((entry) => entry.id)).not.toContain(location.id);

    authAs(pm);
    const published = await locationAction.POST(
      jsonReq(`/api/admin/locations/${location.id}/publish`, "POST", {
        version: verifiedBody.version,
      }),
      actionParams(location.id, "publish"),
    );
    expect(published.status).toBe(200);
    const publishedBody = (await published.json()) as Detail;
    expect((await listPublicLocations("en")).map((entry) => entry.id)).toContain(location.id);

    authAs(pm);
    const unverified = await locationAction.POST(
      jsonReq(`/api/admin/locations/${location.id}/unverify`, "POST", {
        version: publishedBody.version,
      }),
      actionParams(location.id, "unverify"),
    );
    expect(unverified.status).toBe(200);
    expect(((await unverified.json()) as Detail).isVerified).toBe(false);
    expect((await listPublicLocations("en")).map((entry) => entry.id)).not.toContain(location.id);
  });

  it("accepts only Google Maps embed URLs", async () => {
    const pm = await createStaff("ProductManager");
    authAs(pm);
    const created = await locations.POST(
      jsonReq("/api/admin/locations", "POST", {
        cityEn: "Jeddah",
        cityAr: "جدة",
        addressEn: "Aziziyah District, 23337 King Fahd Road",
        addressAr: "حي العزيزية، 23337 طريق الملك فهد",
      }),
    );
    const location = (await created.json()) as Detail;

    authAs(pm);
    const rejected = await locationItem.PUT(
      jsonReq("/api/admin/locations/embed", "PUT", {
        cityEn: "Jeddah",
        cityAr: "جدة",
        addressEn: "Aziziyah District, 23337 King Fahd Road",
        addressAr: "حي العزيزية، 23337 طريق الملك فهد",
        mapEmbedUrl: "https://evil.example/maps/embed?pb=jeddah",
        version: location.version,
      }),
      params(location.id),
    );
    expect(rejected.status).toBe(400);

    authAs(pm);
    const accepted = await locationItem.PUT(
      jsonReq("/api/admin/locations/embed", "PUT", {
        cityEn: "Jeddah",
        cityAr: "جدة",
        addressEn: "Aziziyah District, 23337 King Fahd Road",
        addressAr: "حي العزيزية، 23337 طريق الملك فهد",
        mapEmbedUrl: "https://www.google.com/maps/embed?pb=jeddah",
        version: location.version,
      }),
      params(location.id),
    );
    expect(accepted.status).toBe(200);
    const acceptedBody = (await accepted.json()) as Detail;
    expect(acceptedBody.mapEmbedUrl).toBe(
      "https://www.google.com/maps/embed?pb=jeddah",
    );

    authAs(pm);
    const snippetAccepted = await locationItem.PUT(
      jsonReq("/api/admin/locations/embed", "PUT", {
        cityEn: "Jeddah",
        cityAr: "جدة",
        addressEn: "Aziziyah District, 23337 King Fahd Road",
        addressAr: "حي العزيزية 23337 طريق الملك فهد",
        mapEmbedUrl:
          '<iframe src="https://www.google.com/maps/embed?pb=jeddah&amp;hl=en" width="600" height="450"></iframe>',
        version: acceptedBody.version,
      }),
      params(location.id),
    );
    expect(snippetAccepted.status).toBe(200);
    expect(((await snippetAccepted.json()) as Detail).mapEmbedUrl).toBe(
      "https://www.google.com/maps/embed?pb=jeddah&hl=en",
    );
  });
});

describe("optimistic lock, duplicate slug and delete guards", () => {
  it("returns 409 on a stale version and writes no log", async () => {
    const pm = await createStaff("ProductManager");
    const category = await createCategory(pm, { kind: "brand" });
    authAs(pm);
    const created = await brands.POST(
      jsonReq("/api/admin/brands", "POST", brandPayload([category.id as string])),
    );
    const brand = (await created.json()) as Detail;

    authAs(pm);
    const stale = await brandItem.PUT(
      jsonReq("/api/admin/brands/stale", "PUT", {
        ...brandPayload([category.id as string]),
        slugEn: brand.slugEn,
        slugAr: brand.slugAr,
        version: 999,
      }),
      params(brand.id),
    );
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as { error: { code: string } }).error.code).toBe(
      "VERSION_CONFLICT",
    );
    expect(await prisma.activityLog.count({ where: { entityId: brand.id, action: "update" } })).toBe(
      0,
    );
  });

  it("refuses to delete a published brand and a referenced category", async () => {
    const pm = await createStaff("ProductManager");
    const category = await createCategory(pm, { kind: "brand" });

    authAs(pm);
    const created = await brands.POST(
      jsonReq("/api/admin/brands", "POST", brandPayload([category.id as string])),
    );
    const brand = (await created.json()) as Detail;
    await brandAction.POST(
      new Request("http://x/brands/publish", { method: "POST" }),
      actionParams(brand.id, "publish"),
    );

    // Published brand refuses deletion.
    authAs(pm);
    const blocked = await brandItem.DELETE(new Request("http://x/brands", { method: "DELETE" }), params(brand.id));
    expect(blocked.status).toBe(400);

    // Referenced category refuses deletion.
    authAs(pm);
    const referenced = await categoryItem.DELETE(
      new Request("http://x/categories", { method: "DELETE" }),
      params(category.id as string),
    );
    expect(referenced.status).toBe(400);

    // Unpublish the brand, then a draft unreferenced category can go.
    authAs(pm);
    await brandAction.POST(
      new Request("http://x/brands/unpublish", { method: "POST" }),
      actionParams(brand.id, "unpublish"),
    );
    authAs(pm);
    const unused = await createCategory(pm, { kind: "supplier" });
    authAs(pm);
    const deleted = await categoryItem.DELETE(
      new Request("http://x/categories", { method: "DELETE" }),
      params(unused.id),
    );
    expect(deleted.status).toBe(200);
    expect(await prisma.category.findUnique({ where: { id: unused.id } })).toBeNull();
  });
});
