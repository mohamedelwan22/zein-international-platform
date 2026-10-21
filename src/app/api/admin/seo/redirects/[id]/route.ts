import { NextResponse } from "next/server";
import { notFound } from "@/server/http/errors";
import { errorResponse } from "@/server/http/handler";
import { deleteSlugRedirect } from "@/server/services/seo";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `DELETE /api/admin/seo/redirects/{id}` (admin-api.md §7). */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      throw notFound("Redirect not found");
    }
    return NextResponse.json(await deleteSlugRedirect(id));
  } catch (error) {
    return errorResponse(error);
  }
}
