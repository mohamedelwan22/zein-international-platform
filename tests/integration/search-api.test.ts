import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { GET } from "@/app/api/search/route";

/**
 * T095 [US9] — `GET /api/search` integration (FR-015, SC-006, data-model §5).
 *
 * Drives the real route handler against a real PostgreSQL database, so the
 * `search_document` generated column, the `pg_trgm` GIN indexes and the
 * UNION query are all exercised for real.
 *
 * Verifies:
 * - a merged, typed, labeled result set across product/brand/supplier/category;
 * - published-only filtering on every entity (draft and inactive rows never
 *   appear);
 * - the confidentiality edge case: a Supplier is returned ONLY when
 *   `disclosureApproved = true` (data-model §2.5), and `Client` is never
 *   searchable at all (data-model §5) — even a fully approved client;
 * - an Arabic query and an English query each find the same row via its own
 *   locale's columns;
 * - a zero-match query is a 200 with empty `items` (the localized empty state
 *   is a UI concern, spec SC-006), not an error;
 * - `q` under the 2-character minimum is a 400;
 * - the public shape never leaks audit/status/disclosure columns;
 * - the 30 / min / IP rate limit returns 429 with `Retry-After`.
 */

const TEST_USER = {
  email: "search-test-staff@zainagency.test",
  name: "Search Test Staff",
  passwordHash: "not-a-real-hash-integration-fixture",
  role: "SuperAdmin" as const,
};

async function ensureTestUser() {
  return prisma.user.upsert({
    where: { email: TEST_USER.email },
    create: TEST_USER,
    update: {},
  });
}

/** Every request gets its own IP so the shared rate-limit window stays isolated. */
let ipCounter = 0;
function uniqueIp(): string {
  ipCounter += 1;
  return `198.51.100.${(ipCounter % 250) + 1}`;
}

async function search(query: string, init: RequestInit & { ip?: string } = {}) {
  const { ip, ...rest } = init;
  const request = new Request(`http://search.test/api/search${query}`, {
    ...rest,
    headers: { "x-forwarded-for": ip ?? uniqueIp() },
  });
  return GET(request);
}

async function searchJson(query: string, init?: RequestInit & { ip?: string }) {
  const response = await search(query, init);
  expect(response.status).toBe(200);
  return (await response.json()) as {
    items: Array<{
      id: string;
      type: string;
      entityType: string;
      title: string;
      slug: string;
      href: string;
      summary: string | null;
      imageUrl: string | null;
      brandName: string | null;
    }>;
    categoryFacets: Array<{ kind: string; id: string; label: string; count: number }>;
    total: number;
    page: number;
    pageSize: number;
  };
}

async function seedSearchable(createdById: string) {
  const category = await prisma.category.create({
    data: {
      kind: "product",
      nameEn: "Building Materials",
      nameAr: "مواد البناء",
      slugEn: "search-building-materials",
      slugAr: "search-building-materials-ar",
      descriptionEn: "Structural and finishing materials.",
      descriptionAr: "مواد إنشائية وتشطيبية.",
      status: "published",
      isActive: true,
      createdById,
    },
  });

  const brand = await prisma.brand.create({
    data: {
      nameEn: "Bestway",
      nameAr: "بيستواي",
      slugEn: "search-bestway",
      slugAr: "search-bestway-ar",
      summaryEn: "Bestway building systems and formwork.",
      summaryAr: "أنظمة بيستواي للبناء والسباكة.",
      status: "published",
      isActive: true,
      createdById,
      categories: { create: [{ categoryId: category.id }] },
    },
  });

  const product = await prisma.product.create({
    data: {
      brandId: brand.id,
      nameEn: "Empty Cement Blocks",
      nameAr: "بلاط إسمنت فارغ",
      slugEn: "search-empty-cement-blocks",
      slugAr: "search-empty-cement-blocks-ar",
      summaryEn: "Hollow cement blocks for partition walls.",
      summaryAr: "بلاط إسمنت مجوف للقواطع.",
      descriptionEn: "Load-bearing hollow cement blocks.",
      descriptionAr: "بلاط إسمنت مجوف حامل للأحمال.",
      status: "published",
      isActive: true,
      createdById,
      categories: { create: [{ categoryId: category.id }] },
    },
  });

  const approvedSupplier = await prisma.supplier.create({
    data: {
      nameEn: "Gulf Supply Co",
      nameAr: "شركة الخليج للتوريد",
      slugEn: "search-gulf-supply-co",
      slugAr: "search-gulf-supply-co-ar",
      summaryEn: "Regional construction supplier.",
      summaryAr: "مورّد إنشائي إقليمي.",
      disclosureApproved: true,
      status: "published",
      isActive: true,
      createdById,
      categories: { create: [{ categoryId: category.id }] },
    },
  });

  // Published and active, but NOT disclosure-approved — data-model §2.5
  // says it must never surface, and search must not become a leak path.
  const undisclosedSupplier = await prisma.supplier.create({
    data: {
      nameEn: "Hidden Supply Co",
      nameAr: "شركة التوريد المخفية",
      slugEn: "search-hidden-supply-co",
      slugAr: "search-hidden-supply-co-ar",
      disclosureApproved: false,
      status: "published",
      isActive: true,
      createdById,
    },
  });

  // Disclosure-approved but still a draft — the other half of the predicate.
  const draftSupplier = await prisma.supplier.create({
    data: {
      nameEn: "Draft Supply Co",
      nameAr: "شركة التوريد المسودة",
      slugEn: "search-draft-supply-co",
      slugAr: "search-draft-supply-co-ar",
      disclosureApproved: true,
      status: "draft",
      isActive: true,
      createdById,
    },
  });

  const draftProduct = await prisma.product.create({
    data: {
      brandId: brand.id,
      nameEn: "Draft Cement Mixer",
      nameAr: "خلاطة إسمنت مسودة",
      slugEn: "search-draft-cement-mixer",
      slugAr: "search-draft-cement-mixer-ar",
      status: "draft",
      isActive: true,
      createdById,
    },
  });

  const inactiveProduct = await prisma.product.create({
    data: {
      brandId: brand.id,
      nameEn: "Inactive Cement Tool",
      nameAr: "أداة إسمنت غير نشطة",
      slugEn: "search-inactive-cement-tool",
      slugAr: "search-inactive-cement-tool-ar",
      status: "published",
      isActive: false,
      createdById,
    },
  });

  // Fully approved + published client. `Client` is excluded from search
  // entirely (data-model §5) — none of these fields may ever be returned.
  const client = await prisma.client.create({
    data: {
      nameEn: "Acme Confidential Retail",
      nameAr: "شركة إكوم السرية",
      disclosureApproved: true,
      status: "published",
      isActive: true,
      createdById,
    },
  });

  return {
    category,
    brand,
    product,
    approvedSupplier,
    undisclosedSupplier,
    draftSupplier,
    draftProduct,
    inactiveProduct,
    client,
  };
}

