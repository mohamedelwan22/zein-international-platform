import { errorResponse } from "@/server/http/handler";
import { getPublicImageMeta, readPublicImage } from "@/server/services/media";

/**
 * `GET /api/media/{id}` (US12, T091, contracts/README.md §9).
 *
 * The app-proxied public image URL — no session required, but only
 * **non-archived images** are ever served; documents (which may be confidential
 * attachments) stay behind the permissioned admin download route (FR-033).
 * The `sha256` is the ETag, and the URL is immutable (`Cache-Control` one
 * year), so browsers and the image optimizer can cache aggressively.
 */

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const meta = await getPublicImageMeta(id);

    if (request.headers.get("if-none-match") === meta.etag) {
      return new Response(null, { status: 304, headers: { ETag: meta.etag } });
    }

    const body = await readPublicImage(meta.storageKey);
    return new Response(Buffer.from(body), {
      status: 200,
      headers: {
        "Content-Type": meta.contentType,
        "Content-Length": String(body.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
        ETag: meta.etag,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
