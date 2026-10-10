import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { getPublishedSection } from "@/server/services/cms";
import { getSettings } from "@/server/services/settings";
import { getHomeExperience } from "@/server/services/content";
import {
  ABOUT_CONTENT_AR,
  ABOUT_CONTENT_EN,
  CONTACT_INFO_AR,
  CONTACT_INFO_EN,
  HOME_CONTENT_AR,
  HOME_CONTENT_EN,
} from "../../prisma/seed-content";

/**
 * T028 [US1] — public content reads (integration).
 *
 * Verifies the publication predicate end-to-end against a real database:
 * - published CmsSection / Settings reads return the approved seeded content;
 * - unpublished sections (publishedContent = null) return null;
 * - draft content NEVER leaks to the public read path (publish safety);
 * - homepage statistics render ONLY when `approved` is true — the
 *   "50 years of success" wording must never be returned as a factual
 *   counter (FR-007, Constitution III);
 * - the Home category preview serves only published dynamic categories.
 */

const TEST_ADMIN = {
  email: "content-test-admin@zainagency.test",
  name: "Content Test Admin",
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

beforeEach(async () => {
  await prisma.cmsSection.deleteMany({});
  await prisma.settings.deleteMany({});
  await prisma.category.deleteMany({});
});

describe("getPublishedSection (publication predicate, T030)", () => {
  it("returns the approved published content for the requested locale", async () => {
    await insertPublishedSection("home", "en", HOME_CONTENT_EN);

    const section = await getPublishedSection("home", "en");

    expect(section).not.toBeNull();
    expect(section?.hero.headline).toBe("Saudi Authenticity international quality");
    expect(section?.hero.supporting).toContain("1394 AH");
    expect(section?.mission.body).toBe(HOME_CONTENT_EN.mission.body);
  });

  it("returns the Arabic approved variant for the ar locale", async () => {
    await insertPublishedSection("about", "ar", ABOUT_CONTENT_AR);

    const section = await getPublishedSection("about", "ar");

    expect(section).not.toBeNull();
    expect(section?.story).toHaveLength(ABOUT_CONTENT_AR.story.length);
    expect(section?.values).toHaveLength(7);
    expect(section?.values[0]?.title).toBe("الجودة");
  });

  it("returns null when the section has never been published", async () => {
    const user = await ensureTestUser();
    await prisma.cmsSection.create({
      data: {
        sectionKey: "home",
        locale: "ar",
        draftContent: HOME_CONTENT_AR,
        createdById: user.id,
      },
    });

    expect(await getPublishedSection("home", "ar")).toBeNull();
  });

  it("returns null for an unknown section", async () => {
    expect(await getPublishedSection("contact", "en")).toBeNull();
  });

  it("never leaks draft content — only the published payload is returned (SC-005 publish safety)", async () => {
    await insertPublishedSection(
      "about",
      "en",
      ABOUT_CONTENT_EN,
      { ...ABOUT_CONTENT_EN, profile: ["UNPUBLISHED DRAFT COPY"] },
    );

    const section = await getPublishedSection("about", "en");

    expect(section?.profile).toEqual(ABOUT_CONTENT_EN.profile);
    expect(JSON.stringify(section)).not.toContain("UNPUBLISHED DRAFT COPY");
  });
});

describe("getSettings (approved settings reads, T031)", () => {
  it("returns the approved contact details per locale (FR-014)", async () => {
    await prisma.settings.create({
      data: {
        key: "contact_info",
        valueEn: CONTACT_INFO_EN,
        valueAr: CONTACT_INFO_AR,
      },
    });

    const en = await getSettings("contact_info", "en");
    expect(en?.address).toBe("23337 King Fahd Road");
    expect(en?.city).toBe("Jeddah");
    expect(en?.district).toBe("Aziziyah District");
    expect(en?.phones).toEqual(["0126747594", "0126747595"]);
    expect(en?.email).toBe("ahmed@zainagency.com");
    expect(en?.website).toBe("Zainagency.com");

    const ar = await getSettings("contact_info", "ar");
    expect(ar?.address).toBe("23337 طريق الملك فهد");
    expect(ar?.city).toBe("جدة");
    expect(ar?.phones).toEqual(["0126747594", "0126747595"]);
    expect(ar?.email).toBe("ahmed@zainagency.com");
  });

  it("returns null for keys without approved content (Open Item 6 — never blocks, never invents)", async () => {
    expect(await getSettings("privacy_notice", "en")).toBeNull();
    expect(await getSettings("working_hours", "ar")).toBeNull();
    expect(await getSettings("social_links", "en")).toBeNull();
  });

  it("returns null for an unknown settings key", async () => {
    // The compile-time key union prevents unknown keys in application code;
    // this exercises the runtime guard for malformed callers.
    expect(await getSettings("not_a_real_key" as "privacy_notice", "en")).toBeNull();
  });
});

describe("home experience (FR-007 statistics gating, FR-038 content-driven copy)", () => {
  it("renders ONLY approved statistics — the unapproved '50 years' claim is never returned", async () => {
    await insertPublishedSection("home", "en", {
      ...HOME_CONTENT_EN,
      statistics: [
        { label: "50 years of success", value: "50", approved: false },
        { label: "Established", value: "1394 AH", approved: true },
      ],
    });

    const experience = await getHomeExperience("en");

    expect(experience.statistics).toEqual([{ label: "Established", value: "1394 AH" }]);
    const serialized = JSON.stringify(experience);
    expect(serialized).not.toContain("50 years");
    expect(serialized).not.toContain('"value":"50"');
  });

  it("serves business copy from the CMS section — not hardcoded components (FR-038)", async () => {
    await insertPublishedSection("home", "en", HOME_CONTENT_EN);

    const experience = await getHomeExperience("en");

    expect(experience.hero).not.toBeNull();
    expect(experience.hero?.headline).toBe(HOME_CONTENT_EN.hero.headline);
    expect(experience.mission?.body).toBe(HOME_CONTENT_EN.mission.body);
    expect(experience.vision?.body).toBe(HOME_CONTENT_EN.vision.body);
    expect(experience.geographicPresence?.body).toBe(
      HOME_CONTENT_EN.geographicPresence.body,
    );
  });

  it("returns no statistics when none are approved", async () => {
    await insertPublishedSection("home", "en", HOME_CONTENT_EN);

    const experience = await getHomeExperience("en");

    expect(experience.statistics).toEqual([]);
  });

  it("exposes only published dynamic categories in the preview (FR-027)", async () => {
    const user = await ensureTestUser();
    await insertPublishedSection("home", "en", HOME_CONTENT_EN);
    await prisma.category.createMany({
      data: [
        {
          kind: "product",
          nameEn: "Published Category",
          nameAr: "فئة منشورة",
          slugEn: "published-category",
          slugAr: "faa-manshora",
          status: "published",
          isActive: true,
          sortOrder: 1,
          createdById: user.id,
        },
        {
          kind: "product",
          nameEn: "Draft Category",
          nameAr: "فية مسودة",
          slugEn: "draft-category",
          slugAr: "faa-musawda",
          status: "draft",
          isActive: true,
          sortOrder: 2,
          createdById: user.id,
        },
        {
          kind: "product",
          nameEn: "Archived Category",
          nameAr: "فئة مؤرشفة",
          slugEn: "archived-category",
          slugAr: "faa-mu-arshafa",
          status: "published",
          isActive: false,
          sortOrder: 3,
          createdById: user.id,
        },
      ],
    });

    const experience = await getHomeExperience("en");

    expect(experience.categories.map((category) => category.name)).toEqual([
      "Published Category",
    ]);
  });

  it("handles a never-published home section gracefully (localized empty state source)", async () => {
    const experience = await getHomeExperience("en");

    expect(experience.published).toBe(false);
    expect(experience.hero).toBeNull();
    expect(experience.categories).toEqual([]);
    expect(experience.statistics).toEqual([]);
  });
});