let seeded: Awaited<ReturnType<typeof seedSearchable>>;

beforeEach(async () => {
  await prisma.productCategory.deleteMany({});
  await prisma.brandCategory.deleteMany({});
  await prisma.supplierCategory.deleteMany({});
  await prisma.productImage.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.brand.deleteMany({});
  await prisma.client.deleteMany({});
  await prisma.supplier.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.rateLimitCounter.deleteMany({});

  const user = await ensureTestUser();
  seeded = await seedSearchable(user.id);
});

describe("GET /api/search — merged, typed, labeled results", () => {
  it("returns results of every searchable type with a type label", async () => {
    const body = await searchJson("?q=cement&locale=en");

    const types = new Set(body.items.map((item) => item.type));
    expect(types.has("product")).toBe(true);
    expect(body.total).toBeGreaterThan(0);

    for (const item of body.items) {
      expect(["product", "brand", "supplier", "category"]).toContain(item.type);
      expect(item.entityType).toBe(item.type);
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.slug.length).toBeGreaterThan(0);
    }
  });

  it("returns the documented response envelope", async () => {
    const body = await searchJson("?q=cement&locale=en&page=1&pageSize=5");
    expect(body).toMatchObject({ page: 1, pageSize: 5 });
    expect(Array.isArray(body.items)).toBe(true);
    expect(Array.isArray(body.categoryFacets)).toBe(true);
    expect(typeof body.total).toBe("number");
  });

  it("builds a locale-prefixed href so a result opens in the active language", async () => {
    const body = await searchJson("?q=cement&locale=en");
    const product = body.items.find((item) => item.type === "product");
    expect(product?.href).toBe(`/en/products/${product?.slug}`);
  });

  it("returns the same row for an English query and its Arabic counterpart", async () => {
    const english = await searchJson("?q=cement&locale=en");
    const arabic = await searchJson("?q=إسمنت&locale=ar");

    const englishProduct = english.items.find((item) => item.type === "product");
    const arabicProduct = arabic.items.find((item) => item.type === "product");

    expect(englishProduct?.id).toBe(seeded.product.id);
    expect(arabicProduct?.id).toBe(seeded.product.id);
    expect(englishProduct?.title).toBe("Empty Cement Blocks");
    expect(arabicProduct?.title).toBe("بلاط إسمنت فارغ");
  });

  it("matches a brand and a supplier by name in the active locale", async () => {
    const brands = await searchJson("?q=bestway&locale=en");
    expect(brands.items.some((item) => item.id === seeded.brand.id)).toBe(true);

    const suppliers = await searchJson("?q=Gulf Supply&locale=en");
    expect(suppliers.items.some((item) => item.id === seeded.approvedSupplier.id)).toBe(
      true,
    );
  });

  it("finds a category and labels it as a category", async () => {
    const body = await searchJson("?q=Building Materials&locale=en");
    const category = body.items.find((item) => item.type === "category");
    expect(category?.id).toBe(seeded.category.id);
    // Categories are browsable facets, not detail pages — never linkable.
    expect(category?.href).toBe("");
  });
});

