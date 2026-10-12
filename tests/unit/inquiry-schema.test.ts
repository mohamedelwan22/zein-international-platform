import { describe, expect, it } from "vitest";
import {
  INQUIRY_TYPES,
  inquirySchema,
  issueDetails,
  leadListQuerySchema,
  leadNotesSchema,
  leadStatusSchema,
} from "../../src/server/validation/inquiries";
import en from "../../src/i18n/messages/en.json";
import ar from "../../src/i18n/messages/ar.json";

/**
 * T053 [US4] — inquiry schema (FR-016, Clarification 2, FR-003).
 *
 * The shared schema enforces the contract shape (contracts/public-api.md):
 * - `type` is the FR-016 enum and `subject` is required;
 * - `name`/`email`/`message` are required (email is the mandatory contact
 *   channel — `data-model.md` §2.12);
 * - `consentAccepted` MUST be the literal `true` (Clarification 2);
 * - malformed email/phone are rejected;
 * - every issue message is a `validation.*` key (localized by the form).
 */

const valid = {
  type: "product" as const,
  name: "Aisha Rahman",
  company: "Gulf Build Co.",
  email: "aisha@example.com",
  phone: "+966501234567",
  subject: "Packaging inquiry",
  message: "Please share certified packaging options.",
  consentAccepted: true as const,
  locale: "en" as const,
  productId: "3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  brandId: null,
  supplierId: null,
};

describe("inquirySchema — contact + required fields", () => {
  it("accepts a valid inquiry and defaults the locale to en", () => {
    const result = inquirySchema.safeParse({
      ...valid,
      locale: undefined,
      company: "",
      productId: "",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.locale).toBe("en");
    expect(result.data.company).toBeUndefined();
    expect(result.data.productId).toBeUndefined();
    expect(result.data.type).toBe("product");
  });

  it("requires name, email, subject, and message", () => {
    const result = inquirySchema.safeParse({
      type: "general",
      consentAccepted: true,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    const paths = result.error.issues.map((issue) => issue.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["name", "email", "subject", "message"]));
  });

  it("treats email as the mandatory contact channel and phone as optional", () => {
    expect(
      inquirySchema.safeParse({ ...valid, phone: undefined }).success,
    ).toBe(true);
    expect(
      inquirySchema.safeParse({ ...valid, email: undefined, phone: undefined }).success,
    ).toBe(false);
    expect(
      inquirySchema.safeParse({ ...valid, email: undefined, phone: "+966501234567" }).success,
    ).toBe(false);
  });

  it("accepts every documented inquiry type and rejects an unknown one (FR-016)", () => {
    for (const type of INQUIRY_TYPES) {
      expect(inquirySchema.safeParse({ ...valid, type }).success).toBe(true);
    }

    const result = inquirySchema.safeParse({ ...valid, type: "spam" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.message).toBe("invalidType");
  });

  it("rejects a malformed email with the invalidEmail key", () => {
    const result = inquirySchema.safeParse({ ...valid, email: "not-an-email" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.path.join(".")).toBe("email");
    expect(result.error.issues[0]?.message).toBe("invalidEmail");
  });

  it("rejects a malformed phone with the invalidPhone key", () => {
    const result = inquirySchema.safeParse({ ...valid, phone: "call-me" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.path.join(".")).toBe("phone");
    expect(result.error.issues[0]?.message).toBe("invalidPhone");
  });
});

describe("inquirySchema — consent (Clarification 2)", () => {
  it("rejects consentAccepted:false and missing consent with the consentRequired key", () => {
    for (const payload of [
      { ...valid, consentAccepted: false },
      { ...valid, consentAccepted: undefined },
    ]) {
      const result = inquirySchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (result.success) return;
      const consent = result.error.issues.find((issue) =>
        issue.path.includes("consentAccepted"),
      );
      expect(consent?.message).toBe("consentRequired");
    }
  });
});

describe("inquirySchema — localized issue keys (FR-003)", () => {
  it("emits only keys present in the validation namespace of both locales", () => {
    const result = inquirySchema.safeParse({
      type: "spam",
      consentAccepted: false,
      email: "bad",
      phone: "bad",
    });
    expect(result.success).toBe(false);
    if (result.success) return;

    const messages = new Set([
      ...Object.keys(en.validation as Record<string, string>),
      ...Object.keys(ar.validation as Record<string, string>),
    ]);

    for (const issue of result.error.issues) {
      expect(messages, `unsupported validation key "${issue.message}"`).toContain(
        issue.message,
      );
    }
  });

  it("maps issues to the contract details[] shape", () => {
    const result = inquirySchema.safeParse({ ...valid, email: "bad" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(issueDetails(result.error)).toEqual([{ path: "email", issue: "invalidEmail" }]);
  });
});

describe("lead status + notes + list schemas (admin-api.md §4)", () => {
  it("accepts forward transitions/reopen but rejects moving back to new", () => {
    expect(leadStatusSchema.safeParse({ status: "contacted", version: 1 }).success).toBe(true);
    expect(leadStatusSchema.safeParse({ status: "inProgress", version: 1 }).success).toBe(true);
    expect(leadStatusSchema.safeParse({ status: "closed", version: 1 }).success).toBe(true);
    expect(leadStatusSchema.safeParse({ status: "new", version: 1 }).success).toBe(false);
  });

  it("normalizes empty notes to null and caps length", () => {
    const parsed = leadNotesSchema.safeParse({ notes: "", version: 3 });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.notes).toBeNull();

    expect(
      leadNotesSchema.safeParse({ notes: "x".repeat(5_001), version: 1 }).success,
    ).toBe(false);
  });

  it("defaults list pagination and caps page size", () => {
    const parsed = leadListQuerySchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toEqual({ page: 1, pageSize: 20 });

    expect(leadListQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
    expect(leadListQuerySchema.safeParse({ status: "contacted" }).success).toBe(true);
  });
});
