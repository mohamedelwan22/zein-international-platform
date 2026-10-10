import { z } from "zod";

/**
 * Structured-content validation (T030, reused by US6 T069).
 *
 * Fixed registry of CMS section keys — home | about | contact (Constitution
 * IV, FR-032): typed fields only, no raw-HTML/markup type exists anywhere.
 * The same file carries the Settings value schemas (T031/T069) so CMS and
 * settings validation share one governed registry.
 *
 * Length caps are defensive bounds on stored copy, not content decisions;
 * all approved copy fits comfortably within them.
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const localizedBody = z.string().min(1).max(10_000);
const paragraphs = z.array(localizedBody).max(24);

/** A call to action is a typed label + in-app target — never raw markup. */
const cta = z.object({
  label: z.string().min(1).max(200),
  href: z.string().min(1).max(500),
});

/**
 * FR-007: every homepage statistic carries an `approved` flag. Unapproved
 * values (including the "50 years of success" claim) are filtered out before
 * reaching the public render — the flag is never trusted from the payload
 * alone; the content service enforces `approved === true`.
 */
const statistic = z.object({
  label: z.string().min(1).max(200),
  value: z.string().min(1).max(50),
  approved: z.boolean(),
});

// ---------------------------------------------------------------------------
// Section schemas (fixed registry — Constitution IV)
// ---------------------------------------------------------------------------

export const homeSectionSchema = z.object({
  hero: z.object({
    headline: z.string().min(1).max(300),
    supporting: localizedBody,
  }),
  ctas: z.object({ primary: cta, secondary: cta }).optional(),
  statistics: z.array(statistic).default([]),
  aboutPreview: z.object({ body: localizedBody }),
  mission: z.object({ body: localizedBody }),
  vision: z.object({ body: localizedBody }),
  sustainability: z.object({ body: localizedBody }),
  innovation: z.object({ body: localizedBody }),
  geographicPresence: z.object({ body: localizedBody }),
  /** Curated entity references by slug (FR-038: entities stay data-driven). */
  featuredBrands: z.array(z.string().min(1).max(200)).max(12).optional(),
  featuredProducts: z.array(z.string().min(1).max(200)).max(12).optional(),
  finalCta: z
    .object({
      title: z.string().min(1).max(300).optional(),
      primary: cta.optional(),
      secondary: cta.optional(),
    })
    .optional(),
});

export const aboutSectionSchema = z.object({
  story: paragraphs,
  history: paragraphs,
  profile: paragraphs,
  journey: paragraphs,
  mission: z.object({ body: localizedBody }),
  vision: z.object({ body: localizedBody }),
  values: z.array(
    z.object({
      id: z.string().min(1).max(100),
      title: z.string().min(1).max(200),
      description: localizedBody,
    }),
  ),
  sustainability: z.object({ paragraphs }),
  innovation: z.object({ body: localizedBody }),
});

/**
 * The Contact section (FR-032 fields). Live contact data is owned by
 * `Settings.contact_info` (FR-014, T031) and rendered by the contact page;
 * this schema completes the fixed registry and is finalized with the US6
 * editing surface — nothing is seeded here yet.
 */
export const contactSectionSchema = z.object({
  phone: z.array(z.string().min(1).max(50)).max(10).optional(),
  email: z.string().email().max(320).optional(),
  address: z.string().max(500).optional(),
  workingHours: z.string().max(500).optional(),
  mapUrl: z.string().max(1000).optional(),
  socialLinks: z
    .array(
      z.object({
        platform: z.string().min(1).max(100),
        url: z.string().min(1).max(1000),
      }),
    )
    .max(20)
    .optional(),
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const CMS_SECTION_SCHEMAS = {
  home: homeSectionSchema,
  about: aboutSectionSchema,
  contact: contactSectionSchema,
} as const;

export type CmsSectionKey = keyof typeof CMS_SECTION_SCHEMAS;

export type HomeSection = z.infer<typeof homeSectionSchema>;
export type AboutSection = z.infer<typeof aboutSectionSchema>;
export type ContactSection = z.infer<typeof contactSectionSchema>;
export type Statistic = z.infer<typeof statistic>;

export type SectionFor<K extends CmsSectionKey> = z.infer<(typeof CMS_SECTION_SCHEMAS)[K]>;

export const CMS_SECTION_KEYS = Object.keys(CMS_SECTION_SCHEMAS) as CmsSectionKey[];

// ---------------------------------------------------------------------------
// Settings value schemas (T031; US6 T069 finalizes the admin surface)
// ---------------------------------------------------------------------------

export const contactInfoSchema = z.object({
  country: z.string().min(1).max(100),
  city: z.string().min(1).max(100),
  district: z.string().min(1).max(200),
  address: z.string().min(1).max(300),
  phones: z.array(z.string().min(1).max(50)).min(1).max(10),
  email: z.string().email().max(320),
  website: z.string().min(1).max(200),
  note: z.string().max(1000).optional(),
});

export const socialLinksSchema = z
  .array(
    z.object({
      platform: z.string().min(1).max(100),
      url: z.string().min(1).max(1000),
    }),
  )
  .max(20);

export const workingHoursSchema = z.string().min(1).max(1000);

export const privacyNoticeSchema = z.string().min(1).max(20_000);

export const SETTINGS_SCHEMAS = {
  contact_info: contactInfoSchema,
  social_links: socialLinksSchema,
  working_hours: workingHoursSchema,
  privacy_notice: privacyNoticeSchema,
} as const;

export type SettingsKey = keyof typeof SETTINGS_SCHEMAS;

export type SettingsValueFor<K extends SettingsKey> = z.infer<(typeof SETTINGS_SCHEMAS)[K]>;

export const SETTINGS_KEYS = Object.keys(SETTINGS_SCHEMAS) as SettingsKey[];
