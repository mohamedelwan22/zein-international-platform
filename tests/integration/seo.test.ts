import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * T101/T102/T103/T105 integration (US10, FR-034/FR-036/FR-042/FR-043,
 * admin-api.md §7, SC-011).
 *
 * Exercises the real SEO route handlers against an ephemeral Postgres:
 * - `seo:read|update` permission matrix (401/403/200);
 * - page override validation (60/160 caps, canonical URL), full-replacement
 *   fallback, optimistic version lock and ActivityLog rows;
 * - public reads + sitemap apply the override, noindex and publication rules;
 * - a slug change through the SEO endpoint updates the entity, creates and
 *   flattens `SlugRedirect` rows, and the old URL still resolves to the entity;
 * - manual redirect CRUD with duplicate/unknown-target guards.
 */

const authMock = vi.hoisted(() => vi.fn());
vi.mock("../../src/server/auth/auth", () => ({ auth: authMock }));

const revalidateTagMock = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidateTag: revalidateTagMock }));

import { prisma } from "@/server/db/prisma";
import type { Role } from "@/server/auth/permissions";
import { brandDetail } from "@/server/services/catalog";
import {
  buildPublicSitemap,
  loadEntitySeo,
  loadPageSeo,
} from "@/server/services/seo";

import * as seoCollection from "@/app/api/admin/seo/route";
import * as seoItem from "@/app/api/admin/seo/[targetKey]/[locale]/route";
import * as redirects from "@/app/api/admin/seo/redirects/route";
import * as redirectItem from "@/app/api/admin/seo/redirects/[id]/route";

const TEST_DOMAIN = "@us10-it.test";

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
      name: "US10 Test Staff",
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

function itemParams(targetKey: string, locale: string) {
  return { params: Promise.resolve({ targetKey, locale }) };
}

function idParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function putOverride(
  targetKey: string,
  locale: "en" | "ar",
  body: Record<string, unknown>,
) {
  return seoItem.PUT(
    jsonReq(`/api/admin/seo/${targetKey}/${locale}`, "PUT", body),
    itemParams(targetKey, locale),
  );
}

async function seedCategory(actor: TestUser, kind: "product" | "brand") {
  return prisma.category.create({
    data: {
      kind,
      nameEn: `Category ${randomUUID()}`,
      nameAr: `Cat ${randomUUID()}`,
      slugEn: `cat-${randomUUID()}`,
      slugAr: `cat-ar-${randomUUID()}`,
      status: "published",
      isActive: true,
      createdById: actor.id,
    },
  });
}

async function seedBrand(
  actor: TestUser,
  overrides: Partial<{
    slugEn: string;
    slugAr: string;
    status: "draft" | "published" | "archived";
    isActive: boolean;
  }> = {},
) {
  return prisma.brand.create({
    data: {
      nameEn: `Brand ${randomUUID()}`,
      nameAr: `Brand AR ${randomUUID()}`,
      slugEn: overrides.slugEn ?? `brand-${randomUUID()}`,
      slugAr: overrides.slugAr ?? `brand-ar-${randomUUID()}`,
      status: overrides.status ?? "published",
      isActive: overrides.isActive ?? true,
      createdById: actor.id,
    },
  });
}

async function seedProduct(
  actor: TestUser,
  brandId: string,
  categoryId: string,
  overrides: Partial<{ status: "draft" | "published"; isActive: boolean }> = {},
) {
  return prisma.product.create({
    data: {
      brandId,
      nameEn: `Product ${randomUUID()}`,
      nameAr: `Product AR ${randomUUID()}`,
      slugEn: `product-${randomUUID()}`,
      slugAr: `product-ar-${randomUUID()}`,
      status: overrides.status ?? "published",
      isActive: overrides.isActive ?? true,
      createdById: actor.id,
      categories: { create: { categoryId } },
    },
  });
}

async function seedSupplier(
  actor: TestUser,
  overrides: Partial<{ disclosureApproved: boolean; status: "draft" | "published" }> = {},
) {
  return prisma.supplier.create({
    data: {
      nameEn: `Supplier ${randomUUID()}`,
      nameAr: `Supplier AR ${randomUUID()}`,
      slugEn: `supplier-${randomUUID()}`,
      slugAr: `supplier-ar-${randomUUID()}`,
      status: overrides.status ?? "published",
      isActive: true,
      disclosureApproved: overrides.disclosureApproved ?? true,
      createdById: actor.id,
    },
  });
}

