import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/authorize";
import { badRequest } from "@/server/http/errors";
import { errorResponse, readJson } from "@/server/http/handler";
import { transitionStatus } from "@/server/services/partnerships";
import { issueDetails, leadStatusSchema } from "@/server/validation/inquiries";

/**
 * `POST /api/admin/partnerships/{id}/status` (T064, admin-api.md §4).
 * Permission `partnerships:statusChange`; optimistic-locked via `version` and
 * always writes an `ActivityLog` row (SC-012).
 */

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("partnerships:statusChange");
    const { id } = await params;

    const parsed = leadStatusSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw badRequest("Invalid status payload", issueDetails(parsed.error));
    }

    const updated = await transitionStatus({
      id,
      status: parsed.data.status,
      version: parsed.data.version,
      actorId: user.id,
    });

    return NextResponse.json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}