describe("GET /api/search — published-only and confidentiality", () => {
  it("never returns a draft row", async () => {
    const body = await searchJson("?q=cement&locale=en");
    const ids = body.items.map((item) => item.id);
    expect(ids).not.toContain(seeded.draftProduct.id);
  });

  it("never returns an inactive row", async () => {
    const body = await searchJson("?q=cement&locale=en");
    expect(body.items.map((item) => item.id)).not.toContain(seeded.inactiveProduct.id);
  });

  it("never returns a supplier without disclosureApproved", async () => {
    const body = await searchJson("?q=Hidden Supply&locale=en");
    expect(body.items.map((item) => item.id)).not.toContain(
      seeded.undisclosedSupplier.id,
    );
    expect(body.total).toBe(0);
    expect(body.items).toEqual([]);
  });

  it("never returns a disclosure-approved supplier that is still a draft", async () => {
    const body = await searchJson("?q=Draft Supply&locale=en");
    expect(body.items.map((item) => item.id)).not.toContain(seeded.draftSupplier.id);
  });

  it("never returns a Client, even one that is fully approved and published", async () => {
    for (const query of ["Acme", "Confidential", "إكوم"]) {
      const body = await searchJson(`?q=${encodeURIComponent(query)}&locale=en`);
      expect(body.items.map((item) => item.id)).not.toContain(seeded.client.id);
    }
  });

  it("does not leak audit, status, version or disclosure columns", async () => {
    const body = await searchJson("?q=cement&locale=en");
    expect(body.items.length).toBeGreaterThan(0);
    const forbidden = [
      "disclosureApproved",
      "status",
      "isActive",
      "version",
      "createdById",
      "updatedById",
      "updatedAt",
      "createdAt",
    ];
    for (const item of body.items) {
      for (const key of forbidden) {
        expect(item).not.toHaveProperty(key);
      }
    }
  });
});

describe("GET /api/search — filters, empty state and guards", () => {
  it("honours the type filter", async () => {
    const brandsOnly = await searchJson("?q=cement&type=brand&locale=en");
    expect(brandsOnly.items.every((item) => item.type === "brand")).toBe(true);

    const productOnly = await searchJson("?q=cement&type=product&locale=en");
    expect(productOnly.items.every((item) => item.type === "product")).toBe(true);
    expect(productOnly.items.some((item) => item.id === seeded.product.id)).toBe(true);
  });

  it("ignores an unknown type and falls back to the valid subset", async () => {
    const body = await searchJson("?q=cement&type=product,nonsense&locale=en");
    expect(body.items.every((item) => item.type === "product")).toBe(true);
  });

  it("returns a 200 with empty items for a zero-match query", async () => {
    const body = await searchJson("?q=zzzznotarealproduct&locale=en");
    expect(body).toMatchObject({ items: [], total: 0, page: 1 });
    expect(body.categoryFacets).toEqual([]);
  });

  it("returns a 200 with empty items for an Arabic zero-match query", async () => {
    const body = await searchJson(`?q=${encodeURIComponent("منتج غير موجود")}&locale=ar`);
    expect(body.items).toEqual([]);
  });

  it("rejects a query below the 2-character minimum with 400", async () => {
    const response = await search("?q=a");
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe("VALIDATION_FAILED");
  });

  it("rejects an empty query with 400", async () => {
    const response = await search("?q=");
    expect(response.status).toBe(400);
  });

  it("clamps an oversized pageSize instead of erroring", async () => {
    const body = await searchJson("?q=cement&pageSize=9999");
    expect(body.pageSize).toBeLessThanOrEqual(50);
  });

  it("reports category facets for the matched entities", async () => {
    const body = await searchJson("?q=cement&locale=en");
    const facet = body.categoryFacets.find((f) => f.id === seeded.category.id);
    expect(facet).toBeDefined();
    expect(facet?.kind).toBe("product");
    expect(facet?.label).toBe("Building Materials");
    expect(facet?.count).toBeGreaterThan(0);
  });
});

describe("GET /api/search — rate limit (30 / min / IP)", () => {
  it("returns 429 with Retry-After once the window is exhausted", async () => {
    const ip = "203.0.113.77";

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const response = await search("?q=cement&locale=en", { ip });
      expect(response.status).toBe(200);
    }

    const blocked = await search("?q=cement&locale=en", { ip });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
    const payload = (await blocked.json()) as { error: { code: string } };
    expect(payload.error.code).toBe("RATE_LIMITED");
  });

  it("does not rate limit a different IP", async () => {
    const blockedIp = "203.0.113.78";
    for (let attempt = 0; attempt < 31; attempt += 1) {
      await search("?q=cement&locale=en", { ip: blockedIp });
    }
    const other = await search("?q=cement&locale=en", { ip: "203.0.113.79" });
    expect(other.status).toBe(200);
  });
});
