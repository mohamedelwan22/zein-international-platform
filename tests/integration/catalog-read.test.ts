import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import {
  brandDetail,
  listPublishedBrands,
  listPublishedProducts,
  productDetail,
  resolveLocalizedSlug,
} from "@/server/services/catalog";

/**
 * T039 [US2] — public catalog reads (integration).
 *
 * Drives the T041 service contract in `src/server/services/catalog.ts`:
 *   listPublishedBrands(locale)                    -> PublishedBrandSummary[]
 *   listPublishedProducts(locale, filters?)        -> PublishedProductSummary[]
 *       filters: { brandSlug?, categorySlug?, country? } — individual OR combined
 *   brandDetail(locale, slug)                      -> BrandDetail | null
 *   productDetail(locale, slug)                    -> ProductDetail | null
 *
 * Verifies, against a real database:
 * - the single canonical publication predicate `status = 'published' AND
 *   isActive = true` is enforced everywhere (FR-008 scenario 4): draft,
 *   archived, and inactive brands/products/categories never surface in lists,
 *   detail lookups, or filters;
 * - the "Archived referenced records" edge case: a published product never
 *   renders broken references — when its brand is unpublished, or it has no
 *   published category, the record is hidden entirely (data-model §2.4
 *   "publication predicate joins categories/brands as published too");
 * - combined brand + category + country filters narrow correctly, and clearing
 *   the filters restores the full published set;
 * - the zero-record catalog returns an empty list (never throws / never a
 *   blank page) so the UI can render its localized empty state;
 * - localized output resolves per locale (Arabic names/slugs), optional
 *   localized fields fall back to the available approved variant (T027);
 * - slug resolution honors SlugRedirect (US10.3 behavior) with the chain guard
 *   that a live entity slug always wins over a stale redirect.
 */

const TEST_ADMIN = {
  email: "catalog-test-admin@zainagency.test",
  name: "Catalog Test Admin",
  passwordHash: "not-a-real-hash-integration-fixture",
  role: "SuperAdmin" as const,
};

async function ensureTestUser() {
  return prisma.user.upsert({
    where: { email: TEST_ADMIN.email },
    create: TEST_ADMIN,
    update: {},
  });
}

async function seedCategories(createdById: string) {
  const baseline = [
    {
      key: "catPublished",
      kind: "product" as const,
      nameEn: "Personal Care & Cosmetics",
      nameAr: "العناية الشخصية ومستحضرات التجميل",
      slugEn: "personal-care",
      slugAr: "al-inaya-al-shakhsiya",
      descriptionEn: "Approved personal-care product range.",
      descriptionAr: "مجموعة منتجات العناية الشخصية المعتمدة.",
      status: "published" as const,
      isActive: true,
      sortOrder: 1,
    },
    {
      key: "catArchived",
      kind: "product" as const,
      nameEn: "Archived Category",
      nameAr: "فئة مؤرشفة",
      slugEn: "archived-category",
      slugAr: "faa-muarshafa",
      status: "archived" as const,
      isActive: true,
      sortOrder: 2,
    },
    {
      key: "catInactive",
      kind: "product" as const,
      nameEn: "Inactive Category",
      nameAr: "فئة غير نشطة",
      slugEn: "inactive-category",
      slugAr: "faa-ghair-nashita",
      status: "published" as const,
      isActive: false,
      sortOrder: 3,
    },
    {
      key: "catDraft",
      kind: "product" as const,
      nameEn: "Draft Category",
      nameAr: "فئة مسودة",
      slugEn: "draft-category",
      slugAr: "faa-musawada",
      status: "draft" as const,
      isActive: true,
      sortOrder: 4,
    },
  ];

  const rows = new Map<string, { id: string; slugEn: string; slugAr: string }>();
  for (const category of baseline) {
    const { key, ...data } = category;
    const row = await prisma.category.create({
      data: { ...data, createdById },
    });
    rows.set(key, { id: row.id, slugEn: row.slugEn, slugAr: row.slugAr });
  }
  return rows;
}

