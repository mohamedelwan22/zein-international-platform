import { expect, test, type Page } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS } from "./auth-fixtures";

/**
 * T055 [US4] — inquiry intake + staff triage E2E (FR-016/FR-017/FR-040, SC-012).
 *
 * - a visitor submits the contact-page inquiry form and sees the localized
 *   success state;
 * - an incomplete submission is blocked client-side, focuses the error summary
 *   (FR-040) and renders localized field errors;
 * - the Arabic form is RTL and submits with Arabic feedback;
 * - a product-detail CTA carries its context into the form (data-dependent);
 * - Sales/Business triages a lead in the admin queue (open → move to
 *   Contacted → save internal notes) while a Content Manager is refused the
 *   inquiries module (403).
 *
 * Runs on the desktop project where the admin sidebar and form layout are
 * fully visible.
 */

const I18N = {
  en: {
    formTitle: "Send a business inquiry",
    submit: "Send inquiry",
    successTitle: "Inquiry received",
    required: "This field is required.",
    consentRequired: "You must accept the privacy notice to continue.",
    contextProduct: "About this product",
  },
  ar: {
    formTitle: "أرسل استفساراً تجارياً",
    submit: "إرسال الاستفسار",
    successTitle: "تم استلام الاستفسار",
    required: "هذا الحقل مطلوب.",
  },
} as const;

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@us3-e2e.test`;
}

async function fillInquiryForm(page: Page, locale: "en" | "ar", email: string) {
  await page.locator("#inquiry-name").fill(locale === "ar" ? "ليلى الحربي" : "Layla Alharbi");
  await page.locator("#inquiry-email").fill(email);
  await page
    .locator("#inquiry-subject")
    .fill(locale === "ar" ? "استفسار توزيع" : "Distribution inquiry");
  await page
    .locator("#inquiry-message")
    .fill(locale === "ar" ? "هل يمكننا توزيع منتجاتكم؟" : "Could we distribute your products?");
  await page.locator("#inquiry-consent").check();
}

async function signIn(page: Page, user: { email: string }): Promise<void> {
  await page.goto("/en/login");
  await page.locator('input[name="email"]').fill(user.email);
  await page.locator('input[name="password"]').fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/admin(?:\/|\?|$)/);
}

test.describe("US4 — public inquiry form (FR-016/FR-040)", () => {
  test("a visitor submits the form and sees the localized success state", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "form journey asserted on the desktop project");

    await page.goto("/en/contact");
    await expect(page.getByRole("heading", { name: I18N.en.formTitle, level: 2 })).toBeVisible();

    await fillInquiryForm(page, "en", uniqueEmail("us4-public"));
    await page.getByRole("button", { name: I18N.en.submit }).click();

    await expect(
      page.getByRole("heading", { name: I18N.en.successTitle }),
    ).toBeVisible();
  });

  test("blocks an incomplete submission, focuses the summary and shows field errors (FR-040)", async ({
    page,
  }) => {
    test.skip(test.info().project.name !== "desktop", "form journey asserted on the desktop project");

    await page.goto("/en/contact");
    await page.getByRole("button", { name: I18N.en.submit }).click();

    const summary = page.locator('[role="alert"][tabindex="-1"]');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText(I18N.en.required);
    await expect(summary).toContainText(I18N.en.consentRequired);

    // The error summary receives focus (FR-040).
    await expect(summary).toBeFocused();
  });

  test("the Arabic form is RTL and submits with Arabic feedback", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "form journey asserted on the desktop project");

    await page.goto("/ar/contact");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { name: I18N.ar.formTitle, level: 2 })).toBeVisible();

    await fillInquiryForm(page, "ar", uniqueEmail("us4-arabic"));
    await page.getByRole("button", { name: I18N.ar.submit }).click();

    await expect(page.getByRole("heading", { name: I18N.ar.successTitle })).toBeVisible();
  });

  test("a product-detail CTA carries its context into the form", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "context journey asserted on the desktop project");

    await page.goto("/en/products");
    const cards = page.locator('main a[href^="/en/products/"]');
    test.skip((await cards.count()) === 0, "no published products in this database");

    await cards.first().click();
    await expect(page).toHaveURL(/\/en\/products\/[^/?]+/);

    const cta = page.getByRole("link", { name: /send( an)? inquiry/i }).first();
    await expect(cta).toBeVisible();
    await cta.click();

    await expect(page).toHaveURL(/\/en\/contact\?.*type=product/);
    await expect(page.getByText(I18N.en.contextProduct)).toBeVisible();
  });
});

test.describe("US4 — staff triage of the inquiry queue (FR-017, SC-012)", () => {
  test("Sales/Business moves a lead to Contacted and saves internal notes", async ({
    page,
    request,
  }) => {
    test.skip(test.info().project.name !== "desktop", "admin triage asserted on the desktop project");

    const subject = `E2E triage ${Date.now()}`;
    const seeded = await request.post("/api/inquiries", {
      data: {
        type: "general",
        name: "E2E Triage",
        email: uniqueEmail("us4-triage"),
        subject,
        message: "Please route this to the team.",
        consentAccepted: true,
        locale: "en",
      },
    });
    expect(seeded.status()).toBe(201);

    await signIn(page, E2E_USERS.salesBusiness);
    await page.goto("/en/admin/inquiries");
    await expect(page.getByRole("heading", { level: 1, name: "Inquiries" })).toBeVisible();

    const row = page.getByRole("row", { name: new RegExp(subject) });
    await expect(row).toBeVisible();
    await row.getByRole("link", { name: "Open" }).click();

    await expect(page.getByRole("heading", { name: "Inquiry detail" })).toBeVisible();

    await page.getByRole("button", { name: "Move to: Contacted" }).click();
    await expect(page.getByText(/Status:/).first()).toContainText("Contacted");

    await page.locator("#lead-notes").fill("Spoke with the visitor; sent the catalogue.");
    await page.getByRole("button", { name: "Save notes" }).click();
    await expect(page.getByText("Notes saved.")).toBeVisible();
  });

  test("a Content Manager is refused the inquiries module (403)", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "RBAC asserted on the desktop project");

    await signIn(page, E2E_USERS.contentManager);
    await page.goto("/en/admin/inquiries");
    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  });
});
