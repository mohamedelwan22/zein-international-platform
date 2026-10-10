import { describe, expect, it } from "vitest";
import {
  ABOUT_CONTENT_AR,
  ABOUT_CONTENT_EN,
  CONTACT_INFO_AR,
  CONTACT_INFO_EN,
  HOME_CONTENT_AR,
  HOME_CONTENT_EN,
  SEED_CATEGORIES,
  SOURCE_DOCS,
} from "../../prisma/seed-content";

/**
 * Seed-content governance invariants (SC-010, Constitution III, FR-007).
 * These assert the DATA before it reaches the database; the DB-level
 * provenance assertions live with the integration tests (plan Testing).
 */
describe("seed content governance (SC-010)", () => {
  const allContentJson = JSON.stringify([
    HOME_CONTENT_EN,
    HOME_CONTENT_AR,
    ABOUT_CONTENT_EN,
    ABOUT_CONTENT_AR,
    CONTACT_INFO_EN,
    CONTACT_INFO_AR,
  ]);

  it("seeds exactly the five approved product categories", () => {
    expect(SEED_CATEGORIES).toHaveLength(5);
    expect(SEED_CATEGORIES.map((c) => c.nameEn)).toEqual([
      "Personal Care & Cosmetic Accessories",
      "Baby Supplies",
      "Sports Corsets & Belts",
      "Compresses & Quick Treatment",
      "Additional Personal-Care Products",
    ]);
  });

  it("every category is fully bilingual with a source reference", () => {
    for (const category of SEED_CATEGORIES) {
      expect(category.nameEn.trim()).not.toBe("");
      expect(category.nameAr.trim()).not.toBe("");
      expect(category.slugEn).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(category.slugAr).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(category.sourceDoc).toMatch(/^docs\//);
      expect(category.descriptionEn.trim()).not.toBe("");
      expect(category.descriptionAr.trim()).not.toBe("");
    }
    expect(new Set(SEED_CATEGORIES.map((c) => c.slugEn)).size).toBe(5);
    expect(new Set(SEED_CATEGORIES.map((c) => c.slugAr)).size).toBe(5);
  });

  it("home statistics stay empty — no unapproved claims are seeded (FR-007)", () => {
    expect(HOME_CONTENT_EN.statistics).toEqual([]);
    expect(HOME_CONTENT_AR.statistics).toEqual([]);
  });

  it("never contains the unapproved 'years of success' claim in any locale", () => {
    expect(allContentJson).not.toContain("years of success");
    expect(allContentJson).not.toContain("50");
    expect(allContentJson).not.toContain("من النجاح");
    expect(allContentJson).not.toContain("عاماً من");
  });

  it("never seeds coordinates (FR-013 — locations are never invented)", () => {
    expect(allContentJson).not.toContain("latitude");
    expect(allContentJson).not.toContain("longitude");
  });

  it("carries the founding reference 1394 AH (FR-005)", () => {
    expect(allContentJson).toContain("1394 AH");
    expect(allContentJson).toContain("١٣٩٤");
  });

  it("contains the seven approved values in both locales", () => {
    expect(ABOUT_CONTENT_EN.values).toHaveLength(7);
    expect(ABOUT_CONTENT_AR.values).toHaveLength(7);
    const enIds = ABOUT_CONTENT_EN.values.map((v) => v.id);
    const arIds = ABOUT_CONTENT_AR.values.map((v) => v.id);
    expect(arIds).toEqual(enIds);
    for (const value of [...ABOUT_CONTENT_EN.values, ...ABOUT_CONTENT_AR.values]) {
      expect(value.title.trim()).not.toBe("");
      expect(value.description.trim()).not.toBe("");
    }
  });

  it("carries the approved contact facts verbatim (PROJECT_REQUIREMENTS §26)", () => {
    for (const info of [CONTACT_INFO_EN, CONTACT_INFO_AR]) {
      expect(info.phones).toEqual(["0126747594", "0126747595"]);
      expect(info.email).toBe("ahmed@zainagency.com");
      expect(info.website).toBe("Zainagency.com");
    }
    expect(CONTACT_INFO_EN.address).toBe("23337 King Fahd Road");
    expect(CONTACT_INFO_EN.city).toBe("Jeddah");
    expect(CONTACT_INFO_EN.district).toBe("Aziziyah District");
    expect(CONTACT_INFO_EN.country).toBe("Saudi Arabia");
  });

  it("references approved source documents for every seeded source set", () => {
    for (const source of Object.values(SOURCE_DOCS)) {
      expect(source).toMatch(/^docs\/PROJECT_REQUIREMENTS\.md §.+$/);
    }
  });

  it("seeds no brands, products, suppliers, clients, social links, or working hours", () => {
    expect(allContentJson).not.toContain("social_links");
    expect(allContentJson).not.toContain("working_hours");
    expect(allContentJson).not.toContain("privacy_notice");
  });
});
