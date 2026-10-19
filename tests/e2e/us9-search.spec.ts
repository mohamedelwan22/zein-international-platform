import "dotenv/config";
import { Client } from "pg";
import { expect, test, type Page } from "@playwright/test";
import { noHorizontalScroll } from "./helpers";

/**
 * T096 [US9] — E2E: global search overlay (SC-006).
 *
 * Journeys against the live app, against a record this spec seeds itself so
 * the run is deterministic on a clean dev DB (the US2/US8 data-tolerant
 * convention applies only where a fixture cannot be created cheaply — here a
 * single published brand is enough to prove every SC-006 claim):
 *
 * - the trigger is in the site header and opens the overlay;
 * - a 1-character query shows the localized `minLengthHint` and does not
 *   fetch (the network is never touched);
 * - a real query returns labeled results by entity type, with the label
 *   rendered as a visible chip;
 * - a nonsense query renders the localized empty state with next steps;
 * - selecting the seeded result opens its detail page in the active language;
 * - the same journey works in Arabic (RTL) with the Arabic record.
 */

const SEED = {
  brandId: "e2e00000-0000-4000-8000-000000000009",
  brandSlugEn: "us9-e2e-brand-en",
  brandSlugAr: "us9-e2e-brand-ar",
  brandNameEn: "US9 Search Sentinel Brand",
  brandNameAr: "علامة بحث التاسعة",
  brandSummaryEn: "A published brand used only by the US9 E2E search spec.",
  brandSummaryAr: "علامة منشورة تستخدمها فقط اختبارات البحث التاسعة.",
};

async function withDb<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

/** Idempotent seed: one published brand, findable in both locales. */
async function seedSearchableBrand() {
  await withDb(async (client) => {
    await client.query(
      `INSERT INTO "Brand" (
         "id", "nameEn", "nameAr", "slugEn", "slugAr", "summaryEn", "summaryAr",
         "status", "isActive", "version", "createdById", "createdAt", "updatedAt"
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
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
         "updatedAt" = now()`,
      [
        SEED.brandId,
        SEED.brandNameEn,
        SEED.brandNameAr,
        SEED.brandSlugEn,
        SEED.brandSlugAr,
        SEED.brandSummaryEn,
        SEED.brandSummaryAr,
      ],
    );
  });
}

async function removeSearchableBrand() {
  await withDb(async (client) => {
    await client.query(`DELETE FROM "Brand" WHERE "id" = $1`, [SEED.brandId]);
  });
}

async function expectLocaleChrome(page: Page, lang: "en" | "ar", dir: "ltr" | "rtl") {
  await expect(page.locator("html")).toHaveAttribute("lang", lang);
  await expect(page.locator("html")).toHaveAttribute("dir", dir);
  await noHorizontalScroll(page);
}

test.beforeAll(async () => {
  await seedSearchableBrand();
});

test.afterAll(async () => {
  await removeSearchableBrand();
});

test.describe("US9 — global search overlay", () => {
  test("overlay opens, enforces min length without fetching, and shows the localized empty state", async ({
    page,
  }) => {
    const searchRequests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("/api/search")) searchRequests.push(url);
    });

    await page.goto("/en");
    await expectLocaleChrome(page, "en", "ltr");

    const trigger = page.getByRole("button", { name: "Search", exact: true });
    await expect(trigger).toBeVisible();
    await trigger.click();

    const input = page.getByRole("combobox");
    await expect(input).toBeVisible();

    // SC-006 min-length guard: hint is shown, no request is made.
    await input.fill("c");
    await expect(page.getByText("Enter at least 2 characters.", { exact: true })).toBeVisible();
    await page.waitForTimeout(600); // longer than the 250ms debounce
    expect(searchRequests).toHaveLength(0);

    // Empty state: a nonsense query resolves to the approved wording + next steps.
    await input.fill("zzzdefinitelynomatchzzz");
    await expect(page.getByRole("heading", { name: "No results found" })).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByText("Try a different term or browse our brands and products."),
    ).toBeVisible();
  });

  test("a labeled result opens the detail page in the active language (English)", async ({
    page,
  }) => {
    await page.goto("/en");
    await expectLocaleChrome(page, "en", "ltr");

    await page.getByRole("button", { name: "Search", exact: true }).click();
    const input = page.getByRole("combobox");
    await input.fill(SEED.brandNameEn);

    const option = page.getByRole("option").filter({ hasText: SEED.brandNameEn });
    await expect(option).toBeVisible({ timeout: 10_000 });

    // SC-006: visible entity-type label.
    await expect(option.getByText("Brand", { exact: true })).toBeVisible();

    await option.click();
    await page.waitForURL(new RegExp(`/en/brands/${SEED.brandSlugEn}$`));
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(SEED.brandNameEn);
  });

  test("the same journey works in Arabic with the Arabic record (RTL)", async ({ page }) => {
    await page.goto("/ar");
    await expectLocaleChrome(page, "ar", "rtl");

    // The trigger's accessible name is the localized `search.button` key.
    const trigger = page.getByRole("button", { name: "بحث", exact: true });
    await expect(trigger).toBeVisible();
    await trigger.click();

    const input = page.getByRole("combobox");
    await input.fill(SEED.brandNameAr);

    const option = page.getByRole("option").filter({ hasText: SEED.brandNameAr });
    await expect(option).toBeVisible({ timeout: 10_000 });
    await expect(option.getByText("علامة تجارية", { exact: true })).toBeVisible();

    await option.click();
    await page.waitForURL(new RegExp(`/ar/brands/${SEED.brandSlugAr}$`));
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(SEED.brandNameAr);
  });
});
