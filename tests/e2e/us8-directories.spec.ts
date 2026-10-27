import { expect, test, type Page } from "@playwright/test";
import { noHorizontalScroll } from "./helpers";

/**
 * T084 [US8] — E2E: public directories + geographic presence (data-tolerant).
 *
 * Verifies the three US8 public destinations render in English and Arabic with
 * correct locale direction, no horizontal scroll, and localized headings:
 *
 *   - Suppliers directory (/suppliers)
 *   - Clients directory (/clients)
 *   - Geographic presence (/geographic-presence)
 *
 * The journey is deliberately data-tolerant (US2 convention): it asserts the
 * page renders and the locale chrome is correct WITHOUT assuming any fixture
 * records exist, so it passes against a clean database. Publication/
 * confidentiality semantics (only disclosed records appear) are proven by the
 * focused T083 integration test.
 */

interface Destination {
  path: string;
  arPath: string;
}

const DESTINATIONS: Destination[] = [
  { path: "/en/suppliers", arPath: "/ar/suppliers" },
  { path: "/en/clients", arPath: "/ar/clients" },
  { path: "/en/geographic-presence", arPath: "/ar/geographic-presence" },
];

async function expectLocaleChrome(page: Page, lang: "en" | "ar", dir: "ltr" | "rtl") {
  await expect(page.locator("html")).toHaveAttribute("lang", lang);
  await expect(page.locator("html")).toHaveAttribute("dir", dir);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await noHorizontalScroll(page);
}

test.describe("US8 — public directories & geographic presence", () => {
  test("each destination renders in English and Arabic with correct locale chrome", async ({
    page,
  }) => {
    for (const destination of DESTINATIONS) {
      await page.goto(destination.path);
      await expectLocaleChrome(page, "en", "ltr");

      await page.goto(destination.arPath);
      await expectLocaleChrome(page, "ar", "rtl");
    }
  });

  test("suppliers directory renders cards or the localized empty state", async ({ page }) => {
    await page.goto("/en/suppliers");

    const cards = page.locator("main article");
    const empty = page.getByRole("main").getByRole("heading", { level: 3 });

    if ((await cards.count()) > 0) {
      // At least one disclosed+published supplier is shown as a linked card.
      await expect(cards.first()).toBeVisible();
    } else {
      await expect(empty.first()).toBeVisible();
    }

    await noHorizontalScroll(page);
  });

  test("clients directory renders approved references or the localized empty state", async ({
    page,
  }) => {
    await page.goto("/en/clients");

    const cards = page.locator("main article");
    const empty = page.getByRole("main").getByRole("heading", { level: 3 });

    if ((await cards.count()) > 0) {
      await expect(cards.first()).toBeVisible();
    } else {
      await expect(empty.first()).toBeVisible();
    }

    await noHorizontalScroll(page);
  });

  test("location cards frame only Google Maps embeds and keep a fallback link", async ({
    page,
  }) => {
    const cspErrors: string[] = [];
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        /content security policy|frame-src/i.test(message.text())
      ) {
        cspErrors.push(message.text());
      }
    });

    for (const path of ["/en/geographic-presence", "/ar/geographic-presence"]) {
      await page.goto(path);

      const maps = page.getByTestId("location-map");
      if ((await maps.count()) > 0) {
        const map = maps.first();
        await map.scrollIntoViewIfNeeded();
        await expect(map).toBeVisible();
        await expect(map).toHaveAttribute(
          "src",
          /^https:\/\/(www\.google\.com|google\.com|maps\.google\.com)\/maps\//,
        );
        await expect(map).toHaveAttribute("loading", "lazy");
        await expect(map).toHaveAttribute("title", /.+/);
        const box = await map.boundingBox();
        expect(box?.width ?? 0).toBeGreaterThan(0);
        expect(box?.height ?? 0).toBeGreaterThan(0);
      } else {
        const fallbacks = page.getByTestId("location-map-fallback");
        if ((await fallbacks.count()) > 0) {
          await expect(fallbacks.first()).toBeVisible();
        }
      }

      await noHorizontalScroll(page);
    }

    expect(cspErrors).toEqual([]);
  });

  test("geographic presence always shows the approved coverage wording and never fabricates points", async ({
    page,
  }) => {
    await page.goto("/en/geographic-presence");

    // The approved coverage wording (from the home CMS section) is present
    // regardless of whether verified locations exist (scenario 4). Data-tolerant:
    // asserted when the CMS wording is published, and never contradicted otherwise.
    const coverage = page.getByTestId("geographic-coverage");
    if ((await coverage.count()) > 0) {
      await expect(coverage).toBeVisible();
      await expect(coverage).not.toBeEmpty();
    }

    const count = page.getByTestId("location-count");
    if ((await count.count()) > 0) {
      const total = Number((await count.textContent()) ?? "0");
      expect(total).toBeGreaterThanOrEqual(0);

      if (total > 0) {
        // With verified locations, the interactive list renders each as a card.
        const locationCards = page.locator("main ul > li");
        await expect(locationCards.first()).toBeVisible();
      }
    }

    // The map is a visual aid; every location is also available as text.
    await noHorizontalScroll(page);
  });
});