async function resetDatabase() {
  await prisma.activityLog.deleteMany({});
  await prisma.seoMeta.deleteMany({});
  await prisma.slugRedirect.deleteMany({});
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
  it("enforces seo:read/update for null, ProductManager and ContentManager", async () => {
    const product = await createStaff("ProductManager");
    const content = await createStaff("ContentManager");

    authAs(null);
    expect((await seoCollection.GET(new Request("http://x/api/admin/seo"))).status).toBe(401);
    expect(
      (await putOverride("page:home", "en", { metaTitle: "x" })).status,
    ).toBe(401);

    authAs(product);
    expect((await seoCollection.GET(new Request("http://x/api/admin/seo"))).status).toBe(403);
    expect(
      (await putOverride("page:home", "en", { metaTitle: "x" })).status,
    ).toBe(403);
    expect((await redirects.GET()).status).toBe(403);

    authAs(content);
    expect((await seoCollection.GET(new Request("http://x/api/admin/seo"))).status).toBe(200);
    expect((await redirects.GET()).status).toBe(200);
  });
});

describe("page overrides + validation (T101/T102)", () => {
  it("stores, reads and invalidates a page override with optimistic locking", async () => {
    const content = await createStaff("ContentManager");
    authAs(content);

    const created = await putOverride("page:home", "en", {
      metaTitle: "Approved home title",
      metaDescription: "Approved home description",
      canonicalUrl: "/en",
      noindex: false,
      version: 0,
    });
    expect(created.status).toBe(200);
    const createdRow = await created.json();
    expect(createdRow.version).toBe(1);
    expect(createdRow.targetType).toBe("page");
    expect(createdRow.pageKey).toBe("home");

    const override = await loadPageSeo("home", "en");
    expect(override).toMatchObject({
      title: "Approved home title",
      description: "Approved home description",
      canonicalUrl: "/en",
      noindex: false,
    });
    expect(revalidateTagMock).toHaveBeenCalledWith("seo:page:home:en", { expire: 0 });
    expect(revalidateTagMock).toHaveBeenCalledWith("seo:sitemap", { expire: 0 });

    const stale = await putOverride("page:home", "en", {
      metaTitle: "Stale",
      version: 0,
    });
    expect(stale.status).toBe(409);
    expect((await stale.json()).error.code).toBe("VERSION_CONFLICT");

    const replaced = await putOverride("page:home", "en", {
      metaDescription: "Only a description now",
      version: 1,
    });
    expect(replaced.status).toBe(200);
    const replacedRow = await replaced.json();
    expect(replacedRow.version).toBe(2);
    expect(replacedRow.metaTitle).toBeNull();
    expect(replacedRow.metaDescription).toBe("Only a description now");

    expect(await prisma.activityLog.count()).toBe(2);
    expect(await prisma.seoMeta.count()).toBe(1);
  });

  it("rejects over-long titles, over-long descriptions and unsafe canonicals", async () => {
    const content = await createStaff("ContentManager");
    authAs(content);

    expect((await putOverride("page:about", "en", { metaTitle: "x".repeat(61) })).status).toBe(400);
    expect(
      (await putOverride("page:about", "en", { metaDescription: "x".repeat(161) })).status,
    ).toBe(400);
    expect(
      (await putOverride("page:about", "en", { canonicalUrl: "javascript:alert(1)" })).status,
    ).toBe(400);
    expect((await putOverride("page:about", "en", { slug: "not-allowed" })).status).toBe(400);
    expect(await prisma.seoMeta.count()).toBe(0);
    expect(await prisma.activityLog.count()).toBe(0);
  });

  it("accepts a media OG image and returns its public URL", async () => {
    const content = await createStaff("ContentManager");
    authAs(content);
    const media = await prisma.media.create({
      data: {
        kind: "image",
        mimeType: "image/png",
        byteSize: 10,
        storageKey: `us10/${randomUUID()}.png`,
        originalName: "og.png",
        sha256: "a".repeat(64),
        uploadedById: content.id,
      },
    });

    const response = await putOverride("page:contact", "ar", {
      ogImageMediaId: media.id,
      version: 0,
    });
    expect(response.status).toBe(200);
    const override = await loadPageSeo("contact", "ar");
    expect(override?.ogImageUrl).toBeTruthy();
  });
});

describe("sitemap (T103)", () => {
  it("includes published public records only and honors noindex per locale", async () => {
    const content = await createStaff("ContentManager");
    const category = await seedCategory(content, "product");
    const brand = await seedBrand(content);
    const draftBrand = await seedBrand(content, { status: "draft" });
    const product = await seedProduct(content, brand.id, category.id);
    const supplier = await seedSupplier(content);
    const undisclosed = await seedSupplier(content, { disclosureApproved: false });

    const sitemap = await buildPublicSitemap("https://example.test");
    const urls = sitemap.map((entry) => entry.url);

    expect(urls).toContain("https://example.test/en");
    expect(urls).toContain("https://example.test/ar/contact");
    expect(urls).toContain(`https://example.test/en/brands/${brand.slugEn}`);
    expect(urls).toContain(`https://example.test/ar/brands/${brand.slugAr}`);
    expect(urls).toContain(`https://example.test/en/products/${product.slugEn}`);
    expect(urls).toContain(`https://example.test/en/suppliers/${supplier.slugEn}`);
    expect(urls.some((url) => url.includes(draftBrand.slugEn))).toBe(false);
    expect(urls.some((url) => url.includes(undisclosed.slugEn))).toBe(false);
    expect(urls).toHaveLength(30);

    authAs(content);
    expect((await putOverride("page:about", "en", { noindex: true })).status).toBe(200);
    expect((await putOverride(`brand:${brand.id}`, "en", { noindex: true })).status).toBe(200);

    const filtered = await buildPublicSitemap("https://example.test");
    const filteredUrls = filtered.map((entry) => entry.url);
    expect(filteredUrls).not.toContain("https://example.test/en/about");
    expect(filteredUrls).toContain("https://example.test/ar/about");
    expect(filteredUrls).not.toContain(`https://example.test/en/brands/${brand.slugEn}`);
    expect(filteredUrls).toContain(`https://example.test/ar/brands/${brand.slugAr}`);
  });
});

