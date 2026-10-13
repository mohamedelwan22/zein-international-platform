import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/authorize";
import { badRequest } from "@/server/http/errors";
import { errorResponse, readJson } from "@/server/http/handler";
import { unpublishSection, getCmsSection } from "@/server/services/cms";
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sectionKey: string; locale: string }> }
) {
  try {
    const user = await requirePermission("cms:publish");
    const { sectionKey, locale } = parseParams(await params);
    const body = await readJson(request).catch(() => ({} as Record<string, unknown>));
    const current = await getCmsSection(sectionKey, locale);
    const version = Number((body as Record<string, unknown>)?.version) || current?.version || 1;
    const result = await unpublishSection({
      sectionKey,
      locale,
      actorId: user.id,
      version,
    });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
