import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/authorize";
import { badRequest } from "@/server/http/errors";
import { errorResponse, readJson } from "@/server/http/handler";
import { updateUser } from "@/server/services/users";
import { issueDetails } from "@/server/validation/common";
import { updateUserSchema } from "@/server/validation/users";

/**
 * `PUT /api/admin/users/{id}` (US12, T090, admin-api.md §8).
 * `users:update` — profile/role/active change, optimistic-locked by `version`.
 * A deactivation bumps `tokenVersion` (immediate logout, US12.4) and every
 * change writes an `ActivityLog` row (SC-012).
 */

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requirePermission("users:update");
    const { id } = await params;

    const parsed = updateUserSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw badRequest("Invalid user payload", issueDetails(parsed.error));
    }

    const { version, ...fields } = parsed.data;
    const updated = await updateUser({ id, actorId: actor.id, changes: { ...fields, version } });
    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
