import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * T040 [US2] — public brands directory & product catalog E2E (FR-008/009/010).
 *
 * - SC-002: a visitor at the homepage reaches a product detail page in ≤3
 *   interactions and can initiate an inquiry from it. Measured on the desktop
 *   project where the primary nav has no extra menu step:
 *     Home → [1] "Products" nav link → [2] product card → [3] inquiry CTA.
 * - FR-008: brand directory (logo, name, country, category, short description,
 *   featured) and brand detail (about, history, distribution, brand products,
 *   inquiry CTA).
 * - FR-009: catalog filters (brand/category/country, clearable) preserve the
 *   language selection across a language switch.
 * - FR-010: product pages contain no price/stock/cart/checkout/ordering/
 *   rating/review/e-commerce tokens — in English and Arabic.
 * - Zero-catalog routes render the localized empty states, never a blank page.
 *
 * Content is deliberately data-dependent: a seeded dev DB has no published
 * brands/products yet, so the journeys execute when records exist (e.g. the
 * non-published placeholder fixtures allowed by the task) and the localized
 * empty states are asserted otherwise. Tokens use word/affix-safe patterns so
 * legitimately informational copy (e.g. "calories", "chicken stock", "gift
 * basket") never trips FR-010.
 */

type Locale = "en" | "ar";

const I18N = {
  en: {
    brandsTitle: "Our brands",
    productsTitle: "Our products",
    productsNav: "Products",
    featured: "Featured",
    countryLabel: "Country",
    categoryLabel: "Category",
    aboutLabel: "About",
    historyTitle: "History",
    distributionTitle: "Distribution information",
    productsTitleLabel: "Brand products",
    filterBrand: "Brand",
    filterCategory: "Category",
    filterCountry: "Country of origin",
    clearFilters: "Clear filters",
    emptyBrands: "No brands published yet",
    emptyProducts: "No products published yet",
    inquiryCta: /send( an)? inquiry/i,
    switchTo: "العربية",
  },
  ar: {
    brandsTitle: "علاماتنا التجارية",
    productsTitle: "منتجاتنا",
    productsNav: "المنتجات",
    featured: "مميزة",
    countryLabel: "الدولة",
    categoryLabel: "الفئة",
    aboutLabel: "نبذة",
    historyTitle: "السجل التاريخي",
    distributionTitle: "معلومات التوزيع",
    productsTitleLabel: "منتجات العلامة التجارية",
    filterBrand: "العلامة التجارية",
    filterCategory: "الفئة",
    filterCountry: "بلد المنشأ",
    clearFilters: "مسح عوامل التصفية",
    emptyBrands: "لا توجد علامات تجارية منشورة بعد",
    emptyProducts: "لا توجد منتجات منشورة بعد",
    inquiryCta: /أرسل استفسار/i,
    switchTo: "English",
  },
} as const;

/** Commerce surface the catalog must never render (FR-010). */
const ECOMMERCE_TOKENS: RegExp[] = [
  // English — collocations avoid false positives on informational nouns
  // ("in order to", "calories", "chicken stock", "gift basket").
  /\bprice\b/i,
  /\bcheckout\b/i,
  /\bcheck\s*out\b/i,
  /\bpayment\b/i,
  /\bordering\b/i,
  /\bplace\s+(?:an\s+)?order\b/i,
  /\border\s+now\b/i,
  /\brating\b/i,
  /\breview\b/i,
  /\bbuy\b/i,
  /\bpurchase\b/i,
  /\bshopping\b/i,
  /\bshopping\s*cart\b/i,
  /\badd\s*(?:to\s*)?cart\b/i,
  /\bin stock\b/i,
  /\bout of stock\b/i,
  /\be-commerce\b/i,
  /\bcurrency\b/i,
  /\b(?:USD|SAR|AED|EUR|GBP|PHP)\b/i,
  /[$€£]\s?\d/,
  // Arabic — "سعر" stays out of "سعرات" (calories); affixed forms covered.
  /(?:أسعار|السعر(?!ات\b)|سعر(?!ات\b))/,
  /(?:المخزون|\bمخزون\b)/,
  /(?:سلة التسوق|عربة التسوق|أضف إلى السلة|أضِف إلى السلة)/,
  /(?:الدفع|\bدفع\b)/,
  /(?:التقييم|التقييمات|\bتقييم\b)/,
  /(?:المراجعة|\bمراجعة\b)/,
  /(?:الشراء|\bشراء\b)/,
  /(?:الطلب|\bطلب\b)/,
  /(?:ريال|درهم|جنيه|دولار)/,
];

test.describe("US2 — public brands directory & product catalog (FR-008/009/010)", () => {
  test("SC-002: home → catalog → product detail in ≤3 interactions with the inquiry CTA reachable (desktop)", async ({
    page,
  }) => {
    test.skip(test.info().project.name !== "desktop", "interaction budget is measured on the desktop project");

    await page.goto("/en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    // Interaction 1: home → catalog via the primary navigation.
    const productsLink = page.getByRole("banner").getByRole("link", { name: I18N.en.productsNav });
    await expect(productsLink).toBeVisible();
    await productsLink.click();
    await expect(page).toHaveURL(/\/en\/products(?:\?|$)/);

    if (await hasRecordCards(page, productCards(page, "en"))) {
      // Interaction 2: catalog → detail.
      await productCards(page, "en").first().click();
      await expect(page).toHaveURL(/\/en\/products\/[^/?]+(?:\?|$)/);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();

      // Interaction 3: detail → inquiry.
      await expectInquiryCtaReachable(page, "en");
      await expectNoEcommerce(page);
    } else {
      await expectEmptyState(page, I18N.en.emptyProducts);
      await expectNoEcommerce(page);
    }
  });

  test("FR-010: no price/stock/cart/checkout/ordering/rating/review tokens on any product page (en + ar)", async ({
    page,
  }) => {
    test.skip(test.info().project.name !== "desktop", "token scan runs on the desktop project");

    for (const locale of ["en", "ar"] as const) {
      await page.goto(`/${locale}/products`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expectNoEcommerce(page);

      if (await hasRecordCards(page, productCards(page, locale))) {
        await productCards(page, locale).first().click();
        await expect(page).toHaveURL(new RegExp(`/${locale}/products/[^/?]+`));
        await expectNoEcommerce(page);
      }
    }
  });

  test("SC-002: brand directory and detail expose the FR-008 fields (desktop)", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "field assertions run on the desktop project");

    await page.goto("/en/brands");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { name: I18N.en.brandsTitle, level: 1 })).toBeVisible();

    if (await hasRecordCards(page, brandCards(page, "en"))) {
      await expect(brandCards(page, "en").first()).toBeVisible();

      const featured = page.getByText(I18N.en.featured, { exact: true });
      if ((await featured.count()) > 0) await expect(featured.first()).toBeVisible();

      await brandCards(page, "en").first().click();
      await expect(page).toHaveURL(/\/en\/brands\/[^/?]+/);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();

      for (const label of [
        I18N.en.aboutLabel,
        I18N.en.historyTitle,
        I18N.en.distributionTitle,
        I18N.en.productsTitleLabel,
      ]) {
        await expect(page.getByRole("heading", { name: label, level: 2 })).toBeVisible();
      }
      for (const label of [I18N.en.countryLabel, I18N.en.categoryLabel]) {
        await expect(page.getByText(label).first()).toBeVisible();
      }

      await expectInquiryCtaReachable(page, "en");
      await expectNoEcommerce(page);
    } else {
      await expectEmptyState(page, I18N.en.emptyBrands);
    }
  });

  test("FR-009: catalog filters preserve the language selection (desktop)", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "filter controls are exercised on the desktop project");

    await page.goto("/en/products");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    if (!(await hasRecordCards(page, productCards(page, "en")))) {
      await expectEmptyState(page, I18N.en.emptyProducts);
      return;
    }

    const filterBrand = page.getByRole("combobox", { name: I18N.en.filterBrand });
    await expect(filterBrand).toBeVisible();
    await expect(page.getByRole("combobox", { name: I18N.en.filterCategory })).toBeVisible();
    await expect(page.getByRole("combobox", { name: I18N.en.filterCountry })).toBeVisible();
    await expect(page.getByRole("button", { name: I18N.en.clearFilters }).first()).toBeVisible();

    // Applying a filter must keep the English locale selection.
    const optionCount = await filterBrand.locator("option").count();
    if (optionCount > 1) {
      await filterBrand.selectOption({ index: 1 });
      await expect(page).toHaveURL(/\/en\/products(?:\?|$)/);
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(page.getByRole("heading", { level: 1 }).first()).toContainText(I18N.en.productsTitle);
    }

    // Switching language must preserve the filtered catalog location (SC-001 parity).
    await page.getByRole("link", { name: I18N.en.switchTo }).click();
    await expect(page).toHaveURL(/\/ar\/products(?:\?|$)/);
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.getByRole("heading", { level: 1 }).first()).toContainText(I18N.ar.productsTitle);
  });

  test("SC-002: zero-catalog routes show the localized empty states, never a blank page", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "empty-state assertions run on the desktop project");

    for (const locale of ["en", "ar"] as const) {
      await page.goto(`/${locale}/products`);
      if (!(await hasRecordCards(page, productCards(page, locale)))) {
        await expectEmptyState(page, I18N[locale].emptyProducts);
      }

      await page.goto(`/${locale}/brands`);
      if (!(await hasRecordCards(page, brandCards(page, locale)))) {
        await expectEmptyState(page, I18N[locale].emptyBrands);
      }
    }
  });
});

