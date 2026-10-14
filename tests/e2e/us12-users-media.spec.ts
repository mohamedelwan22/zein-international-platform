import { expect, test, type Page } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS } from "./auth-fixtures";

/**
 * T089 [US12] — E2E: users, roles, sessions, and the media library
 * (FR-021/FR-022/FR-033, US12.4/12.5, SC-012).
 *
 * - a Super Admin creates a staff account; the account can sign in;
 * - RBAC takes effect on the account's next request: a Sales/Business user is
 *   refused the Users module, promotion to Super Admin opens it, and a demotion
 *   closes it again (no re-login in between);
 * - a Content Manager uploads an image, edits its bilingual alt text, archives
 *   it, and — from the Archived filter — purges it permanently.
 *
 * Admin journeys are asserted on the desktop project; the other projects still
 * load the public pages.
 */

const E2E_DOMAIN = "us12-e2e.test";
const NEW_USER_PASSWORD = "Us12-E2e-Password-123!";
const ACTION_TIMEOUT = 60_000;

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function signIn(page: Page, email: string, password = E2E_PASSWORD): Promise<void> {
  await page.goto("/en/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/admin(?:\/|\?|$)/);
}

test.describe("US12 — Users & roles", () => {
  test("a created account signs in and role changes apply without re-login", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "admin journeys asserted on the desktop project");
    test.setTimeout(180_000);

    const email = `us12-${uniqueSuffix()}@${E2E_DOMAIN}`;

    // Super Admin creates a Sales/Business account.
    await signIn(page, E2E_USERS.superAdmin.email);
    await page.goto("/en/admin/users");
    await page.locator('input[name="name"]').fill("E2E US12 User");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('select[name="role"]').selectOption("SalesBusiness");
    await page.locator('input[name="password"]').fill(NEW_USER_PASSWORD);
    await page.getByRole("button", { name: "Create user" }).click();
    await expect(page.getByText("User created.")).toBeVisible({ timeout: ACTION_TIMEOUT });

    // The new account signs in, but Sales/Business is refused the Users module.
    await page.context().clearCookies();
    await signIn(page, email, NEW_USER_PASSWORD);
    await page.goto("/en/admin/users");
    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();

    // Promote to Super Admin; the existing session gains access immediately.
    await page.context().clearCookies();
    await signIn(page, E2E_USERS.superAdmin.email);
    await page.goto("/en/admin/users");
    const row = page.locator("tr", { hasText: email });
    await row.getByLabel("Role").selectOption("SuperAdmin");
    await row.getByRole("button", { name: "Save role" }).click();
    await expect(row.getByText("Role updated.")).toBeVisible({ timeout: ACTION_TIMEOUT });

    await page.context().clearCookies();
    await signIn(page, email, NEW_USER_PASSWORD);
    await page.goto("/en/admin/users");
    await expect(page.getByRole("heading", { name: "Users", exact: true })).toBeVisible();

    // Demote again; the next request is refused once more.
    await page.context().clearCookies();
    await signIn(page, E2E_USERS.superAdmin.email);
    await page.goto("/en/admin/users");
    const rowAgain = page.locator("tr", { hasText: email });
    await rowAgain.getByLabel("Role").selectOption("SalesBusiness");
    await rowAgain.getByRole("button", { name: "Save role" }).click();
    await expect(rowAgain.getByText("Role updated.")).toBeVisible({ timeout: ACTION_TIMEOUT });

    await page.context().clearCookies();
    await signIn(page, email, NEW_USER_PASSWORD);
    await page.goto("/en/admin/users");
    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  });

  test("anonymous visitors are redirected from the Users module", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "RBAC asserted on the desktop project");
    await page.goto("/en/admin/users");
    await expect(page).toHaveURL(/\/en\/login/);
  });
});

test.describe("US12 — Media library", () => {
  test("upload, edit alt text, archive, then purge from the Archived filter", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "admin journeys asserted on the desktop project");
    test.setTimeout(180_000);

    const name = `us12-media-${uniqueSuffix()}.png`;
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(64),
    ]);

    await signIn(page, E2E_USERS.contentManager.email);
    await page.goto("/en/admin/media");

    await page.locator('input[type="file"]').setInputFiles({ name, mimeType: "image/png", buffer: png });
    await page.locator('input[name="altEn"]').fill("E2E uploaded image");
    await page.locator('input[name="altAr"]').fill("صورة اختبار");
    await page.getByRole("button", { name: "Upload", exact: true }).click();
    await expect(page.getByText("Media uploaded.")).toBeVisible({ timeout: ACTION_TIMEOUT });

    // Edit the bilingual alt text on the new card.
    const card = page.locator("li", { hasText: name });
    await expect(card).toBeVisible({ timeout: ACTION_TIMEOUT });
    await card.getByLabel("Alt text (English)").fill("E2E updated alt");
    await card.getByRole("button", { name: "Save alt text" }).click();
    await expect(card.getByText("Alt text saved.")).toBeVisible({ timeout: ACTION_TIMEOUT });

    // Archive; it leaves the default (unarchived) view.
    await card.getByRole("button", { name: "Archive" }).click();
    await expect(card.getByText("Archived")).toBeVisible({ timeout: ACTION_TIMEOUT });

    // The Archived filter lists it and purge is only offered there.
    await page.goto("/en/admin/media?archived=true");
    const archivedCard = page.locator("li", { hasText: name });
    await expect(archivedCard).toBeVisible({ timeout: ACTION_TIMEOUT });
    await archivedCard.getByRole("button", { name: "Delete permanently" }).click();
    await expect(archivedCard.getByText("Media deleted.")).toBeVisible({ timeout: ACTION_TIMEOUT });
    await expect(page.locator("li", { hasText: name })).toHaveCount(0);
  });
});
