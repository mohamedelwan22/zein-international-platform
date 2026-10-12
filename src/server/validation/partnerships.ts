import { z } from "zod";

/**
 * Partnership validation (T063, FR-018, contracts/public-api.md).
 *
 * Same double-validation model as inquiries: one Zod schema is shared by the
 * public POST handler and the partnership form. Issue `message`s are
 * `validation.*` keys, never user-facing strings (FR-003).
 *
 * Required: company name, contact person (`name`), email, message, and the
 * literal consent acknowledgment (Clarification 2). The FR-018 context fields
 * (phone, country, business type, website, product category) are optional, and
 * the attachment is validated separately (magic bytes + size) because it is an
 * opaque binary part, not a JSON field.
 */

/** Documents ≤ 20 MB (FR-033), mirrored client-side to avoid server imports. */
export const PARTNERSHIP_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;

/** The attachment is a document only — pdf/doc/docx (FR-033). */
export const PARTNERSHIP_ATTACHMENT_EXTENSIONS = ["pdf", "doc", "docx"] as const;

const phonePattern = /^[+]?[0-9\s().-]{6,20}$/;

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: "maxLength" })
    .optional()
    .nullable()
    .transform((value) => (value && value.length > 0 ? value : undefined));

const optionalUuid = z
  .string({ error: "invalidType" })
  .trim()
  .max(64, { error: "invalidType" })
  .optional()
  .nullable()
  .transform((value) => (value && value.length > 0 ? value : undefined))
  .refine((value) => value === undefined || z.string().uuid().safeParse(value).success, {
    error: "invalidType",
  });

/** Anonymous partnership submission payload (contracts/public-api.md). */
export const partnershipSchema = z.object({
  name: z
    .string({ error: "required" })
    .trim()
    .min(1, { error: "required" })
    .max(200, { error: "maxLength" }),
  company: z
    .string({ error: "required" })
    .trim()
    .min(1, { error: "required" })
    .max(200, { error: "maxLength" }),
  email: z
    .string({ error: "required" })
    .trim()
    .min(1, { error: "required" })
    .max(320, { error: "maxLength" })
    .email({ error: "invalidEmail" }),
  phone: optionalTrimmed(50).refine(
    (value) => value === undefined || phonePattern.test(value),
    { error: "invalidPhone" },
  ),
  country: optionalTrimmed(120),
  businessType: optionalTrimmed(120),
  website: optionalTrimmed(300),
  productCategory: optionalTrimmed(200),
  message: z
    .string({ error: "required" })
    .trim()
    .min(1, { error: "required" })
    .max(5_000, { error: "maxLength" }),
  consentAccepted: z.literal(true, { error: "consentRequired" }),
  locale: z.enum(["en", "ar"], { error: "invalidType" }).default("en"),
  productId: optionalUuid,
  brandId: optionalUuid,
  supplierId: optionalUuid,
  sourcePath: optionalTrimmed(500),
  referrer: optionalTrimmed(1_000),
});

export type PartnershipInput = z.infer<typeof partnershipSchema>;
