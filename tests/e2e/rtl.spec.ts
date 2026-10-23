import { expect, test, type Page } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS } from "./auth-fixtures";
import { noHorizontalScroll, scanA11y } from "./helpers";

/**
 * T113 — dedicated RTL pass (plan.md Risk 2: "RTL regressions in dense admin
 * tables/overlays"; FR-002, FR-041; SC-001, SC-008).
 *
 * Every test in this file carries the `@rtl` tag so `pnpm test:e2e:rtl`
 * (`playwright test --grep @rtl`) selects exactly this suite. The
 * assertions are behavioural — direction attributes, mixed-script handling,
 * zero horizontal overflow in RTL, keyboard reachability and an axe scan of
 * the Arabic render — never text snapshots, so a copy change in the CMS does
 * not invalidate the gate.
 */

const AR_PUBLIC_ROUTES = [
  "/ar",
  "/ar/about",
  "/ar/values",
  "/ar/sustainability",
  "/ar/innovation",
  "/ar/brands",
  "/ar/products",
  "/ar/suppliers",
  "/ar/clients",
  "/ar/geographic-presence",
  "/ar/contact",
  "/ar/partnership",
];

async function signInArabic(page: Page): Promise<void> {
  await page.goto("/ar/login");
  await page.locator('input[name="email"]').fill(E2E_USERS.superAdmin.email);
  await page.locator('input[name="password"]').fill(E2E_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/ar\/admin(?:\/|\?|$)/);
}

test.describe("RTL — Arabic locale render (FR-002, FR-041, SC-001, SC-008)", { tag: "@rtl" }, () => {
  test("every public Arabic route renders right-to-left without horizontal overflow", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    for (const route of AR_PUBLIC_ROUTES) {
      await page.goto(route);
      await expect(page.locator("html"), `${route} must set dir=rtl`).toHaveAttribute("dir", "rtl");
      await expect(page.locator("html"), `${route} must set lang=ar`).toHaveAttribute("lang", "ar");
      await expect(page.getByRole("heading").first(), `${route} must render a heading`).toBeVisible();
      await noHorizontalScroll(page);
    }
  });

  test("mixed-script content keeps an explicit direction override", async ({ page }) => {
    await page.goto("/ar");

    // The document direction stays RTL even where the copy mixes scripts.
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    // The hero statement mixes Arabic with Latin words and is therefore
    // marked `dir="auto"` so the browser resolves the bidi base direction
    // per paragraph instead of the page direction.
    const mixed = page.locator('[dir="auto"]');
    await expect(mixed.first()).toBeVisible();
  });

  test("Arabic public pages are axe-clean (desktop project)", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "axe scan runs on the desktop project");

    for (const route of ["/ar", "/ar/about", "/ar/contact"]) {
      await page.goto(route);
      await expect(page.getByRole("heading").first()).toBeVisible();
      await scanA11y(page, undefined);
    }
  });

  test("keyboard focus enters the page on the skip link", async ({ page }) => {
    await page.goto("/ar");
    await page.keyboard.press("Tab");

    const firstStop = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      return {
        tag: active?.tagName ?? null,
        href: active?.getAttribute("href") ?? null,
      };
    });

    expect(firstStop.tag, "the first tab stop must be a link").toBe("A");
    expect(firstStop.href, "the first tab stop must be the skip link").toBe("#main-content");
  });

  test("admin modules render right-to-left with internal table scrolling", async ({ page }) => {
    test.setTimeout(300_000);
    await signInArabic(page);

    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("navigation").first()).toBeVisible();
    await noHorizontalScroll(page);

    // Dense admin table: the page itself must not scroll horizontally — the
    // table scrolls inside its own region (Risk 2 of plan.md).
    await page.goto("/ar/admin/activity");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await noHorizontalScroll(page);

    await page.goto("/ar/admin/users");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await noHorizontalScroll(page);
  });
});
