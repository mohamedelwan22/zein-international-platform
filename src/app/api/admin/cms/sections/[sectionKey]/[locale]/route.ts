import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/authorize";
import { badRequest } from "@/server/http/errors";
import { errorResponse, readJson } from "@/server/http/handler";
import {
  getOrCreateCmsSection,
  updateDraftContent,
  getCmsSection,
} from "@/server/services/cms";
import { CMS_SECTION_KEYS } from "@/server/validation/cms";
import type { CmsSectionKey } from "@/server/validation/cms";
import type { AppLocale } from "@/i18n/routing";

function parseParams(params: { sectionKey: string; locale: string }) {
  const sectionKey = params.sectionKey as CmsSectionKey;
  const locale = params.locale as AppLocale;
  if (!CMS_SECTION_KEYS.includes(sectionKey)) {
    throw badRequest("Invalid section key");
  }
  if (locale !== "en" && locale !== "ar") {
    throw badRequest("Invalid locale");
  }
  return { sectionKey, locale };
}

/**
 * GET /api/admin/cms/sections/{sectionKey}?locale=en or via [locale] path
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sectionKey: string; locale: string }> }
) {
  try {
    const user = await requirePermission("cms:read");
    const { sectionKey, locale } = parseParams(await params);
    const section = await getOrCreateCmsSection(sectionKey, locale, user.id);
    return NextResponse.json(section);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ sectionKey: string; locale: string }> }
) {
  try {
    const user = await requirePermission("cms:update");
    const { sectionKey, locale } = parseParams(await params);
    const body = await readJson(request);
    const current = await getCmsSection(sectionKey, locale);

    // Optimistic lock (admin-api.md §2): the client's expected version arrives
    // via `If-Match`; a stale value yields 409 VERSION_CONFLICT. Non-UI callers
    // that omit the header fall back to the current row version.
    const ifMatch = request.headers.get("if-match");
    const headerVersion = ifMatch === null ? Number.NaN : Number(ifMatch.replace(/^"|"$/g, ""));
    const version = Number.isFinite(headerVersion) ? headerVersion : (current?.version ?? 1);

    const result = await updateDraftContent({
      sectionKey,
      locale,
      content: body,
      actorId: user.id,
      version,
    });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
