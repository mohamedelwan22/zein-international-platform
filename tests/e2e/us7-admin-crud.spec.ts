import { expect, test, type Page } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS } from "./auth-fixtures";

/**
 * T074 [US7] — E2E: a staff persona manages a bilingual brand end to end
 * (SC-013, FR-025, FR-036).
 *
 * - a Product Manager signs in, uploads an image to the US12 media library,
 *   creates a brand-category, then creates and publishes a bilingual brand with
 *   a cover image on the first attempt (SC-013 — no back-and-forth fixes);
 * - the brand appears on the public directory, then disappears when hidden
 *   (visibility) and reappears when shown, then is removed by archiving
 *   (archive/visibility public effects);
 * - creating a second brand that reuses an existing slug is refused with the
 *   localized duplicate-address message (FR-036).
 *
 * The journey runs on the desktop project; the other projects still load the
 * public pages.
 */

const ACTION_TIMEOUT = 60_000;

function uniqueSlug(): string {
  return `us7-brand-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function signIn(page: Page, email: string, password = E2E_PASSWORD): Promise<void> {
  await page.goto("/en/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/admin(?:\/|\?|$)/);
}

test.describe("US7 — Catalog CRUD admin", () => {
  test("create, publish, hide/show, archive a bilingual brand with an image, and refuse a duplicate slug", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "admin journeys asserted on the desktop project");
    test.setTimeout(180_000);

    const suffix = Date.now().toString();
    const imgName = `us7-cover-${suffix}.png`;
    const catNameEn = `US7 Cat ${suffix}`;
    const catNameAr = `US7 فئة ${suffix}`;
    const catSlugEn = `us7-cat-${suffix}`;
    const catSlugAr = `us7-cat-ar-${suffix}`;
    const brandEn = `US7 Brand ${suffix}`;
    const brandAr = `علامة يو إس سفن ${suffix}`;
    const brandSlug = uniqueSlug();
    const brandSlugAr = `us7-brand-ar-${suffix}`;
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(64),
    ]);

    await signIn(page, E2E_USERS.productManager.email);

    // Upload an image to the shared media library (US12) so the brand can use it.
    await page.goto("/en/admin/media");
    await page.locator('input[type="file"]').setInputFiles({ name: imgName, mimeType: "image/png", buffer: png });
    await page.locator('input[name="altEn"]').fill("US7 cover");
    await page.locator('input[name="altAr"]').fill("غلاف");
    await page.getByRole("button", { name: "Upload", exact: true }).click();
    await expect(page.getByText("Media uploaded.")).toBeVisible({ timeout: ACTION_TIMEOUT });

    // Create a brand-kind category (a brand needs at least one category).
    await page.goto("/en/admin/categories");
    await page.getByRole("button", { name: "New record" }).click();
    await expect(page.getByRole("heading", { name: "Create record" })).toBeVisible();
    await page.getByLabel("Kind").selectOption("brand");
    await page.getByLabel("Name (English)").fill(catNameEn);
    await page.getByLabel("Slug (URL segment) (English)").fill(catSlugEn);
    await page.getByRole("tab", { name: "Arabic" }).click();
    await page.getByLabel("Name (Arabic)").fill(catNameAr);
    await page.getByLabel("Slug (URL segment) (Arabic)").fill(catSlugAr);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByText("Record created.")).toBeVisible({ timeout: ACTION_TIMEOUT });

    // Create the bilingual brand, first attempt, with the uploaded cover image.
    await page.goto("/en/admin/brands");
    await page.getByRole("button", { name: "New record" }).click();
    await expect(page.getByRole("heading", { name: "Create record" })).toBeVisible();
    await page.getByLabel("Name (English)").fill(brandEn);
    await page.getByLabel("Slug (URL segment) (English)").fill(brandSlug);
    await page.getByRole("checkbox", { name: catNameEn }).check();
    const coverSelect = page.getByLabel("Cover image");
    await expect(coverSelect.locator(`option:has-text("${imgName}")`)).toBeAttached({ timeout: ACTION_TIMEOUT });
    await coverSelect.selectOption({ label: imgName });
    await page.getByRole("tab", { name: "Arabic" }).click();
    await page.getByLabel("Name (Arabic)").fill(brandAr);
    await page.getByLabel("Slug (URL segment) (Arabic)").fill(brandSlugAr);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByText("Record created.")).toBeVisible({ timeout: ACTION_TIMEOUT });

    // Publish from the row action.
    const row = page.locator("tr", { hasText: brandEn });
    await expect(row).toBeVisible({ timeout: ACTION_TIMEOUT });
    await row.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByText("Record published.")).toBeVisible({ timeout: ACTION_TIMEOUT });

    // Public effect: the published brand appears on the public directory.
    await page.goto("/en/brands");
    await expect(page.getByText(brandEn)).toBeVisible({ timeout: ACTION_TIMEOUT });

    // Visibility effect: hiding removes it from the public directory.
    await page.goto("/en/admin/brands");
    const hideRow = page.locator("tr", { hasText: brandEn });
    await hideRow.getByRole("button", { name: "Hide" }).click();
    await expect(page.getByText("Record is now hidden.")).toBeVisible({ timeout: ACTION_TIMEOUT });
    await page.goto("/en/brands");
    await expect(page.getByText(brandEn)).toHaveCount(0);

    // Showing it again restores the public listing.
    await page.goto("/en/admin/brands");
    const showRow = page.locator("tr", { hasText: brandEn });
    await showRow.getByRole("button", { name: "Show" }).click();
    await expect(page.getByText("Record is now visible.")).toBeVisible({ timeout: ACTION_TIMEOUT });
    await page.goto("/en/brands");
    await expect(page.getByText(brandEn)).toBeVisible({ timeout: ACTION_TIMEOUT });

    // Duplicate slug is refused (FR-036): reuse the English slug in a new brand.
    await page.goto("/en/admin/brands");
    await page.getByRole("button", { name: "New record" }).click();
    await page.getByLabel("Name (English)").fill(`US7 Dup ${suffix}`);
    await page.getByLabel("Slug (URL segment) (English)").fill(brandSlug);
    await page.getByRole("checkbox", { name: catNameEn }).check();
    await page.getByRole("tab", { name: "Arabic" }).click();
    await page.getByLabel("Name (Arabic)").fill(`مكرر ${suffix}`);
    await page.getByLabel("Slug (URL segment) (Arabic)").fill(`us7-dup-ar-${suffix}`);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByText("already in use")).toBeVisible({ timeout: ACTION_TIMEOUT });

    // Archive effect: unpublish + archive removes it from the public directory.
    await page.goto("/en/admin/brands");
    const archiveRow = page.locator("tr", { hasText: brandEn });
    await archiveRow.getByRole("button", { name: "Archive" }).click();
    await expect(page.getByText("Record archived.")).toBeVisible({ timeout: ACTION_TIMEOUT });
    await page.goto("/en/brands");
    await expect(page.getByText(brandEn)).toHaveCount(0);
  });

  test("anonymous visitors are redirected from the brands admin module", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "RBAC asserted on the desktop project");
    await page.goto("/en/admin/brands");
    await expect(page).toHaveURL(/\/en\/login/);
  });
});