async function seedBrands(
  createdById: string,
  catPublishedId: string,
): Promise<Map<string, { id: string; slugEn: string; slugAr: string }>> {
  const baseline = [
    {
      key: "brandAlpha",
      nameEn: "Alpha Traders",
      nameAr: "ألفا للتجارة",
      slugEn: "alpha-traders",
      slugAr: "alpha-traders-ar",
      summaryEn: "Premium consumer-goods distributor.",
      summaryAr: "موزع معتمد للمنتجات الاستهلاكية.",
      originCountryEn: "Saudi Arabia",
      originCountryAr: "السعودية",
      historyEn: "Established in Jeddah.",
      historyAr: "تأسست في جدة.",
      distributionEn: "Kingdom-wide distribution.",
      distributionAr: "توزيع على مستوى المملكة.",
      featured: true,
      status: "published" as const,
      isActive: true,
      sortOrder: 1,
      categories: [catPublishedId],
    },
    {
      key: "brandBeta",
      nameEn: "Beta GmbH",
      nameAr: "بيتا",
      slugEn: "beta-gmbh",
      slugAr: "beta-gmbh-ar",
      summaryEn: "European specialty goods importer.",
      summaryAr: null,
      originCountryEn: "Germany",
      originCountryAr: "ألمانيا",
      historyEn: "Founded in Hamburg.",
      historyAr: "تأسست في هامبورغ.",
      distributionEn: "Gulf distribution network.",
      distributionAr: "شبكة توزيع خليجية.",
      featured: false,
      status: "published" as const,
      isActive: true,
      sortOrder: 2,
      categories: [catPublishedId],
    },
    {
      key: "brandInactive",
      nameEn: "Inactive Brand",
      nameAr: "علامة غير نشطة",
      slugEn: "inactive-brand",
      slugAr: "inactive-brand-ar",
      status: "published" as const,
      isActive: false,
      sortOrder: 3,
      categories: [],
    },
    {
      key: "brandDraft",
      nameEn: "Draft Brand",
      nameAr: "علامة مسودة",
      slugEn: "draft-brand",
      slugAr: "draft-brand-ar",
      status: "draft" as const,
      isActive: true,
      sortOrder: 4,
      categories: [],
    },
    {
      key: "brandArchived",
      nameEn: "Archived Brand",
      nameAr: "علامة مؤرشفة",
      slugEn: "archived-brand",
      slugAr: "archived-brand-ar",
      status: "archived" as const,
      isActive: true,
      sortOrder: 5,
      categories: [],
    },
  ];

  // slugEn/slugAr unique constraints are global per table — create in the
  // declared order (blank non-catalog brands cannot appear publicly anyway).
  const rows = new Map<string, { id: string; slugEn: string; slugAr: string }>();
  for (const brand of baseline) {
    const { key, categories, ...data } = brand;
    const row = await prisma.brand.create({
      data: { ...data, createdById },
    });
    if (categories.length > 0) {
      await prisma.brandCategory.createMany({
        data: categories.map((categoryId) => ({
          brandId: row.id,
          categoryId,
        })),
      });
    }
    rows.set(key, { id: row.id, slugEn: row.slugEn, slugAr: row.slugAr });
  }
  return rows;
}

async function seedMedia(createdById: string) {
  const mediaA = await prisma.media.create({
    data: {
      kind: "image",
      mimeType: "image/webp",
      byteSize: 2048,
      storageKey: "fixture-media-a",
      originalName: "a.webp",
      sha256: "ab".repeat(32),
      altEn: "Alpha product image A",
      altAr: "صورة المنتج ألفا أ",
      uploadedById: createdById,
    },
  });
  const mediaB = await prisma.media.create({
    data: {
      kind: "image",
      mimeType: "image/webp",
      byteSize: 4096,
      storageKey: "fixture-media-b",
      originalName: "b.webp",
      sha256: "cd".repeat(32),
      altEn: "Alpha product image B",
      altAr: null,
      uploadedById: createdById,
    },
  });
  return { mediaA, mediaB };
}

interface ProductFixture {
  key: string;
  brandKey: string;
  categoryKeys: string[];
  nameEn: string;
  nameAr: string;
  slugEn: string;
  slugAr: string;
  summaryEn?: string;
  summaryAr?: string | null;
  descriptionEn?: string;
  descriptionAr?: string | null;
  countryOfOriginEn?: string;
  countryOfOriginAr?: string;
  sku?: string;
  reference?: string;
  status: "published" | "draft" | "archived";
  isActive: boolean;
  sortOrder: number;
}

