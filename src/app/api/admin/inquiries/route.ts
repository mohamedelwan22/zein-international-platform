import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/authorize";
import { badRequest } from "@/server/http/errors";
import { errorResponse } from "@/server/http/handler";
import { listInquiries } from "@/server/services/inquiries";
import { issueDetails, leadListQuerySchema } from "@/server/validation/inquiries";

/**
 * `GET /api/admin/inquiries?status&page&pageSize` (T059, admin-api.md §4).
 * Permission `inquiries:read` (Sales/Business + Super Admin).
 */

export async function GET(request: Request) {
  try {
    await requirePermission("inquiries:read");

    const params = Object.fromEntries(new URL(request.url).searchParams.entries());
    const parsed = leadListQuerySchema.safeParse(params);
    if (!parsed.success) {
      throw badRequest("Invalid query", issueDetails(parsed.error));
    }

    const page = await listInquiries(parsed.data);
    return NextResponse.json(page);
  } catch (error) {
    return errorResponse(error);
  }
}
