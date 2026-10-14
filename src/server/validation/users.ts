import { z } from "zod";
import { ROLES } from "@/server/auth/permissions";

/**
 * Staff account validation (US12, T090, admin-api.md §8, data-model.md §2.1).
 *
 * The assignable role set is the canonical four (`permissions.ts`) — never a
 * free-form string — so a user can never be granted a role the authz layer
 * does not understand. `MIN_PASSWORD_LENGTH` mirrors the seed policy
 * (prisma/seed.ts: bootstrap admin password ≥ 12 characters).
 */

export const userRoleSchema = z.enum(ROLES, { error: "invalidType" });

const emailSchema = z
  .string({ error: "required" })
  .trim()
  .min(1, { error: "required" })
  .max(320, { error: "maxLength" })
  .email({ error: "invalidEmail" });

const nameSchema = z
  .string({ error: "required" })
  .trim()
  .min(1, { error: "required" })
  .max(200, { error: "maxLength" });

export const MIN_PASSWORD_LENGTH = 12;

const passwordSchema = z
  .string({ error: "required" })
  .min(MIN_PASSWORD_LENGTH, { error: "minLength" })
  .max(200, { error: "maxLength" });

/** `POST /api/admin/users` body (admin-api.md §8). */
export const createUserSchema = z.object({
  email: emailSchema,
  name: nameSchema,
  role: userRoleSchema,
  password: passwordSchema,
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

/** `PUT /api/admin/users/{id}` body — partial profile + required `version`. */
export const updateUserSchema = z.object({
  name: nameSchema.optional(),
  email: emailSchema.optional(),
  role: userRoleSchema.optional(),
  active: z.boolean({ error: "invalidType" }).optional(),
  version: z.coerce.number().int().nonnegative({ error: "invalidType" }),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/** `POST /api/admin/users/{id}/reset-password` body. */
export const resetPasswordSchema = z.object({
  password: passwordSchema,
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** `GET /api/admin/users` query (contracts/README.md §5). */
export const userListQuerySchema = z.object({
  page: z.coerce.number().int().min(1, { error: "invalidType" }).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1, { error: "invalidType" })
    .max(100, { error: "invalidType" })
    .default(50),
});

export type UserListQuery = z.infer<typeof userListQuerySchema>;
