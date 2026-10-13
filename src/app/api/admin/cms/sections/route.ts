import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/authorize";
import { errorResponse } from "@/server/http/handler";
import { prisma } from "@/server/db/prisma";

/**
 * GET /api/admin/cms/sections (admin-api.md §6)
 * Permission: cms:read
 */
export async function GET() {
  try {
    await requirePermission("cms:read");
    const sections = await prisma.cmsSection.findMany({
      orderBy: [{ sectionKey: "asc" }, { locale: "asc" }],
    });
    return NextResponse.json(sections);
  } catch (error) {
    return errorResponse(error);
  }
}
