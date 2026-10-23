import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export async function scanA11y(page: Page, tag?: string) {
  // Axe computes contrast against the *effective* rendered colours, so a
  // running entrance animation (Framer Motion fades opacity 0 → 1) reports
  // false contrast failures on opaque elements. Wait for the main content to
  // finish animating (bounded so a deliberately translucent element still
  // gets analysed) before scanning.
  await page
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll("main *")).every(
          (element) => Number.parseFloat(getComputedStyle(element).opacity) >= 0.99,
        ),
      undefined,
      { timeout: 5_000 },
    )
    .catch(() => undefined);

  const results = await new AxeBuilder({ page })
    .withTags(tag ? [tag] : ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations, results.violations.map((v) => `${v.id}: ${v.help}`).join("\n")).toEqual([]);
}

export async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "page must not scroll horizontally").toBeLessThanOrEqual(0);
}