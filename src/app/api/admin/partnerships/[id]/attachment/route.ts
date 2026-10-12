import { requirePermission } from "@/server/auth/authorize";
import { errorResponse } from "@/server/http/handler";
import { getAttachment } from "@/server/services/partnerships";

/**
 * `GET /api/admin/partnerships/{id}/attachment` (T064, admin-api.md §4, FR-035).
 * Permission `partnerships:read`; the fetch writes an `attachmentAccess`
 * `ActivityLog` row and streams the stored document with a safe, forced
 * `Content-Disposition` (FR-033) so the browser never inlines untrusted bytes.
 */

type RouteContext = { params: Promise<{ id: string }> };

function contentDisposition(fileName: string): string {
  const ascii =
    fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_").slice(0, 200) || "attachment";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const user = await requirePermission("partnerships:read");
    const { id } = await params;

    const attachment = await getAttachment({ id, actorId: user.id });

    return new Response(new Uint8Array(attachment.body), {
      status: 200,
      headers: {
        "Content-Type": attachment.contentType,
        "Content-Length": String(attachment.byteSize),
        "Content-Disposition": contentDisposition(attachment.fileName),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
