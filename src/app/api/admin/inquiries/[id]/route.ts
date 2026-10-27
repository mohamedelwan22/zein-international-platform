import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/authorize";
import { badRequest, notFound } from "@/server/http/errors";
import { errorResponse, readJson } from "@/server/http/handler";
import { deleteInquiry, getInquiry, updateNotes } from "@/server/services/inquiries";
import { issueDetails, leadNotesSchema } from "@/server/validation/inquiries";

/**
 * `/api/admin/inquiries/{id}` (T059, admin-api.md §4):
 * `GET` detail (read), `PUT` internal notes (`inquiries:update`),
 * `DELETE` permanently remove a closed inquiry (`inquiries:delete`).
 */

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    await requirePermission("inquiries:read");
    const { id } = await params;

    const lead = await getInquiry(id);
    if (!lead) {
      throw notFound("Inquiry not found");
    }
    return NextResponse.json(lead);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePermission("inquiries:update");
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
    const actor = await requirePermission("inquiries:delete");
    const { id } = await params;

    await deleteInquiry({ id, actorId: actor.id });
    return NextResponse.json({ id, deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
