import { expect, test, type Page } from "@playwright/test";
import { noHorizontalScroll, scanA11y } from "./helpers";

/**
 * T029 [US1] — public site E2E.
 *
 * - SC-001: language switch in ONE action with fully localized render and
 *   correct RTL `dir` (FR-001/FR-002), preserving the current location.
 * - SC-007: axe scan on Home/About in both languages.
 * - SC-008: desktop/laptop/tablet/mobile viewports with zero horizontal
 *   scrolling (Playwright runs every test once per project viewport).
 * - SC-009: Home layout-shift budget (CLS < 0.1) measured on a mobile
 *   viewport via PerformanceObserver — the Lighthouse CLS definition.
 */

const EN_HERO_HEADLINE = "Saudi Authenticity international quality";
const AR_HERO_HEADLINE = "أصالة سعودية بجودة عالمية";
const EN_ABOUT_HEADING = "Our story";
const AR_ABOUT_HEADING = "قصتنا";

test.describe("US1 — public bilingual company website", () => {
  test("SC-001: switch language in one action — fully localized render with correct RTL direction", async ({
    page,
  }) => {
    await page.goto("/en");

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.getByRole("heading", { level: 1 }).first()).toContainText(EN_HERO_HEADLINE);
    await expectNavLinkVisible(page, "Home", "Open navigation menu");

    await page.getByRole("link", { name: "العربية" }).click();

    await expect(page).toHaveURL(/\/ar(\/|$)/);
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 }).first()).toContainText(AR_HERO_HEADLINE);
    await expectNavLinkVisible(page, "الرئيسية", "فتح قائمة التنقل");
    await expect(page.getByRole("link", { name: "اتصل بنا" }).first()).toBeVisible();
  });

  test("SC-001: language switch preserves the current location", async ({ page }) => {
    await page.goto("/en/about");
    await expect(page.getByRole("heading", { name: EN_ABOUT_HEADING, level: 2 })).toBeVisible();

    await page.getByRole("link", { name: "العربية" }).click();

    await expect(page).toHaveURL(/\/ar\/about$/);
    await expect(page.getByRole("heading", { name: AR_ABOUT_HEADING, level: 2 })).toBeVisible();
  });

  const routes = [
    { path: "/en", heading: EN_HERO_HEADLINE },
    { path: "/ar", heading: AR_HERO_HEADLINE },
    { path: "/en/about", heading: EN_ABOUT_HEADING },
    { path: "/ar/about", heading: AR_ABOUT_HEADING },
  ];

  for (const route of routes) {
    test(`SC-008: no horizontal scrolling (${route.path})`, async ({ page }) => {
      await page.goto(route.path);
      await expect(page.getByRole("heading", { name: route.heading }).first()).toBeVisible();
      await noHorizontalScroll(page);
    });
  }

  test("SC-007: Home and About are axe-clean in both languages (desktop)", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "axe scan runs on the desktop project");

    for (const route of routes) {
      await page.goto(route.path);
      await expect(page.getByRole("heading", { name: route.heading }).first()).toBeVisible();
      await scanA11y(page, undefined);
    }
  });

  test("SC-009: Home CLS stays below 0.1 (mobile viewport)", async ({ page }) => {
    test.skip(test.info().project.name !== "mobile", "CLS budget measured on the mobile project");

    const cls = await measureCls(page, "/en");
    expect(cls, `accumulated layout-shift score ${cls} must stay under 0.1`).toBeLessThan(0.1);
  });
});

/** Accumulates layout-shift entries (the Lighthouse CLS definition). */
async function measureCls(page: Page, path: string): Promise<number> {
  await page.addInitScript(() => {
    const target = window as unknown as { __cls: number };
    target.__cls = 0;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<
        PerformanceEntry & { value: number; hadRecentInput?: boolean }
      >) {
        if (!entry.hadRecentInput) {
          target.__cls += entry.value;
        }
      }
    });
    observer.observe({ type: "layout-shift", buffered: true } as PerformanceObserverInit);
  });

  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);

  return page.evaluate(() => (window as unknown as { __cls: number }).__cls);
}

/**
 * Asserts a primary navigation link is reachable: visible directly on
 * desktop-width viewports, or by opening the disclosure menu when narrow.
 */
async function expectNavLinkVisible(
  page: Page,
  linkName: string,
  openMenuLabel: string,
) {
  const viewportWidth = page.viewportSize()?.width ?? 1280;
  if (viewportWidth < 768) {
    await page.getByRole("button", { name: openMenuLabel }).click();
  }
  await expect(page.getByRole("banner").getByRole("link", { name: linkName })).toBeVisible();
}
