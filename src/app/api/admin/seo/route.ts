import { NextResponse } from "next/server";
import { errorResponse } from "@/server/http/handler";
import { listSeoMeta } from "@/server/services/seo";
import type { EntityType } from "@/generated/prisma/client";

/**
 * `GET /api/admin/seo?targetType&targetId&locale` (admin-api.md §7).
 * Lists stored overrides; `seo:read` is enforced in the service.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const targetType = url.searchParams.get("targetType");
    const targetId = url.searchParams.get("targetId");
    const locale = url.searchParams.get("locale");

    const items = (await listSeoMeta()).filter(
      (row) =>
        (!targetType || row.targetType === (targetType as EntityType)) &&
        (!targetId || row.targetId === targetId) &&
        (!locale || row.locale === locale),
    );

    return NextResponse.json({ items });
  } catch (error) {
    return errorResponse(error);
  }
}
