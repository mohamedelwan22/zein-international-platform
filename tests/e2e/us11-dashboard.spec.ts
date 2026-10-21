import { expect, test, type Page } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS } from "./auth-fixtures";
import { noHorizontalScroll, scanA11y } from "./helpers";

/**
 * T107 [US11] — E2E: the dashboard and the activity log (FR-023/FR-035,
 * SC-012, contracts/admin-api.md §2/§10).
 *
 * - the admin landing page is a real overview: a count per module, a link
 *   into every module the signed-in role may read, and the most recent
 *   recorded activity;
 * - `/admin/activity` lists the append-only log with actor, action, target
 *   and time, and offers filters (actor, action, entity type, date range)
 *   plus pagination — with no write/edit/delete control anywhere on the page;
 * - a role without `activity:read` is refused the log (US11 scenario 3) while
 *   still reaching the dashboard (`dashboard:read` is granted to every role);
 * - a sign-in and a sign-out both land on the record.
 *
 * The journeys run on the desktop project; the responsive/accessibility
 * checks run on every project.
 */

const COUNT_KEYS = [
  "brands",
  "products",
  "categories",
  "suppliers",
  "clients",
  "locations",
  "inquiries",
  "partnerships",
  "content",
  "media",
] as const;

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/en/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  // The dev server compiles the admin section on demand — the redirect waits
  // for that first compile, so this needs more headroom than the default.
  await expect(page).toHaveURL(/\/en\/admin(?:\/|\?|$)/, { timeout: 120_000 });
}

test.describe("US11 — dashboard overview and activity log", () => {
  test("the dashboard shows a count per module, the entry points and the recent activity", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "the dashboard layout is asserted on the desktop project");
    test.setTimeout(300_000);

    await signIn(page, E2E_USERS.superAdmin.email);

    const main = page.locator("main");
    await expect(main.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();

    // A count for every module in the overview.
    for (const key of COUNT_KEYS) {
      await expect(main.getByTestId(`dashboard-count-${key}`)).toBeVisible();
    }

    // An entry point into every module the role may read.
    await expect(main.getByRole("link", { name: "Brands" })).toHaveAttribute(
      "href",
      "/en/admin/brands",
    );
    await expect(main.getByRole("link", { name: "Products" })).toHaveAttribute(
      "href",
      "/en/admin/products",
    );
    await expect(main.getByRole("link", { name: "Inquiries" })).toHaveAttribute(
      "href",
      "/en/admin/inquiries",
    );
    await expect(main.getByRole("link", { name: "Activity log" })).toHaveAttribute(
      "href",
      "/en/admin/activity",
    );

    // The recent activity section reflects the sign-in that just happened.
    await expect(main.getByRole("heading", { name: "Recent activity" })).toBeVisible();
    await expect(main.getByTestId("dashboard-activity-item").first()).toBeVisible();
  });

  test("the activity log lists entries with actor, action, target and time, and offers filters", async ({
    page,
  }) => {
    test.skip(test.info().project.name !== "desktop", "the log table is asserted on the desktop project");
    test.setTimeout(300_000);

    await signIn(page, E2E_USERS.superAdmin.email);

    await page.goto("/en/admin/activity");
    const main = page.locator("main");
    await expect(main.getByRole("heading", { level: 1, name: "Activity log" })).toBeVisible();

    // Filters: actor, action, entity type and date range. The labels are
    // matched exactly — a substring match for "To" would also hit "Actor".
    await expect(main.getByLabel("Actor", { exact: true })).toBeVisible();
    await expect(main.getByLabel("Action", { exact: true })).toBeVisible();
    await expect(main.getByLabel("Entity type", { exact: true })).toBeVisible();
    await expect(main.getByLabel("From", { exact: true })).toBeVisible();
    await expect(main.getByLabel("To", { exact: true })).toBeVisible();

    // The log itself — the sign-in of this session is on the record.
    const rows = main.getByTestId("activity-row");
    await expect(rows.first()).toBeVisible();
    await expect(main.getByTestId("activity-action").filter({ hasText: "login" }).first()).toBeVisible();

    // Read-only: the log offers no create, edit or delete control.
    await expect(main.getByRole("button", { name: /create|save|delete|remove/i })).toHaveCount(0);

    // Filtering by action narrows the result set to that action.
    await main.getByLabel("Action", { exact: true }).selectOption("login");
    await main.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/action=login/);
    await expect(main.getByTestId("activity-action").filter({ hasText: "login" })).toHaveCount(
      await main.getByTestId("activity-row").count(),
    );
  });

  test("a role without activity:read is refused the log but keeps the dashboard", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "RBAC is asserted on the desktop project");
    test.setTimeout(300_000);

    await signIn(page, E2E_USERS.productManager.email);

    await page.goto("/en/admin/activity");
    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
    await expect(
      page.getByText("You do not have permission to perform this action."),
    ).toBeVisible();

    // `dashboard:read` is granted to every role.
    await page.goto("/en/admin");
    const main = page.locator("main");
    await expect(main.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    await expect(main.getByTestId("dashboard-count-brands")).toBeVisible();
    // The entry points follow the permission matrix, not the module list.
    await expect(main.getByRole("link", { name: "Brands" })).toHaveAttribute(
      "href",
      "/en/admin/brands",
    );
    await expect(main.getByRole("link", { name: "Inquiries" })).toHaveCount(0);
  });

  test("signing in and signing out are both recorded on the log", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "the log is asserted on the desktop project");
    // Two sign-ins plus two admin compiles — the dev server needs room.
    test.setTimeout(300_000);

    await signIn(page, E2E_USERS.contentManager.email);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/en\/login(?:\?|$)/);

    // Sign back in and read the log back for this actor.
    await signIn(page, E2E_USERS.contentManager.email);
    await page.goto(
      `/en/admin/activity?actor=${encodeURIComponent(E2E_USERS.contentManager.email)}`,
    );
    const main = page.locator("main");
    await expect(main.getByTestId("activity-row").first()).toBeVisible();
    await expect(main.getByTestId("activity-action").filter({ hasText: "login" }).first()).toBeVisible();
    await expect(main.getByTestId("activity-action").filter({ hasText: "logout" }).first()).toBeVisible();
  });

  test("the dashboard and the log are accessible and do not scroll horizontally", async ({ page }) => {
    test.setTimeout(300_000);

    await signIn(page, E2E_USERS.superAdmin.email);

    await page.goto("/en/admin");
    await expect(page.locator("main").getByTestId("dashboard-count-brands")).toBeVisible();
    await scanA11y(page);
    await noHorizontalScroll(page);

    await page.goto("/en/admin/activity");
    await expect(page.locator("main").getByTestId("activity-row").first()).toBeVisible();
    await scanA11y(page);
    await noHorizontalScroll(page);
  });
});
