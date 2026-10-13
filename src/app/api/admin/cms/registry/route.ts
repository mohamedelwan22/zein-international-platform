import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/authorize";
import { errorResponse } from "@/server/http/handler";
import { CMS_SECTION_KEYS } from "@/server/validation/cms";

/**
 * GET /api/admin/cms/registry (admin-api.md §6)
 * Permission: cms:read
 */
export async function GET() {
  try {
    await requirePermission("cms:read");
    return NextResponse.json({
      keys: CMS_SECTION_KEYS,
      locales: ["en", "ar"],
    });
  } catch (error) {
    return errorResponse(error);
  }
}
