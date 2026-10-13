import { NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/authorize";
import { badRequest } from "@/server/http/errors";
import { errorResponse, readJson } from "@/server/http/handler";
import { getSetting, updateSetting } from "@/server/services/settings";
import { SETTINGS_KEYS } from "@/server/validation/cms";
import type { SettingsKey } from "@/server/validation/cms";

function parseKey(key: string): SettingsKey {
  if (!SETTINGS_KEYS.includes(key as SettingsKey)) {
    throw badRequest("Invalid settings key");
  }
  return key as SettingsKey;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    await requirePermission("settings:read");
    const key = parseKey((await params).key);
    const setting = await getSetting(key);
    return NextResponse.json(setting);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const user = await requirePermission("settings:update");
    const key = parseKey((await params).key);
    const body = await readJson(request) as Record<string, unknown>;
    const result = await updateSetting({
      key,
      valueEn: body.valueEn ?? body.en ?? body.value_en,
      valueAr: body.valueAr ?? body.ar ?? body.value_ar,
      actorId: user.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