describe("slug changes + redirects (T105)", () => {
  it("updates the entity, flattens chains, logs once and resolves the old URL", async () => {
    const content = await createStaff("ContentManager");
    authAs(content);
    const brand = await seedBrand(content, { slugEn: "us10-old", slugAr: "us10-old-ar" });
    await prisma.slugRedirect.create({
      data: {
        entityType: "brand",
        locale: "en",
        oldSlug: "us10-older",
        newSlug: "us10-old",
      },
    });

    const response = await putOverride(`brand:${brand.id}`, "en", {
      metaTitle: "Renamed brand",
      slug: "us10-new",
      version: 0,
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.slugOverride).toBe("us10-new");

    const updated = await prisma.brand.findUniqueOrThrow({ where: { id: brand.id } });
    expect(updated.slugEn).toBe("us10-new");
    expect(updated.version).toBe(2);

    const redirectRows = await prisma.slugRedirect.findMany({
      where: { entityType: "brand", locale: "en" },
      orderBy: { oldSlug: "asc" },
    });
    expect(
      redirectRows.map((row) => [row.oldSlug, row.newSlug]),
    ).toEqual([
      ["us10-old", "us10-new"],
      ["us10-older", "us10-new"],
    ]);

    const resolved = await brandDetail("en", "us10-old");
    expect(resolved?.id).toBe(brand.id);
    expect(resolved?.canonicalSlug).toBe("us10-new");

    const seo = await loadEntitySeo("brand", brand.id, "en");
    expect(seo?.title).toBe("Renamed brand");
    expect(await prisma.activityLog.count()).toBe(1);
  });

  it("rejects a slug already used by another brand", async () => {
    const content = await createStaff("ContentManager");
    authAs(content);
    const first = await seedBrand(content, { slugEn: "taken-slug" });
    const second = await seedBrand(content);

    const response = await putOverride(`brand:${second.id}`, "en", {
      slug: "taken-slug",
      version: 0,
    });
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("SLUG_CONFLICT");

    const untouched = await prisma.brand.findUniqueOrThrow({ where: { id: second.id } });
    expect(untouched.slugEn).not.toBe("taken-slug");
    expect(await prisma.brand.findUniqueOrThrow({ where: { id: first.id } })).toBeTruthy();
  });

  it("creates, lists and deletes manual redirects with duplicate/unknown guards", async () => {
    const content = await createStaff("ContentManager");
    authAs(content);
    const brand = await seedBrand(content, { slugEn: "current-slug" });

    const created = await redirects.POST(
      jsonReq("/api/admin/seo/redirects", "POST", {
        entityType: "brand",
        locale: "en",
        oldSlug: "manual-old",
        newSlug: "current-slug",
      }),
    );
    expect(created.status).toBe(201);
    const row = await created.json();

    const duplicate = await redirects.POST(
      jsonReq("/api/admin/seo/redirects", "POST", {
        entityType: "brand",
        locale: "en",
        oldSlug: "manual-old",
        newSlug: "current-slug",
      }),
    );
    expect(duplicate.status).toBe(409);

    const unknown = await redirects.POST(
      jsonReq("/api/admin/seo/redirects", "POST", {
        entityType: "brand",
        locale: "en",
        oldSlug: "manual-other",
        newSlug: "does-not-exist",
      }),
    );
    expect(unknown.status).toBe(400);

    const list = await redirects.GET();
    expect(list.status).toBe(200);
    expect((await list.json()).items).toHaveLength(1);

    const removed = await redirectItem.DELETE(
      new Request(`http://x/api/admin/seo/redirects/${row.id}`, { method: "DELETE" }),
      idParams(row.id),
    );
    expect(removed.status).toBe(200);
    expect(await prisma.slugRedirect.count()).toBe(0);

    const missing = await redirectItem.DELETE(
      new Request(`http://x/api/admin/seo/redirects/${randomUUID()}`, { method: "DELETE" }),
      idParams(randomUUID()),
    );
    expect(missing.status).toBe(404);
    expect(brand.id).toBeTruthy();
  });
});
