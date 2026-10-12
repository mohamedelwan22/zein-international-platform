import { z } from "zod";

/**
 * Inquiry validation (T053/T057, FR-016, contracts/public-api.md, FR-019).
 *
 * One schema is shared by the public POST handler and the inquiry form's
 * client-side validation (double validation by design — contracts/README.md
 * §8). Issue `message`s are NOT user-facing strings: they are keys into the
 * `validation` message namespace (`required`, `invalidEmail`, …) so the form
 * can render a field error in the active language (FR-003) by translating
 * `validation.<message>`.
 *
 * `consentAccepted` must be the literal `true` (Clarification 2). `email` is
 * the mandatory contact channel (`data-model.md` §2.12 / contract: "name,
 * email, message required"); `phone` is optional and validated only when
 * supplied. `type` is the FR-016 enum and `subject` is required.
 */

export const INQUIRY_TYPES = [
  "product",
  "brand",
  "supplier",
  "distribution",
  "partnership",
  "general",
] as const;
export type InquiryTypeValue = (typeof INQUIRY_TYPES)[number];

export const LEAD_STATUSES = ["new", "contacted", "inProgress", "closed"] as const;
export type LeadStatusValue = (typeof LEAD_STATUSES)[number];

/** Statuses a staff member may move a lead INTO (Clarification 3 pipeline). */
export const LEAD_TRANSITION_TARGETS = ["contacted", "inProgress", "closed"] as const;

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

/** Anonymous inquiry submission payload (contracts/public-api.md POST /api/inquiries). */
export const inquirySchema = z.object({
  type: z.enum(INQUIRY_TYPES, { error: "invalidType" }),
  name: z
    .string({ error: "required" })
    .trim()
    .min(1, { error: "required" })
    .max(200, { error: "maxLength" }),
  company: optionalTrimmed(200),
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
  subject: z
    .string({ error: "required" })
    .trim()
    .min(1, { error: "required" })
    .max(300, { error: "maxLength" }),
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

export type InquiryInput = z.infer<typeof inquirySchema>;

/** Lead status transition body (contracts/admin-api.md §4). */
export const leadStatusSchema = z.object({
  status: z.enum(LEAD_TRANSITION_TARGETS, { error: "invalidType" }),
  version: z.coerce.number().int().nonnegative({ error: "invalidType" }),
});

export type LeadStatusInput = z.infer<typeof leadStatusSchema>;

/** Internal-notes update body (contracts/admin-api.md §4). */
export const leadNotesSchema = z.object({
  notes: z
    .string()
    .max(5_000, { error: "maxLength" })
    .nullish()
    .transform((value) => (value && value.length > 0 ? value : null)),
  version: z.coerce.number().int().nonnegative({ error: "invalidType" }),
});

export type LeadNotesInput = z.infer<typeof leadNotesSchema>;

/** Paginated admin list query (contracts/README.md §5). */
export const leadListQuerySchema = z.object({
  status: z.enum(LEAD_STATUSES, { error: "invalidType" }).optional(),
  page: z.coerce.number().int().min(1, { error: "invalidType" }).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1, { error: "invalidType" })
    .max(100, { error: "invalidType" })
    .default(20),
});

export type LeadListQuery = z.infer<typeof leadListQuerySchema>;

/** Map a ZodError to the contract `details[]` shape (contracts/README.md §4). */
export function issueDetails(error: z.ZodError): { path: string; issue: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.join(".") || "_",
    issue: issue.message,
  }));
}
