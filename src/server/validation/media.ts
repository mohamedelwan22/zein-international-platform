import { z } from "zod";

/**
 * Media library validation (US12, T091, admin-api.md §5, data-model.md §2.9).
 *
 * Byte/MIME/size rules live in `server/storage/validate.ts` (magic bytes are
 * authoritative); this file covers the admin metadata (`alt_en`/`alt_ar`) and
 * the library list query.
 */

export const MEDIA_KINDS = ["image", "document"] as const;
export type MediaKindValue = (typeof MEDIA_KINDS)[number];

const altSchema = z
  .string()
  .trim()
  .max(300, { error: "maxLength" })
  .nullish()
  .transform((value) => (value && value.length > 0 ? value : null));

/** `PUT /api/admin/media/{id}` body — bilingual alt text (empty ⇒ unset). */
export const mediaAltSchema = z.object({
  altEn: altSchema,
  altAr: altSchema,
});

export type MediaAltInput = z.infer<typeof mediaAltSchema>;

/** `GET /api/admin/media` query (admin-api.md §5, contracts/README.md §5). */
export const mediaListQuerySchema = z.object({
  kind: z.enum(MEDIA_KINDS, { error: "invalidType" }).optional(),
  archived: z
    .enum(["true", "false"], { error: "invalidType" })
    .optional()
    .transform((value) => value === "true"),
  page: z.coerce.number().int().min(1, { error: "invalidType" }).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1, { error: "invalidType" })
    .max(100, { error: "invalidType" })
    .default(24),
});

export type MediaListQuery = z.infer<typeof mediaListQuerySchema>;
