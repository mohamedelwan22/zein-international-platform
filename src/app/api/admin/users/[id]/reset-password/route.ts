import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/authorize";
import { badRequest } from "@/server/http/errors";
import { errorResponse, readJson } from "@/server/http/handler";
import { resetPassword } from "@/server/services/users";
import { issueDetails } from "@/server/validation/common";
import { resetPasswordSchema } from "@/server/validation/users";

/**
 * `POST /api/admin/users/{id}/reset-password` (US12, T090, admin-api.md §8).
 * `users:update` — sets a new hashed password and bumps `tokenVersion` so the
 * account's other sessions are revoked at the next request.
 */

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requirePermission("users:update");
    const { id } = await params;

    const parsed = resetPasswordSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw badRequest("Invalid password payload", issueDetails(parsed.error));
    }

    const updated = await resetPassword({ id, password: parsed.data.password, actorId: actor.id });
    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
