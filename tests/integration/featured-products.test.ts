import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { getHomeExperience } from "@/server/services/content";
import {
  HOME_CONTENT_AR,
  HOME_CONTENT_EN,
} from "../../prisma/seed-content";

/**
 * FR-006 / FR-038 — Home CMS "Featured products (slugs)" → public homepage.
 *
 * Staff curate a slug list in Home CMS; the public homepage resolves it to
 * published+active products that ALSO reference a published+active brand and
 * at least one published+active category (the directory's orphan-proof
 * predicate, data-model §2.4), preserving the curated order. Matching is
 * permissive in one direction only — a slug published in either locale column
 * resolves the product (exact first, then case-insensitive). Unknown or
 * non-complying slugs are skipped server-side and logged.
 */

const TEST_ADMIN = {
  email: "featured-products-test-admin@zainagency.test",
  name: "Featured Products Test Admin",
  passwordHash: "not-a-real-hash-integration-fixture",
  role: "SuperAdmin" as const,
};

const EXPECTED_PRODUCTS = [
  { nameEn: "Alpha Cleaner", slugEn: "alpha-cleaner", slugAr: "alpha-cleaner-ar" },
  { nameEn: "Beta Shampoo", slugEn: "beta-shampoo", slugAr: "beta-shampoo-ar" },
  { nameEn: "Gamma Lotion", slugEn: "gamma-lotion", slugAr: "gamma-lotion-ar" },
  { nameEn: "Delta Soap", slugEn: "delta-soap", slugAr: "delta-soap-ar" },
  { nameEn: "Epsilon Cream", slugEn: "epsilon-cream", slugAr: "epsilon-cream-ar" },
  { nameEn: "Zeta Oil", slugEn: "zeta-oil", slugAr: "zeta-oil-ar" },
] as const;

const EXPECTED_NAMES = EXPECTED_PRODUCTS.map((product) => product.nameEn);

const FIXTURE_PRODUCT_SLUGS = [
  ...EXPECTED_PRODUCTS.flatMap((product) => [product.slugEn, product.slugAr]),
  "draft-product-fp",
  "draft-product-fp-ar",
  "inactive-product-fp",
  "inactive-product-fp-ar",
  "archived-product-fp",
  "archived-product-fp-ar",
  "orphan-product-fp",
  "orphan-product-fp-ar",
  "uncategorized-product-fp",
  "uncategorized-product-fp-ar",
  "unlisted-product-fp",
  "unlisted-product-fp-ar",
];

// Products that must never surface (as a group) — keep separate slugs clean.
const FIXTURE_BRAND_SLUGS = ["fp-brand-published", "fp-brand-published-ar", "fp-brand-draft", "fp-brand-draft-ar"];
const FIXTURE_CATEGORY_SLUGS = [
  "fp-category-published",
  "fp-category-published-ar",
  "fp-category-draft",
  "fp-category-draft-ar",
];
const FIXTURE_MEDIA_KEYS = ["featured-products-media-a", "featured-products-media-b"];

async function ensureTestUser() {
  return prisma.user.upsert({
    where: { email: TEST_ADMIN.email },
    create: TEST_ADMIN,
    update: {},
  });
}

async function insertPublishedSection(
  sectionKey: "home" | "about" | "contact",
  locale: "en" | "ar",
  published: unknown,
  draft: unknown = {},
) {
  const user = await ensureTestUser();
  return prisma.cmsSection.create({
    data: {
      sectionKey,
      locale,
      draftContent: draft as object,
      publishedContent: published as object,
      publishedAt: new Date(),
      createdById: user.id,
    },
  });
}