async function seedProduct(
  fixture: ProductFixture,
  brands: Map<string, { id: string; slugEn: string; slugAr: string }>,
  categories: Map<string, { id: string; slugEn: string; slugAr: string }>,
  createdById: string,
) {
  const brand = brands.get(fixture.brandKey)!;
  const row = await prisma.product.create({
    data: {
      brandId: brand.id,
      nameEn: fixture.nameEn,
      nameAr: fixture.nameAr,
      slugEn: fixture.slugEn,
      slugAr: fixture.slugAr,
      summaryEn: fixture.summaryEn,
      summaryAr: fixture.summaryAr,
      descriptionEn: fixture.descriptionEn,
      descriptionAr: fixture.descriptionAr,
      countryOfOriginEn: fixture.countryOfOriginEn,
      countryOfOriginAr: fixture.countryOfOriginAr,
      specificationsEn: { material: "recycled", size: "10cm" },
      specificationsAr: { material: "معاد تدويره", size: "10سم" },
      sku: fixture.sku,
      reference: fixture.reference,
      status: fixture.status,
      isActive: fixture.isActive,
      sortOrder: fixture.sortOrder,
      createdById,
    },
  });
  if (fixture.categoryKeys.length > 0) {
    await prisma.productCategory.createMany({
      data: fixture.categoryKeys.map((categoryKey) => ({
        productId: row.id,
        categoryId: categories.get(categoryKey)!.id,
      })),
    });
  }
  return row;
}

