import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * T067 [US6] — CMS + Settings admin operations integration test
 * (FR-007, FR-014, FR-031, FR-032, SC-005).
 *
 * Runs against the real database (ephemeral Postgres, migrations applied) and
 * exercises the actual route handlers (auth → permission → service) so the
 * optimistic lock, publish-safety predicate, validation gate and cache-tag
 * invalidation are all asserted end-to-end.
 */

const authMock = vi.hoisted(() => vi.fn());
vi.mock("../../src/server/auth/auth", () => ({ auth: authMock }));

const revalidateTagMock = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidateTag: revalidateTagMock }));

import { prisma } from "@/server/db/prisma";
import type { Role } from "@/server/auth/permissions";
import { getPublishedSection } from "@/server/services/cms";
import { getHomeExperience, getSocialLinks, getWorkingHours } from "@/server/services/content";
import { getSettings } from "@/server/services/settings";
import { CONTACT_INFO_AR, CONTACT_INFO_EN } from "../../prisma/seed-content";

import {
  GET as getSection,
  PUT as putDraft,
} from "@/app/api/admin/cms/sections/[sectionKey]/[locale]/route";
import { GET as getSectionByQuery } from "@/app/api/admin/cms/sections/[sectionKey]/route";
import { POST as publishRoute } from "@/app/api/admin/cms/sections/[sectionKey]/[locale]/publish/route";
import { POST as unpublishRoute } from "@/app/api/admin/cms/sections/[sectionKey]/[locale]/unpublish/route";
import { POST as approveStatRoute } from "@/app/api/admin/cms/sections/[sectionKey]/[locale]/approve-stat/route";
import { GET as listSettingsRoute } from "@/app/api/admin/settings/route";
import {
  GET as getSettingRoute,
  PUT as putSettingRoute,
} from "@/app/api/admin/settings/[key]/route";

const BASE = "http://localhost/api/admin";

const TEST_DOMAIN = "@cms-it.test";

const VALID_HOME_EN = {
  hero: { headline: "Test Headline", supporting: "Test supporting text" },
  statistics: [] as { label: string; value: string; approved: boolean }[],
  aboutPreview: { body: "About preview text" },
  mission: { body: "Mission text" },
  vision: { body: "Vision text" },
  sustainability: { body: "Sustainability text" },
  innovation: { body: "Innovation text" },
  geographicPresence: { body: "Geographic presence text" },
};

const UPDATED_HOME_EN = {
  ...VALID_HOME_EN,
  hero: { headline: "Updated Headline", supporting: "Updated supporting text" },
  mission: { body: "Updated Mission text" },
};

async function createUser(role: Role = "ContentManager") {
  return prisma.user.create({
    data: {
      email: `cms-${randomUUID()}${TEST_DOMAIN}`,
      name: "CMS Test User",
      passwordHash: "not-a-real-hash",
      role,
      tokenVersion: 1,
    },
  });
}

function authAs(user: { id: string; tokenVersion: number }) {
  authMock.mockResolvedValue({ user: { id: user.id, tokenVersion: user.tokenVersion } });
}

function ctx(sectionKey: string, locale: string) {
  return { params: Promise.resolve({ sectionKey, locale }) };
}

function keyCtx(key: string) {
  return { params: Promise.resolve({ key }) };
}

