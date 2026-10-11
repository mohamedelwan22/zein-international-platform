import { expect, test, type Page } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS } from "./auth-fixtures";

/**
 * T047 [US3] — sign-in + role-based access E2E (FR-021/FR-022, US3.1–US3.3).
 *
 * Four accounts (one per documented role) are provisioned by
 * `tests/e2e/global-setup.ts`. Each role signs in through the real login form
 * (Credentials provider + argon2 + JWT session) and must see only the admin
 * modules its permission matrix grants. Direct navigation to a forbidden
 * module URL is refused, and signing out (or having no session) forces
 * re-authentication before any admin content shows.
 *
 * Content is asserted by stable English labels; the spec runs on the desktop
 * project so the full sidebar is visible.
 */

const ADMIN_NAV_LABEL = "Admin navigation";

const LABELS = {
  dashboard: "Dashboard",
  brands: "Brands",
  products: "Products",
  categories: "Categories",
  suppliers: "Suppliers",
  clients: "Clients",
  locations: "Locations",
  cms: "Content",
  media: "Media library",
  seo: "SEO",
  inquiries: "Inquiries",
  partnerships: "Partnership requests",
  users: "Users",
  settings: "Settings",
  activity: "Activity log",
} as const;

type Section = keyof typeof LABELS;

const ALL_SECTIONS = Object.keys(LABELS) as Section[];

/** Expected sidebar modules per role — mirrors src/server/auth/permissions.ts. */
const ROLE_SECTIONS: Record<string, Section[]> = {
  SuperAdmin: ALL_SECTIONS,
  ContentManager: [
    "dashboard",
    "brands",
    "products",
    "categories",
    "suppliers",
    "clients",
    "locations",
    "cms",
    "media",
    "seo",
    "settings",
    "activity",
  ],
  ProductManager: [
    "dashboard",
    "brands",
    "products",
    "categories",
    "suppliers",
    "locations",
    "media",
  ],
  SalesBusiness: ["dashboard", "clients", "inquiries", "partnerships", "media"],
};

async function signIn(
  page: Page,
  user: { email: string },
  locale: "en" | "ar" = "en",
): Promise<void> {
  await page.goto(`/${locale}/login`);
  await page.locator('input[name="email"]').fill(user.email);
  await page.locator('input[name="password"]').fill(E2E_PASSWORD);
  await page.getByRole("button", { name: locale === "ar" ? "تسجيل الدخول" : "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/admin(?:/|\\?|$)`));
}

/** The set of module labels present in the admin sidebar. */
async function sidebarLabels(page: Page): Promise<string[]> {
  const nav = page.getByRole("navigation", { name: ADMIN_NAV_LABEL });
  await expect(nav).toBeVisible();
  return nav.getByRole("link").allInnerTexts();
}

test.describe("US3 — sign-in + role-based admin access (FR-021/FR-022)", () => {
  test("each role reaches the dashboard and sees only its permitted modules", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "full sidebar is asserted on the desktop project");

    for (const user of Object.values(E2E_USERS)) {
      const role = user.role;
      await page.context().clearCookies();
      await signIn(page, user);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      const labels = (await sidebarLabels(page)).map((text) => text.trim());
      const expected = ROLE_SECTIONS[role];

      for (const section of expected) {
        expect(labels, `${role} must see "${LABELS[section]}"`).toContain(LABELS[section]);
      }
      for (const section of ALL_SECTIONS.filter((s) => !expected.includes(s))) {
        expect(labels, `${role} must NOT see "${LABELS[section]}"`).not.toContain(LABELS[section]);
      }
    }
  });

  test("direct navigation to a forbidden module URL is refused; permitted modules render", async ({
    page,
  }) => {
    test.skip(test.info().project.name !== "desktop", "module URLs are asserted on the desktop project");

    await signIn(page, E2E_USERS.salesBusiness);

    // SalesBusiness has no brands:read → denied, no placeholder.
    await page.goto("/en/admin/brands");
    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
    await expect(
      page.getByText("You do not have permission to perform this action."),
    ).toBeVisible();

    // SalesBusiness has clients:read → the module is reachable (placeholder for now).
    await page.goto("/en/admin/clients");
    await expect(page.getByRole("heading", { name: LABELS.clients })).toBeVisible();
    await expect(page.getByText("Access denied")).toHaveCount(0);
  });

  test("a Content Manager is refused an admin:users URL", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "module URLs are asserted on the desktop project");

    await signIn(page, E2E_USERS.contentManager);
    await page.goto("/en/admin/users");
    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  });

  test("sign-out forces re-authentication before admin content shows", async ({ page }) => {
    await signIn(page, E2E_USERS.superAdmin);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/en\/login(?:\?|$)/);

    await page.goto("/en/admin");
    await expect(page).toHaveURL(/\/en\/login(?:\?|$)/);
  });

  test("an anonymous visitor is redirected from admin to sign-in", async ({ page }) => {
    await page.goto("/en/admin");
    await expect(page).toHaveURL(/\/en\/login(?:\?|$)/);
    await expect(page.locator('input[name="email"]')).toBeVisible();
  });

  test("sign-in feedback (loading/error state) is localized in Arabic", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "localized login form is asserted on the desktop project");

    await page.goto("/ar/login");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.locator('input[name="email"]').fill("nobody@us3-e2e.test");
    await page.locator('input[name="password"]').fill("wrong-password");
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();
    await expect(page.locator('p[role="alert"]')).toContainText(
      "البريد الإلكتروني أو كلمة المرور غير صحيحة",
    );
  });
});