async function seedBaseline() {
  const user = await ensureTestUser();
  const categories = await seedCategories(user.id);
  const brands = await seedBrands(user.id, categories.get("catPublished")!.id);
  const { mediaA, mediaB } = await seedMedia(user.id);

  const productRows = await Promise.all([
    seedProduct(
      {
        key: "pAlphaSaudi",
        brandKey: "brandAlpha",
        categoryKeys: ["catPublished"],
        nameEn: "Alpha Saudi-Collections",
        nameAr: "تشكيلات ألفا السعودية",
        slugEn: "alpha-saudi",
        slugAr: "alpha-saudi-ar",
        summaryEn: "Bestselling personal-care line.",
        summaryAr: "خط العناية الشخصية الأكثر مبيعاً.",
        descriptionEn: "Full description of the Alpha Saudi collection.",
        descriptionAr: "الوصف الكامل لتشكيلات ألفا السعودية.",
        countryOfOriginEn: "Saudi Arabia",
        countryOfOriginAr: "السعودية",
        sku: "ALP-SA-001",
        reference: "REF-100",
        status: "published",
        isActive: true,
        sortOrder: 1,
      },
      brands,
      categories,
      user.id,
    ),
    seedProduct(
      {
        key: "pBetaGermany",
        brandKey: "brandBeta",
        categoryKeys: ["catPublished"],
        nameEn: "Beta Germany Edition",
        nameAr: "إصدار بيتا الألماني",
        slugEn: "beta-germany",
        slugAr: "beta-germany-ar",
        summaryEn: "German-engineered goods.",
        summaryAr: "منتجات ألمانية الصنع.",
        countryOfOriginEn: "Germany",
        countryOfOriginAr: "ألمانيا",
        status: "published",
        isActive: true,
        sortOrder: 2,
      },
      brands,
      categories,
      user.id,
    ),
    seedProduct(
      {
        key: "pAlphaGermany",
        brandKey: "brandAlpha",
        categoryKeys: ["catPublished"],
        nameEn: "Alpha German Line",
        nameAr: "خط ألفا الألماني",
        slugEn: "alpha-germany",
        slugAr: "alpha-germany-ar",
        summaryEn: "Imported premium line.",
        summaryAr: "خط مستورد فاخر.",
        countryOfOriginEn: "Germany",
        countryOfOriginAr: "ألمانيا",
        status: "published",
        isActive: true,
        sortOrder: 3,
      },
      brands,
      categories,
      user.id,
    ),
    seedProduct(
      {
        key: "pBetaMulti",
        brandKey: "brandBeta",
        categoryKeys: ["catPublished", "catArchived"],
        nameEn: "Beta Multi-Category",
        nameAr: "بيتا متعدد الفئات",
        slugEn: "beta-multi",
        slugAr: "beta-multi-ar",
        summaryEn: "Spans a published and an archived category.",
        summaryAr: "يشمل فئة منشورة وأخرى مؤرشفة.",
        countryOfOriginEn: "Germany",
        countryOfOriginAr: "ألمانيا",
        status: "published",
        isActive: true,
        sortOrder: 4,
      },
      brands,
      categories,
      user.id,
    ),
    // Hidden records — publication predicate must exclude each one.
    seedProduct(
      {
        key: "pHiddenByInactiveBrand",
        brandKey: "brandInactive",
        categoryKeys: ["catPublished"],
        nameEn: "Hidden Inactive Brand",
        nameAr: "منتج مخفي لعلامة غير نشطة",
        slugEn: "hidden-inactive-brand",
        slugAr: "hidden-inactive-brand-ar",
        status: "published",
        isActive: true,
        sortOrder: 5,
      },
      brands,
      categories,
      user.id,
    ),
    seedProduct(
      {
        key: "pHiddenByArchivedCategory",
        brandKey: "brandAlpha",
        categoryKeys: ["catArchived"],
        nameEn: "Hidden Archived Category",
        nameAr: "منتج مخفي لفئة مؤرشفة",
        slugEn: "hidden-archived-category",
        slugAr: "hidden-archived-category-ar",
        status: "published",
        isActive: true,
        sortOrder: 6,
      },
      brands,
      categories,
      user.id,
    ),
    seedProduct(
      {
        key: "pHiddenByInactiveCategory",
        brandKey: "brandAlpha",
        categoryKeys: ["catInactive"],
        nameEn: "Hidden Inactive Category",
        nameAr: "منتج مخفي لفئة غير نشطة",
        slugEn: "hidden-inactive-category",
        slugAr: "hidden-inactive-category-ar",
        status: "published",
        isActive: true,
        sortOrder: 7,
      },
      brands,
      categories,
      user.id,
    ),
    seedProduct(
      {
        key: "pDraft",
        brandKey: "brandAlpha",
        categoryKeys: ["catPublished"],
        nameEn: "Draft Product",
        nameAr: "منتج مسودة",
        slugEn: "draft-product",
        slugAr: "draft-product-ar",
        status: "draft",
        isActive: true,
        sortOrder: 8,
      },
      brands,
      categories,
      user.id,
    ),
    seedProduct(
      {
        key: "pArchived",
        brandKey: "brandAlpha",
        categoryKeys: ["catPublished"],
        nameEn: "Archived Product",
        nameAr: "منتج مؤرشف",
        slugEn: "archived-product",
        slugAr: "archived-product-ar",
        status: "archived",
        isActive: true,
        sortOrder: 9,
      },
      brands,
      categories,
      user.id,
    ),
    seedProduct(
      {
        key: "pInactive",
        brandKey: "brandAlpha",
        categoryKeys: ["catPublished"],
        nameEn: "Inactive Product",
        nameAr: "منتج غير نشط",
        slugEn: "inactive-product",
        slugAr: "inactive-product-ar",
        status: "published",
        isActive: false,
        sortOrder: 10,
      },
      brands,
      categories,
      user.id,
    ),
  ]);

  // Attach ordered images to the flagship product: sort 1 = mediaB, sort 2 =
  // mediaA — the public detail must respect the sort order (data-model §2.4).
  const pAlphaSaudi = productRows.find((row) => row.slugEn === "alpha-saudi")!;
  await prisma.productImage.createMany({
    data: [
      { productId: pAlphaSaudi.id, mediaId: mediaB.id, sortOrder: 1 },
      { productId: pAlphaSaudi.id, mediaId: mediaA.id, sortOrder: 2 },
    ],
  });
  await prisma.product.update({
    where: { id: pAlphaSaudi.id },
    data: { brochureMediaId: mediaA.id },
  });

  return {
    user,
    brands,
    categories,
    mediaA,
    mediaB,
    products: new Map(productRows.map((row) => [row.slugEn, row])),
  };
}

beforeEach(async () => {
  await prisma.productImage.deleteMany({});
  await prisma.productCategory.deleteMany({});
  await prisma.brandCategory.deleteMany({});
  await prisma.slugRedirect.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.brand.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.media.deleteMany({});
});

