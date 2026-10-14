import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/authorize";
import { badRequest } from "@/server/http/errors";
import { errorResponse } from "@/server/http/handler";
import { listMedia, uploadMedia } from "@/server/services/media";
import { issueDetails } from "@/server/validation/common";
import { mediaAltSchema, mediaListQuerySchema } from "@/server/validation/media";

/**
 * `GET|POST /api/admin/media` (US12, T091, admin-api.md §5).
 *
 * `GET` (`media:read`) lists the library with an optional `kind`/`archived`
 * filter. `POST` (`media:upload`) accepts `multipart/form-data`, magic-byte +
 * size validates the file (`storage/validate.ts`) and stores it — any valid
 * file type is accepted, images and documents alike. Both responses carry the
 * app-proxied public `url` for images.
 */

interface ParsedUpload {
  buffer: Buffer;
  originalName: string;
  declaredMime: string | null;
  altEn: string | null;
  altAr: string | null;
}

async function parseUpload(request: Request): Promise<ParsedUpload> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw badRequest("Malformed multipart body");
  }

  const fields: Record<string, string> = {};
  let file: { buffer: Buffer; originalName: string; declaredMime: string | null } | null = null;

  for (const [key, value] of form.entries()) {
    if (typeof value === "string") {
      fields[key] = value;
      continue;
    }
    if ((key === "file" || key === "media") && value.size > 0) {
      file = {
        buffer: Buffer.from(await value.arrayBuffer()),
        originalName: value.name || "upload",
        declaredMime: value.type || null,
      };
    }
  }

  if (!file) {
    throw badRequest("A file is required", [{ path: "file", issue: "required" }]);
  }

  const alt = mediaAltSchema.safeParse({ altEn: fields.altEn, altAr: fields.altAr });
  if (!alt.success) {
    throw badRequest("Invalid alt text", issueDetails(alt.error));
  }

  return {
    ...file,
    altEn: alt.data.altEn,
    altAr: alt.data.altAr,
  };
}

export async function GET(request: Request) {
  try {
    await requirePermission("media:read");

    const url = new URL(request.url);
    const parsed = mediaListQuerySchema.safeParse({
      kind: url.searchParams.get("kind") ?? undefined,
      archived: url.searchParams.get("archived") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
      pageSize: url.searchParams.get("pageSize") ?? undefined,
    });
    if (!parsed.success) {
      throw badRequest("Invalid query", issueDetails(parsed.error));
    }

    return NextResponse.json(await listMedia(parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission("media:upload");

    const upload = await parseUpload(request);
    const created = await uploadMedia({ ...upload, actorId: user.id });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
