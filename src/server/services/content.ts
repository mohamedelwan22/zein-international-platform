import { getPublishedSection, getPublishedSectionRecord } from "./cms";
import { getSettings } from "./settings";
import { listPublishedCategories, type PublishedCategoryPreview } from "./categories";
import {
  statisticApprovalKey,
  type AboutSection,
  type HomeSection,
  type Statistic,
  type SettingsValueFor,
} from "@/server/validation/cms";
import type { AppLocale } from "@/i18n/routing";

/**
 * Public content facade (T032, FR-038).
 *
 * Every piece of business copy surfaced on the public site flows through
 * here — CMS sections and Settings only, never hardcoded components. The
 * service also enforces the FR-007 statistics gate: only `approved === true`
 * values are returned, so unapproved claims (the "50 years of success"
 * wording) can never reach a public render as factual counters.
 */

/** A statistic that is safe to render publicly (FR-007). */
export interface ApprovedStatistic {
  label: string;
  value: string;
}

export interface HomeExperience {
  /** True when a published section exists (drives the localized empty state). */
  published: boolean;
  hero: HomeSection["hero"] | null;
  /** Optional CMS-managed hero calls to action (FR-032); UI chrome fallback. */
  ctas: HomeSection["ctas"] | null;
  aboutPreview: HomeSection["aboutPreview"] | null;
  mission: HomeSection["mission"] | null;
  vision: HomeSection["vision"] | null;
  sustainability: HomeSection["sustainability"] | null;
  innovation: HomeSection["innovation"] | null;
  geographicPresence: HomeSection["geographicPresence"] | null;
  finalCta: HomeSection["finalCta"] | null;
  /** Approved statistics ONLY (FR-007 gate). */
  statistics: ApprovedStatistic[];
  /** Published dynamic product categories for the Home preview (FR-027). */
  categories: PublishedCategoryPreview[];
}

export interface AboutExperience {
  section: AboutSection | null;
  story: string[];
  history: string[];
  profile: string[];
  journey: string[];
  mission: AboutSection["mission"] | null;
  vision: AboutSection["vision"] | null;
  values: AboutSection["values"];
  sustainability: AboutSection["sustainability"] | null;
  innovation: AboutSection["innovation"] | null;
}

/** FR-007 gate: unapproved statistics never pass this function.
 *
 * Two independent conditions are required (T114):
 *  1. the payload carries `approved: true` (draft validation), and
 *  2. the server-side approval register contains a matching entry for this
 *     exact label+value claim, written only by `approveStatistic` (which is
 *     permission-gated). A draft PUT can therefore not self-approve a claim by
 *     setting `approved: true`; editing the text also invalidates the entry.
 */
export function approvedStatisticsOnly(
  statistics: Statistic[],
  approvedFlags: Record<string, unknown> | null,
): ApprovedStatistic[] {
  return statistics
    .filter(
      (statistic) =>
        statistic.approved === true && approvedFlags?.[statisticApprovalKey(statistic)] === true,
    )
    .map(({ label, value }) => ({ label, value }));
}

export async function getHomeExperience(locale: AppLocale): Promise<HomeExperience> {
  const [record, categories] = await Promise.all([
    getPublishedSectionRecord("home", locale),
    listPublishedCategories(locale, { kind: "product" }),
  ]);
  const section = record?.content ?? null;

  return {
    // The raw section is deliberately NOT exposed: unapproved statistics must
    // be unreachable from the public render path (FR-007).
    published: section !== null,
    hero: section?.hero ?? null,
    ctas: section?.ctas ?? null,
    aboutPreview: section?.aboutPreview ?? null,
    mission: section?.mission ?? null,
    vision: section?.vision ?? null,
    sustainability: section?.sustainability ?? null,
    innovation: section?.innovation ?? null,
    geographicPresence: section?.geographicPresence ?? null,
    finalCta: section?.finalCta ?? null,
    statistics: section
      ? approvedStatisticsOnly(section.statistics, record?.approvedFlags ?? null)
      : [],
    categories,
  };
}

export async function getAboutExperience(locale: AppLocale): Promise<AboutExperience> {
  const section = await getPublishedSection("about", locale);

  return {
    section,
    story: section?.story ?? [],
    history: section?.history ?? [],
    profile: section?.profile ?? [],
    journey: section?.journey ?? [],
    mission: section?.mission ?? null,
    vision: section?.vision ?? null,
    values: section?.values ?? [],
    sustainability: section?.sustainability ?? null,
    innovation: section?.innovation ?? null,
  };
}

/** Approved contact details (FR-014) — null when Settings has no content. */
export async function getContactInfo(locale: AppLocale) {
  return getSettings("contact_info", locale);
}

/** Public working hours (FR-014/FR-032) — null until staff set it. */
export async function getWorkingHours(locale: AppLocale) {
  return getSettings("working_hours", locale);
}

/** Public social links (FR-014) — null until staff set them. */
export async function getSocialLinks(locale: AppLocale) {
  return getSettings("social_links", locale);
}

/** Approved privacy notice for consent copy (FR-016, Open Item 6). */
export async function getPrivacyNotice(locale: AppLocale) {
  return getSettings("privacy_notice", locale);
}

export type ContactInfo = SettingsValueFor<"contact_info">;
export type SocialLinks = SettingsValueFor<"social_links">;