describe("publication predicate — only published AND active records surface (FR-008 scenario 4)", () => {
  it("lists only published+active brands, ordered by sortOrder, with brand directory fields", async () => {
    await seedBaseline();

    const brands = await listPublishedBrands("en");

    expect(brands.map((brand) => brand.slug)).toEqual([
      "alpha-traders",
      "beta-gmbh",
    ]);
    const alpha = brands.find((brand) => brand.slug === "alpha-traders")!;
    expect(alpha.name).toBe("Alpha Traders");
    expect(alpha.summary).toBe("Premium consumer-goods distributor.");
    expect(alpha.originCountry).toBe("Saudi Arabia");
    expect(alpha.featured).toBe(true);
    expect(alpha.categories).toHaveLength(1);
    expect(alpha.categories[0]?.slug).toBe("personal-care");
    expect(brands.find((brand) => brand.slug === "beta-gmbh")?.featured).toBe(
      false,
    );
  });

  it("never returns draft, archived, or inactive brands (draft/archived/inactive excluded everywhere)", async () => {
    await seedBaseline();

    const slugs = (await listPublishedBrands("en")).map((brand) => brand.slug);
    expect(slugs).not.toContain("draft-brand");
    expect(slugs).not.toContain("archived-brand");
    expect(slugs).not.toContain("inactive-brand");
  });

  it("lists only published+active products and never leaks the hidden records", async () => {
    await seedBaseline();

    const products = await listPublishedProducts("en");

    expect(products.map((product) => product.slug)).toEqual([
      "alpha-saudi",
      "beta-germany",
      "alpha-germany",
      "beta-multi",
    ]);
    const serialized = JSON.stringify(products);
    for (const hiddenSlug of [
      "hidden-inactive-brand",
      "hidden-archived-category",
      "hidden-inactive-category",
      "draft-product",
      "archived-product",
      "inactive-product",
    ]) {
      expect(serialized).not.toContain(hiddenSlug);
    }
  });

  it("detail lookups return null for hidden records — no orphan public detail pages", async () => {
    await seedBaseline();

    expect(await productDetail("en", "hidden-inactive-brand")).toBeNull();
    expect(await productDetail("en", "hidden-archived-category")).toBeNull();
    expect(await productDetail("en", "hidden-inactive-category")).toBeNull();
    expect(await productDetail("en", "draft-product")).toBeNull();
    expect(await productDetail("en", "archived-product")).toBeNull();
    expect(await productDetail("en", "inactive-product")).toBeNull();
    expect(await productDetail("en", "does-not-exist")).toBeNull();

    expect(await brandDetail("en", "draft-brand")).toBeNull();
    expect(await brandDetail("en", "archived-brand")).toBeNull();
    expect(await brandDetail("en", "inactive-brand")).toBeNull();
    expect(await brandDetail("en", "does-not-exist")).toBeNull();
  });
});

describe("Archived referenced records (spec edge case)", () => {
  it("a published product referencing BOTH an archived and a published category stays visible but never renders the archived reference as a category", async () => {
    await seedBaseline();

    const detail = await productDetail("en", "beta-multi");

    expect(detail).not.toBeNull();
    expect(detail?.slug).toBe("beta-multi");
    const renderedCategories = detail?.categories.map(
      (category) => category.slug,
    );
    expect(renderedCategories).toEqual(["personal-care"]);
  });

  it("a published product whose ONLY category is unpublished is hidden (no orphan page)", async () => {
    await seedBaseline();

    expect(await productDetail("en", "hidden-archived-category")).toBeNull();
    expect(await productDetail("en", "hidden-inactive-category")).toBeNull();
    const slugs = (await listPublishedProducts("en")).map((p) => p.slug);
    expect(slugs).not.toContain("hidden-archived-category");
    expect(slugs).not.toContain("hidden-inactive-category");
  });

  it("filtering by an unpublished category yields no results", async () => {
    await seedBaseline();

    expect(
      await listPublishedProducts("en", { categorySlug: "archived-category" }),
    ).toEqual([]);
    expect(
      await listPublishedProducts("en", { categorySlug: "inactive-category" }),
    ).toEqual([]);
    expect(
      await listPublishedProducts("en", { categorySlug: "draft-category" }),
    ).toEqual([]);
  });
});