async function insertBaseFixtures() {
  const user = await ensureTestUser();

  const publishedBrand = await prisma.brand.create({
    data: {
      nameEn: "FP Published Brand",
      nameAr: "FP Published Brand",
      slugEn: "fp-brand-published",
      slugAr: "fp-brand-published-ar",
      status: "published",
      isActive: true,
      sortOrder: 1,
      createdById: user.id,
    },
  });
  const draftBrand = await prisma.brand.create({
    data: {
      nameEn: "FP Draft Brand",
      nameAr: "FP Draft Brand",
      slugEn: "fp-brand-draft",
      slugAr: "fp-brand-draft-ar",
      status: "draft",
      isActive: true,
      sortOrder: 2,
      createdById: user.id,
    },
  });

  const publishedCategory = await prisma.category.create({
    data: {
      kind: "product",
      nameEn: "FP Published Category",
      nameAr: "FP Published Category",
      slugEn: "fp-category-published",
      slugAr: "fp-category-published-ar",
      status: "published",
      isActive: true,
      sortOrder: 1,
      createdById: user.id,
    },
  });
  const draftCategory = await prisma.category.create({
    data: {
      kind: "product",
      nameEn: "FP Draft Category",
      nameAr: "FP Draft Category",
      slugEn: "fp-category-draft",
      slugAr: "fp-category-draft-ar",
      status: "draft",
      isActive: true,
      sortOrder: 2,
      createdById: user.id,
    },
  });

  // Two media rows to exercise the "primary image = lowest sortOrder" rule.
  const mediaA = await prisma.media.create({
    data: {
      kind: "image",
      mimeType: "image/webp",
      byteSize: 2048,
      storageKey: "featured-products-media-a",
      originalName: "a.webp",
      sha256: "aa".repeat(32),
      altEn: "Fixture media A",
      altAr: "Fixture media A",
      uploadedById: user.id,
    },
  });
  const mediaB = await prisma.media.create({
    data: {
      kind: "image",
      mimeType: "image/webp",
      byteSize: 2048,
      storageKey: "featured-products-media-b",
      originalName: "b.webp",
      sha256: "bb".repeat(32),
      altEn: "Fixture media B",
      altAr: "Fixture media B",
      uploadedById: user.id,
    },
  });

  const createProduct = (data: {
    nameEn: string;
    slugEn: string;
    slugAr: string;
    status: "published" | "draft" | "archived";
    isActive: boolean;
    sortOrder: number;
    brandId: string;
  }) =>
    prisma.product.create({
      data: {
        brandId: data.brandId,
        nameEn: data.nameEn,
        nameAr: data.nameEn,
        slugEn: data.slugEn,
        slugAr: data.slugAr,
        summaryEn: `${data.nameEn} summary`,
        summaryAr: `${data.nameEn} summary`,
        status: data.status,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
        createdById: user.id,
      },
    });

  const six = await Promise.all(
    EXPECTED_PRODUCTS.map((product, index) =>
      createProduct({
        nameEn: product.nameEn,
        slugEn: product.slugEn,
        slugAr: product.slugAr,
        status: "published",
        isActive: true,
        sortOrder: index,
        brandId: publishedBrand.id,
      }),
    ),
  );
  const [alphaCleaner] = six;

  await prisma.productCategory.createMany({
    data: six.map((product) => ({
      productId: product.id,
      categoryId: publishedCategory.id,
    })),
  });

  await prisma.productImage.createMany({
    data: [
      { productId: alphaCleaner.id, mediaId: mediaB.id, sortOrder: 2 },
      { productId: alphaCleaner.id, mediaId: mediaA.id, sortOrder: 1 },
    ],
  });

  // Distractors — none of these may surface through the curated slug list.
  const distractors = await Promise.all([
    createProduct({
      nameEn: "Draft Product Fixture",
      slugEn: "draft-product-fp",
      slugAr: "draft-product-fp-ar",
      status: "draft",
      isActive: true,
      sortOrder: 90,
      brandId: publishedBrand.id,
    }),
    createProduct({
      nameEn: "Inactive Product Fixture",
      slugEn: "inactive-product-fp",
      slugAr: "inactive-product-fp-ar",
      status: "published",
      isActive: false,
      sortOrder: 91,
      brandId: publishedBrand.id,
    }),
    createProduct({
      nameEn: "Archived Product Fixture",
      slugEn: "archived-product-fp",
      slugAr: "archived-product-fp-ar",
      status: "archived",
      isActive: true,
      sortOrder: 92,
      brandId: publishedBrand.id,
    }),
    createProduct({
      nameEn: "Orphan Brand Product Fixture",
      slugEn: "orphan-product-fp",
      slugAr: "orphan-product-fp-ar",
      status: "published",
      isActive: true,
      sortOrder: 93,
      brandId: draftBrand.id, // its brand is not published
    }),
    createProduct({
      nameEn: "Uncategorized Product Fixture",
      slugEn: "uncategorized-product-fp",
      slugAr: "uncategorized-product-fp-ar",
      status: "published",
      isActive: true,
      sortOrder: 94,
      brandId: publishedBrand.id,
    }),
    createProduct({
      nameEn: "Unlisted Product Fixture",
      slugEn: "unlisted-product-fp",
      slugAr: "unlisted-product-fp-ar",
      status: "published",
      isActive: true,
      sortOrder: 95,
      brandId: publishedBrand.id,
    }),
  ]);

  // Distractors (except the intentionally uncategorized one) are linked to
  // the published category so only the intended predicate excludes them.
  await prisma.productCategory.createMany({
    data: distractors
      .filter((product) => product.slugEn !== "uncategorized-product-fp")
      .map((product) => ({
        productId: product.id,
        categoryId: publishedCategory.id,
      })),
  });
  // The uncategorized product only references the draft category.
  const uncategorized = distractors.find((product) => product.slugEn === "uncategorized-product-fp")!;
  await prisma.productCategory.create({
    data: { productId: uncategorized.id, categoryId: draftCategory.id },
  });

  return { mediaA, mediaB };
}

