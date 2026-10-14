import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/authorize";
import { badRequest } from "@/server/http/errors";
import { errorResponse, readJson } from "@/server/http/handler";
import { purgeMedia, updateMedia } from "@/server/services/media";
import { issueDetails } from "@/server/validation/common";
import { mediaAltSchema } from "@/server/validation/media";

/**
 * `PUT|DELETE /api/admin/media/{id}` (US12, T091, admin-api.md §5).
 *
 * `PUT` (`media:update`) edits `alt_en`/`alt_ar`. `DELETE` (`media:delete`)
 * purges an archived, unreferenced row (object first, then the row). Both are
 * audited (SC-012).
 */

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requirePermission("media:update");
    const { id } = await params;

    const parsed = mediaAltSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw badRequest("Invalid alt text", issueDetails(parsed.error));
    }

    const updated = await updateMedia({
      id,
      altEn: parsed.data.altEn,
      altAr: parsed.data.altAr,
      actorId: actor.id,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requirePermission("media:delete");
    const { id } = await params;

    await purgeMedia({ id, actorId: actor.id });
    return NextResponse.json({ id, purged: true });
  } catch (error) {
    return errorResponse(error);
  }
}