function jsonRequest(
  method: string,
  url: string,
  init: { body?: unknown; version?: number } = {},
): Request {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (init.version !== undefined) headers["If-Match"] = String(init.version);
  return new Request(url, {
    method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

async function seedSection(params: {
  sectionKey?: "home" | "about" | "contact";
  locale?: "en" | "ar";
  draft: unknown;
  published?: unknown;
  ownerId: string;
}) {
  const { sectionKey = "home", locale = "en", draft, published, ownerId } = params;
  return prisma.cmsSection.create({
    data: {
      sectionKey,
      locale,
      draftContent: draft as object,
      publishedContent: (published ?? null) as object,
      publishedAt: published === undefined || published === null ? null : new Date(),
      createdById: ownerId,
    },
  });
}

const CMS_ACTIVITY = { entityType: { in: ["cmsSection", "settings"] } };

beforeEach(async () => {
  authMock.mockReset();
  revalidateTagMock.mockReset();
  await prisma.activityLog.deleteMany({ where: CMS_ACTIVITY });
  await prisma.cmsSection.deleteMany({});
  await prisma.settings.deleteMany({});
});

describe("US6 — CMS draft/publish safety (T067, SC-005)", () => {
  it("returns 401 UNAUTHORIZED for an anonymous request", async () => {
    authMock.mockResolvedValue(null);
    const res = await putDraft(
      jsonRequest("PUT", `${BASE}/cms/sections/home/en`, { body: VALID_HOME_EN, version: 1 }),
      ctx("home", "en"),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 FORBIDDEN for a role without cms:update", async () => {
    const user = await createUser("ProductManager");
    authAs(user);
    const res = await putDraft(
      jsonRequest("PUT", `${BASE}/cms/sections/home/en`, { body: VALID_HOME_EN, version: 1 }),
      ctx("home", "en"),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("FORBIDDEN");
  });

  it("writes the draft only — published content and the public read are unchanged", async () => {
    const owner = await createUser();
    await seedSection({ draft: VALID_HOME_EN, published: VALID_HOME_EN, ownerId: owner.id });
    authAs(owner);

    const res = await putDraft(
      jsonRequest("PUT", `${BASE}/cms/sections/home/en`, { body: UPDATED_HOME_EN, version: 1 }),
      ctx("home", "en"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.draftContent.hero.headline).toBe("Updated Headline");
    expect(body.publishedContent.hero.headline).toBe("Test Headline");
    expect(body.version).toBe(2);

    const publicRead = await getPublishedSection("home", "en");
    expect(publicRead?.hero.headline).toBe("Test Headline");

    const logs = await prisma.activityLog.findMany({ where: CMS_ACTIVITY });
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe("update");
    expect(logs[0].actorId).toBe(owner.id);
  });

  it("rejects a stale If-Match version with 409 VERSION_CONFLICT (optimistic lock)", async () => {
    const owner = await createUser();
    await seedSection({ draft: VALID_HOME_EN, published: VALID_HOME_EN, ownerId: owner.id });
    authAs(owner);

    const res = await putDraft(
      jsonRequest("PUT", `${BASE}/cms/sections/home/en`, { body: UPDATED_HOME_EN, version: 99 }),
      ctx("home", "en"),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("VERSION_CONFLICT");

    const row = await prisma.cmsSection.findFirst({ where: { sectionKey: "home", locale: "en" } });
    expect((row?.draftContent as typeof VALID_HOME_EN).hero.headline).toBe("Test Headline");
    expect(row?.version).toBe(1);
  });

  it("rejects arbitrary/unsupported fields with 400 (FR-032 — no free-form markup)", async () => {
    const owner = await createUser();
    await seedSection({ draft: VALID_HOME_EN, published: VALID_HOME_EN, ownerId: owner.id });
    authAs(owner);

    const withTopLevelInjection = { ...VALID_HOME_EN, layout: "<div>free-form builder</div>" };
    const res = await putDraft(
      jsonRequest("PUT", `${BASE}/cms/sections/home/en`, {
        body: withTopLevelInjection,
        version: 1,
      }),
      ctx("home", "en"),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_FAILED");

    const withNestedMarkup = {
      ...VALID_HOME_EN,
      hero: { ...VALID_HOME_EN.hero, html: "<script>alert(1)</script>" },
    };
    const nestedRes = await putDraft(
      jsonRequest("PUT", `${BASE}/cms/sections/home/en`, { body: withNestedMarkup, version: 1 }),
      ctx("home", "en"),
    );
    expect(nestedRes.status).toBe(400);
  });

  it("publishes the draft, makes it public, and invalidates the cache tags", async () => {
    const owner = await createUser();
    await seedSection({ draft: UPDATED_HOME_EN, published: VALID_HOME_EN, ownerId: owner.id });
    authAs(owner);

    const res = await publishRoute(
      jsonRequest("POST", `${BASE}/cms/sections/home/en/publish`, { body: { version: 1 } }),
      ctx("home", "en"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.publishedContent.hero.headline).toBe("Updated Headline");

    const publicRead = await getPublishedSection("home", "en");
    expect(publicRead?.hero.headline).toBe("Updated Headline");

    expect(revalidateTagMock).toHaveBeenCalledWith("cms:home:en", { expire: 0 });
    expect(revalidateTagMock).toHaveBeenCalledWith("categories:en", { expire: 0 });

    const logs = await prisma.activityLog.findMany({ where: CMS_ACTIVITY });
    expect(logs.map((log) => log.action)).toContain("publish");
  });

  it("unpublishes and removes the section from the public read path", async () => {
    const owner = await createUser();
    await seedSection({ draft: VALID_HOME_EN, published: VALID_HOME_EN, ownerId: owner.id });
    authAs(owner);

    const res = await unpublishRoute(
      jsonRequest("POST", `${BASE}/cms/sections/home/en/unpublish`, { body: { version: 1 } }),
      ctx("home", "en"),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).publishedContent).toBeNull();
    expect(await getPublishedSection("home", "en")).toBeNull();
    expect(revalidateTagMock).toHaveBeenCalledWith("cms:home:en", { expire: 0 });
  });

  it("serves the section for the contract query form (?locale=)", async () => {
    const owner = await createUser();
    await seedSection({ draft: VALID_HOME_EN, published: VALID_HOME_EN, ownerId: owner.id });
    authAs(owner);

    const res = await getSectionByQuery(
      jsonRequest("GET", `${BASE}/cms/sections/home?locale=en`),
      { params: Promise.resolve({ sectionKey: "home" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sectionKey).toBe("home");
    expect(body.locale).toBe("en");
    expect(body.draftContent.hero.headline).toBe("Test Headline");
  });

  it("returns 400 for an unknown section key", async () => {
    const owner = await createUser();
    authAs(owner);
    const res = await getSection(jsonRequest("GET", `${BASE}/cms/sections/nope/en`), ctx("nope", "en"));
    expect(res.status).toBe(400);
  });
});

describe("US6 — FR-007 statistic approval gate", () => {
  const HOME_WITH_STAT = {
    ...VALID_HOME_EN,
    statistics: [{ label: "50 years of success", value: "50", approved: false }],
  };

  it("keeps unapproved statistics out of the public experience until approved AND published", async () => {
    const owner = await createUser();
    await seedSection({ draft: HOME_WITH_STAT, published: HOME_WITH_STAT, ownerId: owner.id });
    authAs(owner);

    let experience = await getHomeExperience("en");
    expect(experience.statistics).toEqual([]);
    expect(JSON.stringify(experience)).not.toContain("50 years");

    const approveRes = await approveStatRoute(
      jsonRequest("POST", `${BASE}/cms/sections/home/en/approve-stat`, {
        body: { version: 1, statisticIndex: 0 },
      }),
      ctx("home", "en"),
    );
    expect(approveRes.status).toBe(200);
    const approved = await approveRes.json();
    expect(approved.draftContent.statistics[0].approved).toBe(true);
    expect(approved.publishedContent.statistics[0].approved).toBe(false);

    // Approving the draft alone must not change what visitors see.
    experience = await getHomeExperience("en");
    expect(experience.statistics).toEqual([]);

    const publishRes = await publishRoute(
      jsonRequest("POST", `${BASE}/cms/sections/home/en/publish`, { body: { version: 2 } }),
      ctx("home", "en"),
    );
    expect(publishRes.status).toBe(200);

    experience = await getHomeExperience("en");
    expect(experience.statistics).toEqual([{ label: "50 years of success", value: "50" }]);
  });

  it("rejects statistic approval on a non-home section with 400", async () => {
    const owner = await createUser();
    await seedSection({
      sectionKey: "about",
      draft: {
        story: ["s"],
        history: ["h"],
        profile: ["p"],
        journey: ["j"],
        mission: { body: "m" },
        vision: { body: "v" },
        values: [{ id: "q", title: "Quality", description: "d" }],
        sustainability: { paragraphs: ["x"] },
        innovation: { body: "i" },
      },
      ownerId: owner.id,
    });
    authAs(owner);
    const res = await approveStatRoute(
      jsonRequest("POST", `${BASE}/cms/sections/about/en/approve-stat`, {
        body: { version: 1, statisticIndex: 0 },
      }),
      ctx("about", "en"),
    );
    expect(res.status).toBe(400);
  });
});

describe("US6 — Settings admin operations", () => {
  it("returns 403 for a role without settings:update", async () => {
    const user = await createUser("ProductManager");
    authAs(user);
    const res = await putSettingRoute(
      jsonRequest("PUT", `${BASE}/settings/contact_info`, {
        body: { valueEn: CONTACT_INFO_EN, valueAr: CONTACT_INFO_AR },
      }),
      keyCtx("contact_info"),
    );
    expect(res.status).toBe(403);
  });

  it("updates contact_info, reflects publicly, and invalidates both locale tags", async () => {
    const owner = await createUser();
    authAs(owner);

    const res = await putSettingRoute(
      jsonRequest("PUT", `${BASE}/settings/contact_info`, {
        body: { valueEn: CONTACT_INFO_EN, valueAr: CONTACT_INFO_AR },
      }),
      keyCtx("contact_info"),
    );
    expect(res.status).toBe(200);

    const en = await getSettings("contact_info", "en");
    expect(en?.address).toBe("23337 King Fahd Road");
    const ar = await getSettings("contact_info", "ar");
    expect(ar?.city).toBe("جدة");

    expect(revalidateTagMock).toHaveBeenCalledWith("settings:contact_info:en", { expire: 0 });
    expect(revalidateTagMock).toHaveBeenCalledWith("settings:contact_info:ar", { expire: 0 });

    const logs = await prisma.activityLog.findMany({ where: CMS_ACTIVITY });
    expect(logs.some((log) => log.entityType === "settings")).toBe(true);
  });

  it("wires working_hours and social_links to the public content facade", async () => {
    const owner = await createUser();
    authAs(owner);

    const hours = await putSettingRoute(
      jsonRequest("PUT", `${BASE}/settings/working_hours`, {
        body: { valueEn: "Sun–Thu, 9:00–17:00", valueAr: "الأحد–الخميس" },
      }),
      keyCtx("working_hours"),
    );
    expect(hours.status).toBe(200);

    const links = await putSettingRoute(
      jsonRequest("PUT", `${BASE}/settings/social_links`, {
        body: {
          valueEn: [{ platform: "LinkedIn", url: "https://linkedin.com/company/zain" }],
          valueAr: [{ platform: "لينكدإن", url: "https://linkedin.com/company/zain" }],
        },
      }),
      keyCtx("social_links"),
    );
    expect(links.status).toBe(200);

    expect(await getWorkingHours("en")).toBe("Sun–Thu, 9:00–17:00");
    const arLinks = await getSocialLinks("ar");
    expect(arLinks?.[0]).toEqual({
      platform: "لينكدإن",
      url: "https://linkedin.com/company/zain",
    });
  });

  it("rejects invalid settings values (missing required + arbitrary fields) with 400", async () => {
    const owner = await createUser();
    authAs(owner);

    const missing = await putSettingRoute(
      jsonRequest("PUT", `${BASE}/settings/contact_info`, {
        body: { valueEn: { country: "Saudi Arabia" }, valueAr: CONTACT_INFO_AR },
      }),
      keyCtx("contact_info"),
    );
    expect(missing.status).toBe(400);
    expect((await missing.json()).error.code).toBe("VALIDATION_FAILED");

    const extra = await putSettingRoute(
      jsonRequest("PUT", `${BASE}/settings/contact_info`, {
        body: {
          valueEn: { ...CONTACT_INFO_EN, arbitrary: "<b>markup</b>" },
          valueAr: CONTACT_INFO_AR,
        },
      }),
      keyCtx("contact_info"),
    );
    expect(extra.status).toBe(400);
  });

  it("lists settings for a reader and hides them from a non-reader", async () => {
    const owner = await createUser();
    await prisma.settings.create({
      data: { key: "contact_info", valueEn: CONTACT_INFO_EN, valueAr: CONTACT_INFO_AR },
    });

    authAs(owner);
    const ok = await listSettingsRoute();
    expect(ok.status).toBe(200);
    expect((await ok.json()).map((row: { key: string }) => row.key)).toContain("contact_info");

    const reader = await createUser("ProductManager");
    authAs(reader);
    const denied = await listSettingsRoute();
    expect(denied.status).toBe(403);

    const single = await getSettingRoute(
      jsonRequest("GET", `${BASE}/settings/contact_info`),
      keyCtx("contact_info"),
    );
    expect(single.status).toBe(403);
  });
});