describe("filters — brand, category, country (individual and combined, FR-009)", () => {
  it("filters by brand slug only", async () => {
    await seedBaseline();

    const alpha = await listPublishedProducts("en", {
      brandSlug: "alpha-traders",
    });
    expect(alpha.map((product) => product.slug)).toEqual([
      "alpha-saudi",
      "alpha-germany",
    ]);

    const beta = await listPublishedProducts("en", { brandSlug: "beta-gmbh" });
    expect(beta.map((product) => product.slug)).toEqual([
      "beta-germany",
      "beta-multi",
    ]);
  });

  it("filters by category slug only", async () => {
    await seedBaseline();

    const products = await listPublishedProducts("en", {
      categorySlug: "personal-care",
    });
    expect(products.map((product) => product.slug)).toEqual([
      "alpha-saudi",
      "beta-germany",
      "alpha-germany",
      "beta-multi",
    ]);
  });

  it("filters by country of origin in either locale's column", async () => {
    await seedBaseline();

    const english = await listPublishedProducts("en", { country: "Germany" });
    const arabic = await listPublishedProducts("en", { country: "ألمانيا" });

    expect(english.map((product) => product.slug)).toEqual([
      "beta-germany",
      "alpha-germany",
      "beta-multi",
    ]);
    expect(arabic.map((product) => product.slug)).toEqual(
      english.map((product) => product.slug),
    );
  });

  it("combines brand + category + country filters in every pairing", async () => {
    await seedBaseline();

    const brandAndCountry = await listPublishedProducts("en", {
      brandSlug: "alpha-traders",
      country: "Germany",
    });
    expect(brandAndCountry.map((product) => product.slug)).toEqual([
      "alpha-germany",
    ]);

    const categoryAndCountry = await listPublishedProducts("en", {
      categorySlug: "personal-care",
      country: "Germany",
    });
    expect(categoryAndCountry.map((product) => product.slug)).toEqual([
      "beta-germany",
      "alpha-germany",
      "beta-multi",
    ]);

    const brandAndCategory = await listPublishedProducts("en", {
      brandSlug: "beta-gmbh",
      categorySlug: "personal-care",
    });
    expect(brandAndCategory.map((product) => product.slug)).toEqual([
      "beta-germany",
      "beta-multi",
    ]);

    const allThree = await listPublishedProducts("en", {
      brandSlug: "alpha-traders",
      categorySlug: "personal-care",
      country: "Germany",
    });
    expect(allThree.map((product) => product.slug)).toEqual(["alpha-germany"]);
  });

  it("clearing the filters restores the full published set", async () => {
    await seedBaseline();

    const filtered = await listPublishedProducts("en", {
      brandSlug: "alpha-traders",
      country: "Germany",
    });
    expect(filtered).toHaveLength(1);

    const cleared = await listPublishedProducts("en");
    expect(cleared.map((product) => product.slug)).toEqual([
      "alpha-saudi",
      "beta-germany",
      "alpha-germany",
      "beta-multi",
    ]);
  });

  it("unknown or unpublished filter values are handled gracefully, never throwing", async () => {
    await seedBaseline();

    expect(
      await listPublishedProducts("en", { brandSlug: "does-not-exist" }),
    ).toEqual([]);
    expect(
      await listPublishedProducts("en", { brandSlug: "archived-brand" }),
    ).toEqual([]);
    expect(
      await listPublishedProducts("en", { brandSlug: "inactive-brand" }),
    ).toEqual([]);
  });
});

describe("product detail (FR-009)", () => {
  it("renders the full published product detail with brand, categories, country, specs, SKU/reference, images, and related products", async () => {
    const { mediaA, mediaB } = await seedBaseline();

    const detail = await productDetail("en", "alpha-saudi");

    expect(detail).not.toBeNull();
    expect(detail?.name).toBe("Alpha Saudi-Collections");
    expect(detail?.slug).toBe("alpha-saudi");
    expect(detail?.summary).toBe("Bestselling personal-care line.");
    expect(detail?.description).toBe(
      "Full description of the Alpha Saudi collection.",
    );
    expect(detail?.countryOfOrigin).toBe("Saudi Arabia");
    expect(detail?.brand.name).toBe("Alpha Traders");
    expect(detail?.brand.slug).toBe("alpha-traders");
    expect(detail?.categories.map((category) => category.slug)).toEqual([
      "personal-care",
    ]);
    expect(detail?.specifications).toEqual({
      material: "recycled",
      size: "10cm",
    });
    expect(detail?.sku).toBe("ALP-SA-001");
    expect(detail?.reference).toBe("REF-100");
    expect(detail?.brochureMediaId).toBeTruthy();

    // Images resolve in ProductImage.sortOrder order — mediaB (sort 1) before
    // mediaA (sort 2) — with a localized alt (data-model §2.4).
    expect(detail?.images.map((image) => image.mediaId)).toEqual([
      mediaB.id,
      mediaA.id,
    ]);
    expect(detail?.images[0]?.alt).toBe("Alpha product image B");
    expect(detail?.images[1]?.alt).toBe("Alpha product image A");
  });

  it("resolves localized name and country per locale, falling back for optional fields (T027)", async () => {
    await seedBaseline();

    const arabic = await productDetail("ar", "alpha-saudi-ar");
    expect(arabic?.name).toBe("تشكيلات ألفا السعودية");
    expect(arabic?.slug).toBe("alpha-saudi-ar");
    expect(arabic?.countryOfOrigin).toBe("السعودية");
    expect(arabic?.specifications).toEqual({
      material: "معاد تدويره",
      size: "10سم",
    });
  });
});

