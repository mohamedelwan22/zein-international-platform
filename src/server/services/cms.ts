import { prisma } from "@/server/db/prisma";
import { createLogger } from "@/lib/logger";
import {
  CMS_SECTION_SCHEMAS,
  type CmsSectionKey,
  type SectionFor,
} from "@/server/validation/cms";
import type { AppLocale } from "@/i18n/routing";

/**
 * CMS reads for the public site (T030).
 *
 * `getPublishedSection` reads `published_content` ONLY — the publication
 * predicate is "the row exists AND published_content is not null". Draft
 * content never crosses this boundary (publish safety, SC-005; US6 T071
 * triggers cache-tag invalidation on publish).
 *
 * Stored payloads are re-validated against the fixed per-section schema on
 * every read: malformed content is treated as unavailable rather than
 * rendered (FR-039) and flagged in logs for staff.
 */

const logger = createLogger("cms");

export async function getPublishedSection<K extends CmsSectionKey>(
  sectionKey: K,
  locale: AppLocale,
): Promise<SectionFor<K> | null> {
  const row = await prisma.cmsSection.findUnique({
    where: { sectionKey_locale: { sectionKey, locale } },
    select: { publishedContent: true },
  });

  if (!row?.publishedContent) {
    return null;
  }

  const parsed = CMS_SECTION_SCHEMAS[sectionKey].safeParse(row.publishedContent);
  if (!parsed.success) {
    logger.warn(
      { sectionKey, locale, issues: parsed.error.issues.length },
      "Stored CMS content failed schema validation — treating as unpublished",
    );
    return null;
  }

  return parsed.data as SectionFor<K>;
}
