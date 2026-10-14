import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/authorize";
import { errorResponse } from "@/server/http/handler";
import { deactivateUser } from "@/server/services/users";

/**
 * `POST /api/admin/users/{id}/deactivate` (US12, T090/T093, admin-api.md §8).
 * `users:update` — immediate logout via a `tokenVersion` bump (US12.4/12.5).
 * Guards (self-deactivation, last active Super Admin) live in the service.
 */

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requirePermission("users:update");
    const { id } = await params;

    const updated = await deactivateUser({ id, actorId: actor.id });
    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
