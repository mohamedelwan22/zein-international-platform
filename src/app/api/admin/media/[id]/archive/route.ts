import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/authorize";
import { errorResponse } from "@/server/http/handler";
import { archiveMedia } from "@/server/services/media";

/**
 * `POST /api/admin/media/{id}/archive` (US12, T091, admin-api.md §5).
 * `media:archive` — soft-archives only when no entity references the row
 * (guarded in the service); the action is audited (SC-012).
 */

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requirePermission("media:archive");
    const { id } = await params;

    const archived = await archiveMedia({ id, actorId: actor.id });
    return NextResponse.json(archived);
  } catch (error) {
    return errorResponse(error);
  }
}
