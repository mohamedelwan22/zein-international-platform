import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { expect, test, type Page } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS } from "./auth-fixtures";

/**
 * T101/T103/T104/T105 E2E (US10, FR-034/FR-036/FR-042/FR-043, SC-011).
 *
 * - an approved `SeoMeta` override reaches the public HTML (title, description,
 *   canonical, robots);
 * - a persisted `SlugRedirect` sends an old brand URL to the current slug;
 * - a Content Manager edits metadata and changes a slug through `/admin/seo`,
 *   and the old URL redirects without a manual redirect row;
 * - a Product Manager is refused the SEO module;
 * - `/sitemap.xml` and `/robots.txt` are served with the expected policy.
 */

const RUN_ID = randomUUID().slice(0, 8);
const BRAND_ID = randomUUID();
const BRAND_NAME = `US10 E2E Metadata Brand ${RUN_ID}`;
const SLUG_EN = `us10-e2e-${RUN_ID}-brand-en`;
const SLUG_AR = `us10-e2e-${RUN_ID}-brand-ar`;
const OLD_SLUG = `us10-e2e-${RUN_ID}-old-slug`;
const RENAMED_SLUG = `us10-e2e-${RUN_ID}-renamed-slug`;
const META_TITLE = "US10 E2E Meta Title";
const META_DESCRIPTION = "US10 E2E metadata description for crawler verification.";
const AR_META_TITLE = "\u0639\u0646\u0648\u0627\u0646 US10";
const AR_META_DESCRIPTION = "\u0648\u0635\u0641 US10 \u0627\u0644\u062a\u062c\u0631\u064a\u0628\u064a.";
const ACTION_TIMEOUT = 60_000;

async function withDb<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function seedBrand(): Promise<void> {
  await withDb(async (client) => {
    await client.query(
      `INSERT INTO "Brand" (
         "id", "nameEn", "nameAr", "slugEn", "slugAr", "summaryEn", "summaryAr",
         "status", "isActive", "version", "createdById", "createdAt", "updatedAt"
       ) VALUES (
         $1, $2, $2, $3, $4, $5, $5,
         'published', true, 1,
         (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1),
         now(), now()
       )
       ON CONFLICT ("id") DO UPDATE SET
         "nameEn" = EXCLUDED."nameEn",
         "nameAr" = EXCLUDED."nameAr",
         "slugEn" = EXCLUDED."slugEn",
         "slugAr" = EXCLUDED."slugAr",
         "summaryEn" = EXCLUDED."summaryEn",
         "summaryAr" = EXCLUDED."summaryAr",
         "status" = 'published',
         "isActive" = true,
         "version" = 1,
         "updatedAt" = now()`,
      [BRAND_ID, BRAND_NAME, SLUG_EN, SLUG_AR, "A brand used only by the US10 E2E SEO spec."],
    );
  });
}

async function seedSeoOverride(noindex: boolean): Promise<void> {
  const rows = [
    {
      locale: "en",
      title: META_TITLE,
      description: META_DESCRIPTION,
      canonical: `/en/brands/${SLUG_EN}`,
      noindex,
    },
    {
      locale: "ar",
      title: AR_META_TITLE,
      description: AR_META_DESCRIPTION,
      canonical: `/ar/brands/${SLUG_AR}`,
      noindex: false,
    },
  ];

  await withDb(async (client) => {
    for (const row of rows) {
      await client.query(
        `INSERT INTO "SeoMeta" (
           "id", "targetType", "targetId", "locale", "metaTitle", "metaDescription",
           "canonicalUrl", "noindex", "version", "createdById", "createdAt", "updatedAt"
         ) VALUES (
           gen_random_uuid(), 'brand', $1, $2, $3, $4, $5, $6, 1,
           (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1),
           now(), now()
         )
         ON CONFLICT ("targetType", "targetId", "locale") DO UPDATE SET
           "metaTitle" = EXCLUDED."metaTitle",
           "metaDescription" = EXCLUDED."metaDescription",
           "canonicalUrl" = EXCLUDED."canonicalUrl",
           "noindex" = EXCLUDED."noindex",
           "updatedAt" = now()`,
        [
          BRAND_ID,
          row.locale,
          row.title,
          row.description,
          row.canonical,
          row.noindex,
        ],
      );
    }
  });
}

async function cleanup(): Promise<void> {
  await withDb(async (client) => {
    await client.query(
      `DELETE FROM "SlugRedirect" WHERE "entityType" = 'brand' AND ("oldSlug" LIKE 'us10-e2e%' OR "newSlug" LIKE 'us10-e2e%')`,
    );
    await client.query(
      `DELETE FROM "SeoMeta" WHERE "targetId" IN (SELECT "id" FROM "Brand" WHERE "nameEn" LIKE 'US10 E2E Metadata Brand%')`,
    );
    await client.query(`DELETE FROM "Brand" WHERE "nameEn" LIKE 'US10 E2E Metadata Brand%'`);
  });
}

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/en/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/admin(?:\/|\?|$)/);
}

