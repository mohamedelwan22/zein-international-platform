import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/authorize";
import { badRequest } from "@/server/http/errors";
import { errorResponse } from "@/server/http/handler";
import { listActivityLog } from "@/server/services/activity";
import { activityListQuerySchema } from "@/server/validation/activity";
import { issueDetails } from "@/server/validation/common";

/**
 * `GET /api/admin/activity` (T109, US11, contracts/admin-api.md §10).
 *
 * Permission `activity:read` — Super Admin + Content Manager (permissions.ts).
 * The log is append-only: this is the only endpoint that exposes it and it is
 * read-only — there is no write, update or delete path (data-model.md §2.15).
 *
 * Filters: `actor` (staff id or e-mail), `action`, `entityType`, `from`, `to`;
 * pagination: `page`, `pageSize`.
 */

export async function GET(request: Request) {
  try {
    await requirePermission("activity:read");

    const url = new URL(request.url);
    const parsed = activityListQuerySchema.safeParse({
      actor: url.searchParams.get("actor") ?? undefined,
      action: url.searchParams.get("action") ?? undefined,
      entityType: url.searchParams.get("entityType") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
      pageSize: url.searchParams.get("pageSize") ?? undefined,
    });
    if (!parsed.success) {
      throw badRequest("Invalid query", issueDetails(parsed.error));
    }

    return NextResponse.json(await listActivityLog(parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}
