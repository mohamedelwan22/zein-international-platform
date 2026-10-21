import { z } from "zod";
import { ActivityAction } from "@/generated/prisma/client";

/**
 * Activity log query validation (T109, contracts/admin-api.md §10).
 *
 * `GET /api/admin/activity?actor&action&entityType&from&to&page` — the log is
 * read-only, so this schema covers the query string only.
 *
 * - `actor` accepts the staff id or the staff e-mail address (the UI offers a
 *   picker, the API stays tolerant of either);
 * - `action` is one of the governed `ActivityAction` values — never a free
 *   string;
 * - `entityType` is the free-form entity label stored on the row (`brand`,
 *   `product`, `user`, `settings`, …);
 * - `from`/`to` are ISO-8601 instants bounding the row timestamp.
 *
 * An empty parameter is treated as "not supplied" — the filter form submits
 * every field, so an untouched filter arrives as an empty string.
 */

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const isoDate = z
  .string({ error: "invalidType" })
  .trim()
  .min(1, { error: "required" })
  .refine((value) => !Number.isNaN(Date.parse(value)), { error: "invalidType" })
  .transform((value) => new Date(value));

/** Every governed action value — the action filter options. */
export const ACTIVITY_ACTIONS = Object.values(ActivityAction) as readonly ActivityAction[];

export const activityListQuerySchema = z.object({
  actor: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(320, { error: "maxLength" }).optional(),
  ),
  action: z.preprocess(
    emptyToUndefined,
    z.enum(ACTIVITY_ACTIONS, { error: "invalidType" }).optional(),
  ),
  entityType: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(64, { error: "maxLength" }).optional(),
  ),
  from: z.preprocess(emptyToUndefined, isoDate.optional()),
  to: z.preprocess(emptyToUndefined, isoDate.optional()),
  page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1, { error: "invalidType" }).default(1)),
  pageSize: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1, { error: "invalidType" }).max(100, { error: "invalidType" }).default(50),
  ),
});

export type ActivityListQuery = z.infer<typeof activityListQuerySchema>;