function productCards(page: Page, locale: Locale): Locator {
  return page.locator(`main a[href^='/${locale}/products/']`);
}

function brandCards(page: Page, locale: Locale): Locator {
  return page.locator(`main a[href^='/${locale}/brands/']`);
}

/** True when the page rendered at least one record card (vs. an empty state). */
async function hasRecordCards(page: Page, cards: Locator): Promise<boolean> {
  await expect(page.locator("main").first()).toBeVisible();
  return (await cards.count()) > 0;
}

/** The inquiry CTA must be a real, enabled control (link or button). */
async function expectInquiryCtaReachable(page: Page, locale: Locale) {
  const cta = page
    .getByRole("link", { name: I18N[locale].inquiryCta })
    .first()
    .or(page.getByRole("button", { name: I18N[locale].inquiryCta }).first());
  await expect(cta).toBeVisible();
  await expect(cta).toBeEnabled();
}

async function expectEmptyState(page: Page, title: string) {
  await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
}

/** FR-010: the visible page content must carry no e-commerce surface. */
async function expectNoEcommerce(page: Page) {
  const text = await page.locator("main").innerText();
  const hits = ECOMMERCE_TOKENS.filter((token) => text.match(token));
  expect(hits, `catalog must stay informational (FR-010); found: ${hits.join(", ")}`).toEqual([]);
}