import { revalidateTag } from "next/cache";
import { prisma } from "@/server/db/prisma";
import { createLogger } from "@/lib/logger";
import {
  SETTINGS_SCHEMAS,
  type SettingsKey,
  type SettingsValueFor,
} from "@/server/validation/cms";
import { badRequest } from "@/server/http/errors";
import type { AppLocale } from "@/i18n/routing";

/**
 * Settings reads for the public site (T031, FR-014).
 *
 * Settings hold the approved platform-level configuration — contact info,
 * social links, working hours, privacy notice — per locale. A key without
 * approved content returns null: callers surface the localized "content
 * pending" state (Open Item 6) and never invent a value.
 */

const logger = createLogger("settings");

function isMeaningful(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

export async function getSettings<K extends SettingsKey>(
  key: K,
  locale: AppLocale,
): Promise<SettingsValueFor<K> | null> {
  const row = await prisma.settings.findUnique({
    where: { key },
    select: { valueEn: true, valueAr: true },
  });

  if (!row) {
    return null;
  }

  const active = locale === "en" ? row.valueEn : row.valueAr;
  const fallback = locale === "en" ? row.valueAr : row.valueEn;
  const value = isMeaningful(active) ? active : fallback;

  if (!isMeaningful(value)) {
    return null;
  }

  const parsed = SETTINGS_SCHEMAS[key].safeParse(value);
  if (!parsed.success) {
    logger.warn(
      { key, locale, issues: parsed.error.issues.length },
      "Stored settings value failed schema validation — treating as unset",
    );
    return null;
  }

  return parsed.data as SettingsValueFor<K>;
}

export interface SettingsRow {
  key: SettingsKey;
  valueEn: unknown;
  valueAr: unknown;
  sourceDoc: string | null;
  updatedById: string | null;
  updatedAt: Date;
}

export async function getAllSettings(): Promise<SettingsRow[]> {
  const rows = await prisma.settings.findMany({ orderBy: { key: "asc" } });
  return rows as SettingsRow[];
}

export async function getSetting(key: SettingsKey): Promise<SettingsRow | null> {
  const row = await prisma.settings.findUnique({ where: { key } });
  if (!row) return null;
  return row as SettingsRow;
}

export async function updateSetting(params: {
  key: SettingsKey;
  valueEn: unknown;
  valueAr: unknown;
  actorId: string;
  version?: number;
}): Promise<SettingsRow> {
  const { key, valueEn, valueAr, actorId } = params;

  const parsedEn = SETTINGS_SCHEMAS[key].safeParse(valueEn);
  if (!parsedEn.success) {
    throw badRequest(
      "Invalid settings value for en",
      parsedEn.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
        locale: "en",
      })),
    );
  }
  const parsedAr = SETTINGS_SCHEMAS[key].safeParse(valueAr);
  if (!parsedAr.success) {
    throw badRequest(
      "Invalid settings value for ar",
      parsedAr.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
        locale: "ar",
      })),
    );
  }

  const row = await prisma.settings.upsert({
    where: { key },
    create: {
      key,
      valueEn: parsedEn.data as object,
      valueAr: parsedAr.data as object,
      updatedById: actorId,
    },
    update: {
      valueEn: parsedEn.data as object,
      valueAr: parsedAr.data as object,
      updatedById: actorId,
    },
  });

  await prisma.activityLog.create({
    data: {
      actorId,
      action: "update",
      entityType: "settings",
      entityId: row.key,
      summary: `Updated settings:${key}`,
    },
  });

  // T071: invalidate the cached public loaders that read this key so a saved
  // settings value goes live on the public site (SC-005). Expire immediately so
  // the next request revalidates instead of serving the stale value once more.
  // The tag shape is `settings:{key}:{locale}` (`server/cache/public-content.ts`).
  try {
    revalidateTag(`settings:${key}:en`, { expire: 0 });
    revalidateTag(`settings:${key}:ar`, { expire: 0 });
  } catch (err) {
    logger.warn({ err, key }, "Failed to invalidate cache tags after settings update");
  }

  return row as SettingsRow;
}