beforeEach(async () => {
  await prisma.cmsSection.deleteMany({});
  await prisma.productImage.deleteMany({
    where: { product: { slugEn: { in: FIXTURE_PRODUCT_SLUGS } } },
  });
  await prisma.productCategory.deleteMany({
    where: { product: { slugEn: { in: FIXTURE_PRODUCT_SLUGS } } },
  });
  await prisma.product.deleteMany({ where: { slugEn: { in: FIXTURE_PRODUCT_SLUGS } } });
  await prisma.brand.deleteMany({ where: { slugEn: { in: FIXTURE_BRAND_SLUGS } } });
  await prisma.category.deleteMany({ where: { slugEn: { in: FIXTURE_CATEGORY_SLUGS } } });
  await prisma.media.deleteMany({ where: { storageKey: { in: FIXTURE_MEDIA_KEYS } } });
});

describe("Home CMS featured products → public home experience (FR-006)", () => {
  it("resolves all six curated slugs to published products, in curated order", async () => {
    await insertBaseFixtures();
    await insertPublishedSection("home", "en", {
      ...HOME_CONTENT_EN,
      featuredProducts: EXPECTED_PRODUCTS.map((product) => product.slugEn),
    });

    const experience = await getHomeExperience("en");

    expect(experience.featuredProducts.map((product) => product.name)).toEqual(EXPECTED_NAMES);
    expect(experience.featuredProducts.map((product) => product.slug)).toEqual(
      EXPECTED_PRODUCTS.map((product) => product.slugEn),
    );
    expect(experience.featuredProducts.every((product) => product.brand.name === "FP Published Brand")).toBe(
      true,
    );
  });

  it("returns the curated order, not the database sortOrder", async () => {
    await insertBaseFixtures();
    const reversed = EXPECTED_PRODUCTS.map((product) => product.slugEn).reverse();
    await insertPublishedSection("home", "en", {
      ...HOME_CONTENT_EN,
      featuredProducts: reversed,
    });

    const experience = await getHomeExperience("en");

    expect(experience.featuredProducts.map((product) => product.slug)).toEqual(reversed);
  });

  it("matches slugs case-insensitively and trims whitespace (staff input)", async () => {
    await insertBaseFixtures();
    await insertPublishedSection("home", "en", {
      ...HOME_CONTENT_EN,
      featuredProducts: ["Alpha-Cleaner", " DELTA-SOAP ", "Gamma-Lotion"],
    });

    const experience = await getHomeExperience("en");

    expect(experience.featuredProducts.map((product) => product.name)).toEqual([
      "Alpha Cleaner",
      "Delta Soap",
      "Gamma Lotion",
    ]);
  });

  it("resolves slugs from either locale column — en slugs in the ar section", async () => {
    await insertBaseFixtures();
    await insertPublishedSection("home", "ar", {
      ...HOME_CONTENT_AR,
      featuredProducts: EXPECTED_PRODUCTS.map((product) => product.slugEn),
    });

    const experience = await getHomeExperience("ar");

    expect(experience.featuredProducts.map((product) => product.name)).toEqual(EXPECTED_NAMES);
  });

  it("resolves Arabic slugs for the ar section (per-locale slugs, FR-004)", async () => {
    await insertBaseFixtures();
    await insertPublishedSection("home", "ar", {
      ...HOME_CONTENT_AR,
      featuredProducts: EXPECTED_PRODUCTS.map((product) => product.slugAr),
    });

    const experience = await getHomeExperience("ar");

    expect(experience.featuredProducts.map((product) => product.slug)).toEqual(
      EXPECTED_PRODUCTS.map((product) => product.slugAr),
    );
  });

  it("excludes draft, inactive and archived products even when curated — published+active only", async () => {
    await insertBaseFixtures();
    await insertPublishedSection("home", "en", {
      ...HOME_CONTENT_EN,
      featuredProducts: [
        "draft-product-fp",
        "inactive-product-fp",
        "archived-product-fp",
        "alpha-cleaner",
      ],
    });

    const experience = await getHomeExperience("en");

    expect(experience.featuredProducts.map((product) => product.slug)).toEqual(["alpha-cleaner"]);
  });

  it("excludes products whose brand is not published (orphan-proof, data-model §2.4)", async () => {
    await insertBaseFixtures();
    await insertPublishedSection("home", "en", {
      ...HOME_CONTENT_EN,
      featuredProducts: ["orphan-product-fp", "alpha-cleaner"],
    });

    const experience = await getHomeExperience("en");

    expect(experience.featuredProducts.map((product) => product.slug)).toEqual(["alpha-cleaner"]);
  });

  it("excludes products without a published+active category (orphan-proof, data-model §2.4)", async () => {
    await insertBaseFixtures();
    await insertPublishedSection("home", "en", {
      ...HOME_CONTENT_EN,
      featuredProducts: ["uncategorized-product-fp", "alpha-cleaner"],
    });

    const experience = await getHomeExperience("en");

    expect(experience.featuredProducts.map((product) => product.slug)).toEqual(["alpha-cleaner"]);
  });

  it("does not surface a published product that is not curated (FR-038)", async () => {
    await insertBaseFixtures();
    await insertPublishedSection("home", "en", {
      ...HOME_CONTENT_EN,
      featuredProducts: ["alpha-cleaner"],
    });

    const experience = await getHomeExperience("en");

    expect(experience.featuredProducts.map((product) => product.slug)).toEqual(["alpha-cleaner"]);
  });

  it("skips unknown slugs without dropping the valid ones", async () => {
    await insertBaseFixtures();
    await insertPublishedSection("home", "en", {
      ...HOME_CONTENT_EN,
      featuredProducts: ["alpha-cleaner", "no-such-product", "zeta-oil"],
    });

    const experience = await getHomeExperience("en");

    expect(experience.featuredProducts.map((product) => product.name)).toEqual([
      "Alpha Cleaner",
      "Zeta Oil",
    ]);
  });

  it("deduplicates a product curated twice (both slugs of the same product)", async () => {
    await insertBaseFixtures();
    await insertPublishedSection("home", "en", {
      ...HOME_CONTENT_EN,
      featuredProducts: ["alpha-cleaner", "alpha-cleaner-ar"],
    });

    const experience = await getHomeExperience("en");

    expect(experience.featuredProducts).toHaveLength(1);
    expect(experience.featuredProducts[0]?.name).toBe("Alpha Cleaner");
  });

  it("resolves the primary image as the lowest sortOrder, and null when none exists", async () => {
    const { mediaA } = await insertBaseFixtures();
    await insertPublishedSection("home", "en", {
      ...HOME_CONTENT_EN,
      featuredProducts: ["alpha-cleaner", "beta-shampoo"],
    });

    const experience = await getHomeExperience("en");

    expect(experience.featuredProducts[0]?.primaryImageMediaId).toBe(mediaA.id);
    expect(experience.featuredProducts[1]?.primaryImageMediaId).toBeNull();
  });

  it("returns an empty list when nothing is curated (seeded default)", async () => {
    await insertBaseFixtures();
    await insertPublishedSection("home", "en", HOME_CONTENT_EN);

    const experience = await getHomeExperience("en");

    expect(experience.featuredProducts).toEqual([]);
  });

  it("returns an empty list when the home section was never published", async () => {
    const experience = await getHomeExperience("en");

    expect(experience.featuredProducts).toEqual([]);
  });

  it("keeps featured brands and featured products independent of each other", async () => {
    await insertBaseFixtures();
    await insertPublishedSection("home", "en", {
      ...HOME_CONTENT_EN,
      featuredProducts: ["alpha-cleaner"],
      featuredBrands: ["does-not-exist"],
    });

    const experience = await getHomeExperience("en");

    expect(experience.featuredProducts.map((product) => product.slug)).toEqual(["alpha-cleaner"]);
    expect(experience.featuredBrands).toEqual([]);
  });
});
