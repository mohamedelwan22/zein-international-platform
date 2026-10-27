import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/authorize";
import { badRequest, notFound } from "@/server/http/errors";
import { errorResponse, readJson } from "@/server/http/handler";
import { deletePartnershipRequest, getPartnershipRequest, updateNotes } from "@/server/services/partnerships";
import { issueDetails, leadNotesSchema } from "@/server/validation/inquiries";

/**
 * `/api/admin/partnerships/{id}` (T064, admin-api.md §4):
 * `GET` detail (read), `PUT` internal notes (`partnerships:update`),
 * `DELETE` permanently remove a closed partnership request (`partnerships:delete`).
 */

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    await requirePermission("partnerships:read");
    const { id } = await params;

    const lead = await getPartnershipRequest(id);
    if (!lead) {
      throw notFound("Partnership request not found");
    }
    return NextResponse.json(lead);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const user = await requirePermission("partnerships:update");
    const { id } = await params;

    const parsed = leadNotesSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw badRequest("Validation failed", issueDetails(parsed.error));
    }

    const updated = await updateNotes({
      id,
      notes: parsed.data.notes,
      version: parsed.data.version,
      actorId: user.id,
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
    const actor = await requirePermission("partnerships:delete");
    const { id } = await params;

    await deletePartnershipRequest({ id, actorId: actor.id });
    return NextResponse.json({ id, deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
