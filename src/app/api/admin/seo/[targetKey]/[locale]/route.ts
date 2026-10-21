import { NextResponse } from "next/server";
import { badRequest } from "@/server/http/errors";
import { errorResponse, readJson } from "@/server/http/handler";
import { getSeoMeta, saveSeoMeta } from "@/server/services/seo";
import { SEO_LOCALES, type SeoLocale } from "@/server/validation/seo";

/**
 * `GET|PUT /api/admin/seo/{targetKey}/{locale}` (admin-api.md §7).
 *
 * `targetKey` is `page:<key>` or `<entityType>:<uuid>`. Permissions, target
 * validation, the optimistic lock and slug redirect creation live in the SEO
 * service.
 */
type RouteContext = { params: Promise<{ targetKey: string; locale: string }> };

function parseLocale(raw: string): SeoLocale {
  if (!(SEO_LOCALES as readonly string[]).includes(raw)) {
    throw badRequest("Unsupported locale", [{ path: "locale", issue: "invalidType" }]);
  }
  return raw as SeoLocale;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { targetKey, locale } = await context.params;
    return NextResponse.json(await getSeoMeta(targetKey, parseLocale(locale)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { targetKey, locale } = await context.params;
    const body = await readJson(request);
    return NextResponse.json(await saveSeoMeta(targetKey, parseLocale(locale), body));
  } catch (error) {
    return errorResponse(error);
  }
}
