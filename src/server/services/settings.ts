import { prisma } from "@/server/db/prisma";
import { createLogger } from "@/lib/logger";
import {
  SETTINGS_SCHEMAS,
  type SettingsKey,
  type SettingsValueFor,
} from "@/server/validation/cms";
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

/** A value is meaningful when it carries content (string, object, or array). */
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

  // Prefer the active locale; fall back to the available approved variant
  // (spec edge case "Missing translation") before giving up.
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