describe("brand detail (FR-008)", () => {
  it("renders the brand detail with history, distribution, categories, and published products", async () => {
    await seedBaseline();

    const detail = await brandDetail("en", "alpha-traders");

    expect(detail).not.toBeNull();
    expect(detail?.name).toBe("Alpha Traders");
    expect(detail?.slug).toBe("alpha-traders");
    expect(detail?.summary).toBe("Premium consumer-goods distributor.");
    expect(detail?.originCountry).toBe("Saudi Arabia");
    expect(detail?.history).toBe("Established in Jeddah.");
    expect(detail?.distribution).toBe("Kingdom-wide distribution.");
    expect(detail?.website).toBeNull();
    expect(detail?.categories.map((category) => category.slug)).toEqual([
      "personal-care",
    ]);
    // Only the brand's own PUBLISHED products appear (hidden records excluded).
    expect(detail?.products.map((product) => product.slug)).toEqual([
      "alpha-saudi",
      "alpha-germany",
    ]);
  });

  it("resolves brand detail in Arabic (slug and fields)", async () => {
    await seedBaseline();

    const detail = await brandDetail("ar", "alpha-traders-ar");

    expect(detail).not.toBeNull();
    expect(detail?.name).toBe("ألفا للتجارة");
    expect(detail?.originCountry).toBe("السعودية");
    expect(detail?.history).toBe("تأسست في جدة.");
    expect(detail?.products.map((product) => product.slug)).toEqual([
      "alpha-saudi-ar",
      "alpha-germany-ar",
    ]);
  });
});

describe("locale resolution & fallback", () => {
  it("resolves Arabic names/slugs for the catalog lists", async () => {
    await seedBaseline();

    const brands = await listPublishedBrands("ar");
    expect(brands.map((brand) => brand.name)).toEqual(["ألفا للتجارة", "بيتا"]);
    expect(brands.map((brand) => brand.slug)).toEqual([
      "alpha-traders-ar",
      "beta-gmbh-ar",
    ]);

    const products = await listPublishedProducts("ar");
    expect(products.map((product) => product.name)).toEqual([
      "تشكيلات ألفا السعودية",
      "إصدار بيتا الألماني",
      "خط ألفا الألماني",
      "بيتا متعدد الفئات",
    ]);
    expect(products.map((product) => product.slug)).toEqual([
      "alpha-saudi-ar",
      "beta-germany-ar",
      "alpha-germany-ar",
      "beta-multi-ar",
    ]);
  });

  it("falls back to the available approved variant when the active locale lacks a value", async () => {
    await seedBaseline();

    // brandBeta has summaryAr = null -> the ar view falls back to the English
    // approved summary (spec "Missing translation" edge case, T027 helper).
    const beta = (await listPublishedBrands("ar")).find(
      (brand) => brand.slug === "beta-gmbh-ar",
    );
    expect(beta?.name).toBe("بيتا");
    expect(beta?.summary).toBe("European specialty goods importer.");
  });
});

