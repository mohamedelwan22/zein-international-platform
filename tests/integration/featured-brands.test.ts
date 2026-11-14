import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { getHomeExperience } from "@/server/services/content";
import {
  HOME_CONTENT_AR,
  HOME_CONTENT_EN,
} from "../../prisma/seed-content";

/**
 * FR-006 / FR-038 — Home CMS "Featured brands (slugs)" → public homepage data.
 *
 * Staff curate a slug list in Home CMS; the public homepage resolves it to
 * published+active brands (never draft/archived/inactive), preserving the
 * curated order. Matching is permissive in one direction only: a slug may be
 * entered against either locale column, case-insensitively. Unknown slugs are
 * skipped server-side and logged — they never render publicly.
 *
 * Fixtures use the six brands curated by the business (Japlo, Angel Stone &
 * Natur, Jasper, R&R, TITANIA, El Shorouk) against a disposable test database.
 */

const TEST_ADMIN = {
  email: "featured-brands-test-admin@zainagency.test",
  name: "Featured Brands Test Admin",
  passwordHash: "not-a-real-hash-integration-fixture",
  role: "SuperAdmin" as const,
};

const EXPECTED_BRANDS = [
  { nameEn: "Japlo", slugEn: "japlo", slugAr: "japlo-ar" },
  { nameEn: "Angel Stone & Natur", slugEn: "angel-stone-natur", slugAr: "angel-stone-natur-ar" },
  { nameEn: "Jasper", slugEn: "jasper", slugAr: "jasper-ar" },
  { nameEn: "R&R", slugEn: "r-r", slugAr: "r-r-ar" },
  { nameEn: "TITANIA", slugEn: "titania", slugAr: "titania-ar" },
  { nameEn: "El Shorouk", slugEn: "el-shorouk", slugAr: "el-shorouk-ar" },
] as const;

const EXPECTED_NAMES = EXPECTED_BRANDS.map((brand) => brand.nameEn);
const FIXTURE_SLUGS = [
  ...EXPECTED_BRANDS.flatMap((brand) => [brand.slugEn, brand.slugAr]),
  "featured-brands-archived",
  "featured-brands-archived-ar",
  "featured-brands-draft",
  "featured-brands-draft-ar",
  "featured-brands-inactive",
  "featured-brands-inactive-ar",
  "featured-brands-unlisted",
  "featured-brands-unlisted-ar",
];

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

async function insertFixtureBrands() {
  const user = await ensureTestUser();
  const rows = [
    ...EXPECTED_BRANDS.map((brand, index) => ({
      nameEn: brand.nameEn,
      nameAr: brand.nameEn,
      slugEn: brand.slugEn,
      slugAr: brand.slugAr,
      status: "published" as const,
      isActive: true,
      featured: false,
      sortOrder: index,
      createdById: user.id,
    })),
    // Distractors: none of these may surface through the curated slug list.
    {
      nameEn: "Inactive Featured Brand",
      nameAr: "Inactive Featured Brand",
      slugEn: "featured-brands-archived",
      slugAr: "featured-brands-archived-ar",
      status: "published" as const,
      isActive: false, // published but visibility = false → hidden
      featured: true,
      sortOrder: 90,
      createdById: user.id,
    },
    {
      nameEn: "Draft Featured Brand",
      nameAr: "Draft Featured Brand",
      slugEn: "featured-brands-draft",
      slugAr: "featured-brands-draft-ar",
      status: "draft" as const,
      isActive: true,
      featured: true,
      sortOrder: 91,
      createdById: user.id,
    },
    {
      nameEn: "Archived Status Featured Brand",
      nameAr: "Archived Status Featured Brand",
      slugEn: "featured-brands-inactive",
      slugAr: "featured-brands-inactive-ar",
      status: "archived" as const,
      isActive: true,
      featured: true,
      sortOrder: 92,
      createdById: user.id,
    },
    {
      nameEn: "Unlisted Published Brand",
      nameAr: "Unlisted Published Brand",
      slugEn: "featured-brands-unlisted",
      slugAr: "featured-brands-unlisted-ar",
      status: "published" as const,
      isActive: true,
      featured: true, // the `featured` flag alone must NOT surface it (FR-038)
      sortOrder: 93,
      createdById: user.id,
    },
  ];
  for (const row of rows) {
    await prisma.brand.create({ data: row });
  }
}

beforeEach(async () => {
  await prisma.cmsSection.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.brand.deleteMany({
    where: {
      OR: FIXTURE_SLUGS.flatMap((slug) => [{ slugEn: slug }, { slugAr: slug }]),
    },
  });
});

