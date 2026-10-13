import { expect, test, type Page } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS } from "./auth-fixtures";

/**
 * T068 [US6] — E2E: structured CMS + Settings editing (FR-007/FR-014/FR-031/
 * FR-032, SC-005).
 *
 * - a Content Manager edits the homepage hero, saves the draft, and the public
 *   site keeps showing the previously published copy until Publish;
 * - publishing makes the new copy public; the approved seed headline is then
 *   restored so the US1 public-site assertions stay stable;
 * - the Arabic variant is editable and stays private while unpublished;
 * - working hours saved in Settings appear on the public contact page (RTL
 *   field in Arabic);
 * - RBAC: anonymous visitors are redirected, a Product Manager is refused the
 *   CMS module (403).
 *
 * Admin journeys are asserted on the desktop project where the editor is fully
 * visible; the other projects still load the public pages.
 */

const EN_HERO_HEADLINE = "Saudi Authenticity international quality";
const AR_HERO_HEADLINE = "أصالة سعودية بجودة عالمية";

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function signIn(page: Page, user: { email: string }): Promise<void> {
  await page.goto("/en/login");
  await page.locator('input[name="email"]').fill(user.email);
  await page.locator('input[name="password"]').fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/admin(?:\/|\?|$)/);
}

// The dev server compiles the admin API route on first use; allow headroom so
// the very first save in a cold run is not mistaken for a failure.
const ACTION_TIMEOUT = 60_000;

async function saveDraft(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible({ timeout: ACTION_TIMEOUT });
}

async function publish(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Section published.")).toBeVisible({ timeout: ACTION_TIMEOUT });
}

test.describe("US6 — homepage CMS draft/publish safety (SC-005)", () => {
  test("editing a draft stays private until published, then goes live", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "admin editor asserted on the desktop project");
    test.setTimeout(180_000);

    await signIn(page, E2E_USERS.contentManager);

    // Capture what the public site currently serves (the published value).
    await page.goto("/en");
    const publishedHeadline = (await page.getByRole("heading", { level: 1 }).first().textContent()) ?? "";

    await page.goto("/en/admin/cms");
    const headline = page.locator("#home-hero-headline");
    await expect(headline).toBeVisible();
    const updated = `E2E Homepage Headline ${uniqueSuffix()}`;

    await headline.fill(updated);
    await saveDraft(page);

    // Draft changes never leak to the public site (publish safety).
    await page.goto("/en");
    await expect(page.getByRole("heading", { level: 1 }).first()).toContainText(publishedHeadline);

    // Publishing promotes the draft to the public output.
    await page.goto("/en/admin/cms");
    await publish(page);
    await page.goto("/en");
    await expect(page.getByRole("heading", { level: 1 }).first()).toContainText(updated);

    // Restore the approved seed headline so the US1 public-site assertions stay
    // stable regardless of any pre-existing draft left by an earlier run.
    await page.goto("/en/admin/cms");
    await page.locator("#home-hero-headline").fill(EN_HERO_HEADLINE);
    await saveDraft(page);
    await publish(page);
    await page.goto("/en");
    await expect(page.getByRole("heading", { level: 1 }).first()).toContainText(EN_HERO_HEADLINE);
  });

  test("the Arabic variant is editable and unpublished Arabic drafts stay private", async ({
    page,
  }) => {
    test.skip(test.info().project.name !== "desktop", "admin editor asserted on the desktop project");
    test.setTimeout(180_000);

    await signIn(page, E2E_USERS.contentManager);

    // Capture what the Arabic public site currently serves.
    await page.goto("/ar");
    const publishedHeadline = (await page.getByRole("heading", { level: 1 }).first().textContent()) ?? "";

    // Switch the editor to the Arabic locale of the Home section.
    await page.goto("/en/admin/cms");
    await page.locator('[aria-label="Language"]').getByRole("button", { name: "العربية" }).click();

    const headline = page.locator("#home-hero-headline");
    await expect(headline).toBeVisible();
    const updated = `أصالة تجريبية ${uniqueSuffix()}`;

    await headline.fill(updated);
    await saveDraft(page);

    // The Arabic public page still serves the previously published copy.
    await page.goto("/ar");
    await expect(page.getByRole("heading", { level: 1 }).first()).toContainText(publishedHeadline);

    // Restore the Arabic draft to the approved seed so no pending change remains.
    await page.goto("/en/admin/cms");
    await page.locator('[aria-label="Language"]').getByRole("button", { name: "العربية" }).click();
    await page.locator("#home-hero-headline").fill(AR_HERO_HEADLINE);
    await saveDraft(page);
  });
});

test.describe("US6 — Settings editor (FR-014)", () => {
  test("working hours saved in Settings appear on the public contact page", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "admin editor asserted on the desktop project");
    test.setTimeout(180_000);

    await signIn(page, E2E_USERS.contentManager);
    await page.goto("/en/admin/settings");
    await page.getByRole("tab", { name: "Working hours" }).click();

    const enValue = `Sun–Thu 9:00–17:00 (E2E ${uniqueSuffix()})`;
    await page.locator("#setting-working-hours").fill(enValue);

    // Arabic is required too; the field is RTL when editing the Arabic value.
    await page.locator('[aria-label="Language"]').getByRole("button", { name: "العربية" }).click();
    const arTextarea = page.locator("#setting-working-hours");
    await expect(arTextarea).toHaveAttribute("dir", "rtl");
    await arTextarea.fill("الأحد–الخميس ٩:٠٠–١٧:٠٠ (اختبار)");

    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible();

    await page.goto("/en/contact");
    await expect(page.getByText(enValue)).toBeVisible();
  });
});

test.describe("US6 — CMS RBAC", () => {
  test("anonymous visitors are redirected and Product Managers are refused the module", async ({
    page,
  }) => {
    test.skip(test.info().project.name !== "desktop", "RBAC asserted on the desktop project");
    test.setTimeout(180_000);

    await page.goto("/en/admin/cms");
    await expect(page).toHaveURL(/\/en\/login/);

    await signIn(page, E2E_USERS.productManager);
    await page.goto("/en/admin/cms");
    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  });
});
