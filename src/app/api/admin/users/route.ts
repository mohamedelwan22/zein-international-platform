import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/authorize";
import { badRequest } from "@/server/http/errors";
import { errorResponse, readJson } from "@/server/http/handler";
import { createUser, listUsers } from "@/server/services/users";
import { issueDetails } from "@/server/validation/common";
import { createUserSchema, userListQuerySchema } from "@/server/validation/users";

/**
 * `GET|POST /api/admin/users` (US12, T090, admin-api.md §8).
 * `users:read` / `users:create` — Super Admin only (permissions.ts). Lists
 * staff without password hashes and creates an account with a hashed initial
 * password. Every create writes an `ActivityLog` row (SC-012).
 */

export async function GET(request: Request) {
  try {
    await requirePermission("users:read");

    const url = new URL(request.url);
    const parsed = userListQuerySchema.safeParse({
      page: url.searchParams.get("page") ?? undefined,
      pageSize: url.searchParams.get("pageSize") ?? undefined,
    });
    if (!parsed.success) {
      throw badRequest("Invalid query", issueDetails(parsed.error));
    }

    return NextResponse.json(await listUsers(parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission("users:create");

    const parsed = createUserSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw badRequest("Invalid user payload", issueDetails(parsed.error));
    }

    const created = await createUser({ ...parsed.data, actorId: user.id });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
