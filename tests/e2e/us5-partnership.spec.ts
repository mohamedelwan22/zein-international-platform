import { expect, test, type Page } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS } from "./auth-fixtures";

/**
 * T062 — Partnership intake + staff triage E2E (US5, FR-018/FR-035/FR-040).
 *
 * - a visitor submits the dedicated partnership form and sees the localized
 *   success state;
 * - an attachment the browser cannot vet (a renamed PNG) is rejected by the
 *   server, the error summary receives focus, and the entered data is
 *   preserved (spec edge case "Attachment failures");
 * - the Arabic form is RTL and submits with Arabic feedback;
 * - Sales/Business triages a seeded request in the admin queue, downloads the
 *   attachment (audited), and a Content Manager is refused the module (403).
 *
 * Runs on the desktop project where the admin sidebar and form layout are
 * fully visible.
 */

const I18N = {
  en: {
    formTitle: "Partnership request",
    submit: "Send partnership request",
    successTitle: "Request received",
    genericError: "Something went wrong. Please try again.",
    fileUnsupported: "This file type is not allowed.",
    dataPreserved: "Your entered data was preserved — only the attachment needs to be corrected.",
  },
  ar: {
    formTitle: "طلب شراكة",
    submit: "إرسال طلب الشراكة",
    successTitle: "تم استلام الطلب",
  },
} as const;

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@us5-e2e.test`;
}

function uniqueCompany(prefix: string): string {
  return `${prefix} ${Date.now()} ${Math.floor(Math.random() * 1e6)}`;
}

async function fillPartnershipForm(page: Page, locale: "en" | "ar", email: string, company: string) {
  await page.locator("#partnership-company").fill(company);
  await page
    .locator("#partnership-name")
    .fill(locale === "ar" ? "ليلى الحربي" : "Layla Alharbi");
  await page.locator("#partnership-email").fill(email);
  await page
    .locator("#partnership-message")
    .fill(locale === "ar" ? "نرغب في توزيع منتجاتكم." : "We would like to distribute your products.");
  await page.locator("#partnership-consent").check();
}

async function signIn(page: Page, user: { email: string }): Promise<void> {
  await page.goto("/en/login");
  await page.locator('input[name="email"]').fill(user.email);
  await page.locator('input[name="password"]').fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/admin(?:\/|\?|$)/);
}

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const PDF_BYTES = Buffer.from("%PDF-1.7\nE2E partnership attachment\n%%EOF");

test.describe("US5 — public partnership form (FR-018/FR-040)", () => {
  test("a visitor submits the form and sees the localized success state", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "form journey asserted on the desktop project");

    await page.goto("/en/partnership");
    await expect(
      page.getByRole("heading", { name: I18N.en.formTitle, level: 1 }),
    ).toBeVisible();

    await fillPartnershipForm(page, "en", uniqueEmail("us5-public"), uniqueCompany("Partner"));

    await page.getByRole("button", { name: I18N.en.submit }).click();
    await expect(page.getByRole("heading", { name: I18N.en.successTitle })).toBeVisible();
  });

  test("rejects a renamed image attachment, focuses the summary and preserves the data", async ({
    page,
  }) => {
    test.skip(test.info().project.name !== "desktop", "form journey asserted on the desktop project");

    await page.goto("/en/partnership");

    const company = uniqueCompany("Preserve Co");
    await fillPartnershipForm(page, "en", uniqueEmail("us5-attach"), company);
    await page.locator("#partnership-attachment").setInputFiles({
      name: "proposal.pdf",
      mimeType: "application/pdf",
      buffer: PNG_BYTES,
    });

    await page.getByRole("button", { name: I18N.en.submit }).click();

    const summary = page.locator('[role="alert"][tabindex="-1"]');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText(I18N.en.genericError);
    await expect(summary).toContainText(I18N.en.dataPreserved);
    await expect(summary).toBeFocused();

    await expect(page.locator("#partnership-attachment-error")).toHaveText(I18N.en.fileUnsupported);
    // Entered data is preserved for correction.
    await expect(page.locator("#partnership-company")).toHaveValue(company);
  });

  test("the Arabic form is RTL and submits with Arabic feedback", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "form journey asserted on the desktop project");

    await page.goto("/ar/partnership");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(
      page.getByRole("heading", { name: I18N.ar.formTitle, level: 1 }),
    ).toBeVisible();

    await fillPartnershipForm(page, "ar", uniqueEmail("us5-arabic"), uniqueCompany("شركة"));

    await page.getByRole("button", { name: I18N.ar.submit }).click();
    await expect(page.getByRole("heading", { name: I18N.ar.successTitle })).toBeVisible();
  });
});

test.describe("US5 — staff triage of the partnership queue (FR-035, SC-012)", () => {
  test("Sales/Business triages a request and downloads its attachment", async ({ page, request }) => {
    test.skip(test.info().project.name !== "desktop", "admin triage asserted on the desktop project");

    const company = uniqueCompany("E2E Partner");
    const seeded = await request.post("/api/partnerships", {
      multipart: {
        company,
        name: "E2E Triage",
        email: uniqueEmail("us5-triage"),
        message: "Please route this to the partnerships team.",
        consentAccepted: "true",
        locale: "en",
        attachment: { name: "deck.pdf", mimeType: "application/pdf", buffer: PDF_BYTES },
      },
    });
    expect(seeded.status()).toBe(201);

    await signIn(page, E2E_USERS.salesBusiness);
    await page.goto("/en/admin/partnerships");
    await expect(
      page.getByRole("heading", { level: 1, name: "Partnership requests" }),
    ).toBeVisible();

    const row = page.getByRole("row", { name: new RegExp(company) });
    await expect(row).toBeVisible();
    await row.getByRole("link", { name: "Open" }).click();

    await expect(page.getByRole("heading", { name: "Partnership request" })).toBeVisible();

    await page.getByRole("button", { name: "Move to: Contacted" }).click();
    await expect(page.getByText(/Status:/).first()).toContainText("Contacted");

    await page.locator("#lead-notes").fill("Reviewed the partnership deck; scheduling a call.");
    await page.getByRole("button", { name: "Save notes" }).click();
    await expect(page.getByText("Notes saved.")).toBeVisible();

    const download = page.getByRole("link", { name: "Download attachment" });
    await expect(download).toBeVisible();
    const href = await download.getAttribute("href");
    expect(href).toBeTruthy();
    const downloadResponse = await page.request.get(href!);
    expect(downloadResponse.status()).toBe(200);
    expect(downloadResponse.headers()["content-disposition"]).toContain("deck.pdf");
  });

  test("a Content Manager is refused the partnerships module (403)", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "RBAC asserted on the desktop project");

    await signIn(page, E2E_USERS.contentManager);
    await page.goto("/en/admin/partnerships");
    await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  });
});