describe("Home CMS featured brands → public home experience (FR-006)", () => {
  it("resolves all six curated slugs to published brands, in curated order", async () => {
    await insertFixtureBrands();
    await insertPublishedSection("home", "en", {
      ...HOME_CONTENT_EN,
      featuredBrands: [...EXPECTED_BRANDS.map((brand) => brand.slugEn)],
    });

    const experience = await getHomeExperience("en");

    expect(experience.featuredBrands.map((brand) => brand.name)).toEqual(EXPECTED_NAMES);
    expect(experience.featuredBrands.map((brand) => brand.slug)).toEqual(
      EXPECTED_BRANDS.map((brand) => brand.slugEn),
    );
  });

  it("returns the curated order, not the database sortOrder", async () => {
    await insertFixtureBrands();
    const reversed = [...EXPECTED_BRANDS.map((brand) => brand.slugEn)].reverse();
    await insertPublishedSection("home", "en", {
      ...HOME_CONTENT_EN,
      featuredBrands: reversed,
    });

    const experience = await getHomeExperience("en");

    expect(experience.featuredBrands.map((brand) => brand.slug)).toEqual(reversed);
  });

  it("matches slugs case-insensitively and trims whitespace (staff input)", async () => {
    await insertFixtureBrands();
    await insertPublishedSection("home", "en", {
      ...HOME_CONTENT_EN,
      featuredBrands: ["Japlo", " TITANIA ", "Angel-stone-Natur"],
    });

    const experience = await getHomeExperience("en");

    expect(experience.featuredBrands.map((brand) => brand.name)).toEqual([
      "Japlo",
      "TITANIA",
      "Angel Stone & Natur",
    ]);
  });

  it("resolves slugs from either locale column — en slugs in the ar section", async () => {
    await insertFixtureBrands();
    await insertPublishedSection("home", "ar", {
      ...HOME_CONTENT_AR,
      featuredBrands: EXPECTED_BRANDS.map((brand) => brand.slugEn),
    });

    const experience = await getHomeExperience("ar");

    expect(experience.featuredBrands.map((brand) => brand.name)).toEqual(EXPECTED_NAMES);
  });

  it("resolves Arabic slugs for the ar section (per-locale slugs, FR-004)", async () => {
    await insertFixtureBrands();
    await insertPublishedSection("home", "ar", {
      ...HOME_CONTENT_AR,
      featuredBrands: EXPECTED_BRANDS.map((brand) => brand.slugAr),
    });

    const experience = await getHomeExperience("ar");

    expect(experience.featuredBrands.map((brand) => brand.slug)).toEqual(
      EXPECTED_BRANDS.map((brand) => brand.slugAr),
    );
  });

  it("excludes inactive, draft and archived-status brands even when curated — published+active only", async () => {
    await insertFixtureBrands();
    await insertPublishedSection("home", "en", {
      ...HOME_CONTENT_EN,
      featuredBrands: [
        "featured-brands-archived", // published status, but isActive = false
        "featured-brands-draft",    // draft
        "featured-brands-inactive", // archived status
        "japlo",
      ],
    });

    const experience = await getHomeExperience("en");

    expect(experience.featuredBrands.map((brand) => brand.slug)).toEqual(["japlo"]);
  });

  it("does not surface the `featured` flag by itself — only the curated slug list (FR-038)", async () => {
    await insertFixtureBrands();
    await insertPublishedSection("home", "en", {
      ...HOME_CONTENT_EN,
      featuredBrands: ["japlo"],
    });

    const experience = await getHomeExperience("en");

    // featured-brands-unlisted is published+active+featured but NOT curated.
    expect(experience.featuredBrands.map((brand) => brand.slug)).toEqual(["japlo"]);
  });

  it("skips unknown slugs without dropping the valid ones", async () => {
    await insertFixtureBrands();
    await insertPublishedSection("home", "en", {
      ...HOME_CONTENT_EN,
      featuredBrands: ["japlo", "no-such-brand", "el-shorouk"],
    });

    const experience = await getHomeExperience("en");

    expect(experience.featuredBrands.map((brand) => brand.name)).toEqual([
      "Japlo",
      "El Shorouk",
    ]);
  });

  it("deduplicates a brand curated twice (both slugs of the same brand)", async () => {
    await insertFixtureBrands();
    await insertPublishedSection("home", "en", {
      ...HOME_CONTENT_EN,
      featuredBrands: ["japlo", "japlo-ar"],
    });

    const experience = await getHomeExperience("en");

    expect(experience.featuredBrands).toHaveLength(1);
    expect(experience.featuredBrands[0]?.name).toBe("Japlo");
  });

  it("returns an empty list when nothing is curated (seeded default)", async () => {
    await insertPublishedSection("home", "en", HOME_CONTENT_EN);

    const experience = await getHomeExperience("en");

    expect(experience.featuredBrands).toEqual([]);
  });

  it("returns an empty list when the home section was never published", async () => {
    const experience = await getHomeExperience("en");

    expect(experience.featuredBrands).toEqual([]);
  });
});