test.describe.configure({ mode: "serial" });

test.describe("US10 - SEO", () => {
  test.beforeAll(async () => {
    await cleanup();
    await seedBrand();
  });

  test.afterAll(async () => {
    await cleanup();
  });

  test("approved overrides and slug redirects reach the public HTML", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "metadata journey asserted once");

    await seedSeoOverride(true);
    await withDb(async (client) => {
      await client.query(
        `INSERT INTO "SlugRedirect" ("id", "entityType", "locale", "oldSlug", "newSlug", "createdAt")
         VALUES (gen_random_uuid(), 'brand', 'en', $1, $2, now())
         ON CONFLICT ("entityType", "oldSlug", "locale") DO UPDATE SET "newSlug" = EXCLUDED."newSlug"`,
        [OLD_SLUG, SLUG_EN],
      );
    });

    await page.goto(`/en/brands/${SLUG_EN}`);
    await expect(page).toHaveTitle(META_TITLE);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      META_DESCRIPTION,
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      new RegExp(`/en/brands/${SLUG_EN}$`),
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      META_TITLE,
    );
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute(
      "content",
      "en_US",
    );
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      /hero\.png/,
    );
    await expect(
      page.locator('link[rel="alternate"][hreflang="en"]'),
    ).toHaveAttribute("href", new RegExp(`/en/brands/${SLUG_EN}$`));
    await expect(
      page.locator('link[rel="alternate"][hreflang="ar"]'),
    ).toHaveAttribute("href", new RegExp(`/ar/brands/${SLUG_AR}$`));

    await page.goto(`/ar/brands/${SLUG_AR}`);
    await expect(page).toHaveTitle(AR_META_TITLE);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      AR_META_DESCRIPTION,
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      new RegExp(`/ar/brands/${SLUG_AR}$`),
    );
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute(
      "content",
      "ar_SA",
    );
    await expect(
      page.locator('link[rel="alternate"][hreflang="en"]'),
    ).toHaveAttribute("href", new RegExp(`/en/brands/${SLUG_EN}$`));
    await expect(
      page.locator('link[rel="alternate"][hreflang="ar"]'),
    ).toHaveAttribute("href", new RegExp(`/ar/brands/${SLUG_AR}$`));

    await page.goto(`/en/brands/${OLD_SLUG}`);
    await page.waitForURL(new RegExp(`/en/brands/${SLUG_EN}$`));
    await expect(page.getByRole("heading", { level: 1 })).toContainText(BRAND_NAME);

    await withDb(async (client) => {
      await client.query(
        `DELETE FROM "SlugRedirect" WHERE "entityType" = 'brand' AND "oldSlug" = $1`,
        [OLD_SLUG],
      );
    });
  });

  test("a Content Manager edits metadata and a slug change redirects the old URL", async ({
    page,
  }) => {
    test.skip(test.info().project.name !== "desktop", "admin journey asserted once");
    test.setTimeout(180_000);

    await signIn(page, E2E_USERS.contentManager.email);
    await page.goto("/en/admin/seo");
    await expect(page.getByRole("heading", { name: "SEO" })).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });

    await page.locator("#seo-target").selectOption({ label: BRAND_NAME });
    await page.locator("#seo-title").fill("US10 Admin Override Title");
    await page.locator("#seo-description").fill("US10 admin override description.");
    await page.getByRole("button", { name: "Save SEO settings" }).click();
    await expect(page.getByText("SEO settings saved.", { exact: true })).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });

    await page.locator("#seo-slug").fill(RENAMED_SLUG);
    await page.getByRole("button", { name: "Save SEO settings" }).click();
    await expect(page.getByText("SEO settings saved.", { exact: true })).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });

    await page.goto(`/en/brands/${SLUG_EN}`);
    await page.waitForURL(new RegExp(`/en/brands/${RENAMED_SLUG}$`));
    await expect(page).toHaveTitle("US10 Admin Override Title");

    await withDb(async (client) => {
      const redirect = await client.query(
        `SELECT "newSlug" FROM "SlugRedirect" WHERE "entityType" = 'brand' AND "oldSlug" = $1 AND "locale" = 'en'`,
        [SLUG_EN],
      );
      expect(redirect.rows[0]?.newSlug).toBe(RENAMED_SLUG);
    });
  });

  test("a Product Manager is refused the SEO module", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "admin journey asserted once");

    await signIn(page, E2E_USERS.productManager.email);
    await page.goto("/en/admin/seo");
    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible({
      timeout: ACTION_TIMEOUT,
    });
  });

  test("sitemap.xml and robots.txt expose the public policy", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "metadata route journey asserted once");

    const robots = await page.request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    const robotsBody = await robots.text();
    expect(robotsBody).toContain("Sitemap:");
    expect(robotsBody).toContain("/sitemap.xml");
    expect(robotsBody).toContain("/admin");

    const sitemap = await page.request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    const sitemapBody = await sitemap.text();
    expect(sitemapBody).toContain("/en");
    expect(sitemapBody).toContain("/ar/contact");
  });
});
