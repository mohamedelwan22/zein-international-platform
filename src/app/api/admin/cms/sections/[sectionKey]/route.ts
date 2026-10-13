import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/authorize";
import { badRequest } from "@/server/http/errors";
import { errorResponse } from "@/server/http/handler";
import { getOrCreateCmsSection } from "@/server/services/cms";
import { CMS_SECTION_KEYS } from "@/server/validation/cms";
import type { CmsSectionKey } from "@/server/validation/cms";
import type { AppLocale } from "@/i18n/routing";

function parseParams(params: { sectionKey: string }, locale: string) {
  const sectionKey = params.sectionKey as CmsSectionKey;
  const resolved = (locale || "en") as AppLocale;
  if (!CMS_SECTION_KEYS.includes(sectionKey)) {
    throw badRequest("Invalid section key");
  }
  if (resolved !== "en" && resolved !== "ar") {
    throw badRequest("Invalid locale");
  }
  return { sectionKey, locale: resolved };
}

/**
 * GET /api/admin/cms/sections/{sectionKey}?locale=en (admin-api.md §6)
 * Permission: cms:read — returns the draft + published payloads for a pair.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ sectionKey: string }> },
) {
  try {
    const user = await requirePermission("cms:read");
    const locale = new URL(request.url).searchParams.get("locale") ?? "en";
    const parsed = parseParams(await params, locale);
    const section = await getOrCreateCmsSection(parsed.sectionKey, parsed.locale, user.id);
    return NextResponse.json(section);
  } catch (error) {
    return errorResponse(error);
  }
}
