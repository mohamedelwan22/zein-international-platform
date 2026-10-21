import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/authorize";
import { errorResponse } from "@/server/http/handler";
import { getDashboardOverview } from "@/server/services/dashboard";

/**
 * `GET /api/admin/dashboard/overview` (T108, US11, contracts/admin-api.md §2).
 *
 * Permission `dashboard:read` — granted to every role (permissions.ts). The
 * response carries the module counts, the entry points and the most recent
 * activity-log entries; the counts themselves are scoped to the modules the
 * signed-in role may read.
 */

export async function GET() {
  try {
    const user = await requirePermission("dashboard:read");
    return NextResponse.json(await getDashboardOverview(user.role));
  } catch (error) {
    return errorResponse(error);
  }
}