describe("slug redirects (US10.3 behavior wired through catalog details)", () => {
  it("resolves an old slug to the redirected entity's canonical slug", async () => {
    const fixture = await seedBaseline();
    const user = fixture.user;

    const renamed = await prisma.brand.create({
      data: {
        nameEn: "Renamed Brand",
        nameAr: "العلامة المحدثة",
        slugEn: "renamed-new",
        slugAr: "renamed-new-ar",
        status: "published",
        isActive: true,
        sortOrder: 10,
        createdById: user.id,
      },
    });
    await prisma.slugRedirect.create({
      data: {
        entityType: "brand",
        locale: "en",
        oldSlug: "renamed-old",
        newSlug: "renamed-new",
      },
    });

    const detail = await brandDetail("en", "renamed-old");

    expect(detail).not.toBeNull();
    expect(detail?.id).toBe(renamed.id);
    expect(detail?.slug).toBe("renamed-new");
  });

  it("never shadows a live entity slug with a stale redirect (chain guard)", async () => {
    await seedBaseline();

    // "alpha-traders" is a live published brand slug. A stale redirect maps it
    // elsewhere; the live entity MUST win (data-model §2.11 chain guard).
    await prisma.slugRedirect.create({
      data: {
        entityType: "brand",
        locale: "en",
        oldSlug: "alpha-traders",
        newSlug: "renamed-x",
      },
    });

    const detail = await brandDetail("en", "alpha-traders");

    expect(detail).not.toBeNull();
    expect(detail?.name).toBe("Alpha Traders");
    expect(detail?.slug).toBe("alpha-traders");
  });

  it("resolves product slug redirects as well", async () => {
    const fixture = await seedBaseline();
    const user = fixture.user;
    const alpha = fixture.brands.get("brandAlpha")!;

    const renamed = await prisma.product.create({
      data: {
        brandId: alpha.id,
        nameEn: "Renamed Product",
        nameAr: "المنتج المحدث",
        slugEn: "pd-new",
        slugAr: "pd-new-ar",
        status: "published",
        isActive: true,
        sortOrder: 11,
        createdById: user.id,
      },
    });
    await prisma.productCategory.create({
      data: {
        productId: renamed.id,
        categoryId: fixture.categories.get("catPublished")!.id,
      },
    });
    await prisma.slugRedirect.create({
      data: {
        entityType: "product",
        locale: "en",
        oldSlug: "pd-old",
        newSlug: "pd-new",
      },
    });

    const detail = await productDetail("en", "pd-old");

    expect(detail).not.toBeNull();
    expect(detail?.id).toBe(renamed.id);
    expect(detail?.slug).toBe("pd-new");
  });
});

describe("zero-record catalog (localized empty state source, never a blank page)", () => {
  it("returns an empty list and null details without throwing", async () => {
    await ensureTestUser();

    expect(await listPublishedBrands("en")).toEqual([]);
    expect(await listPublishedProducts("en")).toEqual([]);
    expect(await listPublishedProducts("ar")).toEqual([]);
    expect(await productDetail("en", "anything")).toBeNull();
    expect(await brandDetail("en", "anything")).toBeNull();
  });
});

describe("resolveLocalizedSlug — cross-locale slug resolution (BUG-002)", () => {
  it("maps the other locale's product slug to the target locale's canonical pair", async () => {
    await seedBaseline();

    // Incoming English slug requested for the Arabic locale (a naive locale
    // switch that only swaps the prefix) resolves to the Arabic pair.
    expect(await resolveLocalizedSlug("product", "ar", "alpha-saudi")).toEqual({
      slug: "alpha-saudi-ar",
      alternateSlug: "alpha-saudi",
    });
    expect(await resolveLocalizedSlug("product", "en", "alpha-saudi-ar")).toEqual(
      {
        slug: "alpha-saudi",
        alternateSlug: "alpha-saudi-ar",
      },
    );
  });

  it("returns the same pair for the product's own-locale slug (no redirect target)", async () => {
    await seedBaseline();

    expect(await resolveLocalizedSlug("product", "en", "alpha-saudi")).toEqual({
      slug: "alpha-saudi",
      alternateSlug: "alpha-saudi-ar",
    });
  });

  it("resolves brand slugs across locales", async () => {
    await seedBaseline();

    expect(await resolveLocalizedSlug("brand", "ar", "alpha-traders")).toEqual({
      slug: "alpha-traders-ar",
      alternateSlug: "alpha-traders",
    });
    expect(await resolveLocalizedSlug("brand", "en", "alpha-traders-ar")).toEqual(
      {
        slug: "alpha-traders",
        alternateSlug: "alpha-traders-ar",
      },
    );
  });

  it("never resolves unknown or unpublished entities (no orphan public URLs)", async () => {
    await seedBaseline();

    expect(await resolveLocalizedSlug("product", "en", "does-not-exist")).toBeNull();
    expect(await resolveLocalizedSlug("brand", "en", "does-not-exist")).toBeNull();
    // Published product hidden by an inactive brand.
    expect(
      await resolveLocalizedSlug("product", "en", "hidden-inactive-brand"),
    ).toBeNull();
    // Draft and archived products are not published.
    expect(await resolveLocalizedSlug("product", "en", "draft-product")).toBeNull();
    expect(await resolveLocalizedSlug("product", "en", "archived-product")).toBeNull();
    expect(await resolveLocalizedSlug("brand", "en", "draft-brand")).toBeNull();
  });
});