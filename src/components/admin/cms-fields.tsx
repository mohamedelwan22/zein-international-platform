"use client";

import { useTranslations } from "next-intl";
import type { CmsSectionKey } from "@/server/validation/cms";

/**
 * Structured CMS field primitives (US6, T070, FR-032).
 *
 * The CMS exposes typed fields only — this module never renders a raw HTML or
 * markup editor. Every control writes through the same immutable path helpers
 * so the draft stays a plain JSON object validated by the section Zod schema
 * on save (`cms-section-editor.tsx`).
 */

export type Draft = Record<string, unknown>;
export type FieldErrors = Record<string, string>;
export type DraftUpdate = (path: (string | number)[], value: unknown) => void;

// ---------------------------------------------------------------------------
// Immutable path helpers
// ---------------------------------------------------------------------------

export function getIn(obj: unknown, path: readonly (string | number)[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string | number, unknown>)[key];
  }
  return current;
}

export function setIn(obj: unknown, path: readonly (string | number)[], value: unknown): unknown {
  const [head, ...rest] = path;
  if (head === undefined) return value;
  if (Array.isArray(obj)) {
    const clone = [...obj];
    clone[head as number] = setIn(clone[head as number], rest, value);
    return clone;
  }
  const clone: Record<string | number, unknown> = { ...(obj as Record<string, unknown>) };
  clone[head] = setIn(clone[head], rest, value);
  return clone;
}

export function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function asRecord(value: unknown): Draft {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Draft)
    : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asStringArray(value: unknown): string[] {
  return asArray(value).filter((entry): entry is string => typeof entry === "string");
}

/** Collapse Zod issues into a `path → first message` map for field display. */
export function flattenIssues(error: {
  issues: { path: PropertyKey[]; message: string }[];
}): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const path = issue.path.length ? issue.path.join(".") : "_form";
    if (!out[path]) out[path] = issue.message;
  }
  return out;
}

function deepMerge(base: unknown, incoming: unknown): unknown {
  if (Array.isArray(base)) return Array.isArray(incoming) ? incoming : base;
  if (
    base &&
    typeof base === "object" &&
    incoming &&
    typeof incoming === "object" &&
    !Array.isArray(incoming)
  ) {
    const baseRecord = base as Record<string, unknown>;
    const out: Record<string, unknown> = { ...baseRecord };
    for (const [key, value] of Object.entries(incoming as Record<string, unknown>)) {
      out[key] = deepMerge(baseRecord[key], value);
    }
    return out;
  }
  return incoming === undefined ? base : incoming;
}

/** Structural skeleton so an empty/legacy section still renders every field. */
export function defaultCmsDraft(sectionKey: CmsSectionKey): Draft {
  switch (sectionKey) {
    case "home":
      return {
        hero: { headline: "", supporting: "" },
        statistics: [],
        aboutPreview: { body: "" },
        mission: { body: "" },
        vision: { body: "" },
        sustainability: { body: "" },
        innovation: { body: "" },
        geographicPresence: { body: "" },
        featuredBrands: [],
        featuredProducts: [],
      };
    case "about":
      return {
        story: [],
        history: [],
        profile: [],
        journey: [],
        mission: { body: "" },
        vision: { body: "" },
        values: [],
        sustainability: { paragraphs: [] },
        innovation: { body: "" },
      };
    case "contact":
      return {
        phone: [],
        socialLinks: [],
      };
  }
}

export function mergeDraft(sectionKey: CmsSectionKey, incoming: unknown): Draft {
  const base = defaultCmsDraft(sectionKey);
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) return base;
  return deepMerge(base, incoming) as Draft;
}

// ---------------------------------------------------------------------------
// Field primitives
// ---------------------------------------------------------------------------

function FieldShell({
  htmlFor,
  label,
  error,
  hint,
  children,
}: {
  htmlFor?: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-body font-semibold text-zain-green-950">
        {label}
      </label>
      {hint ? <p className="text-meta text-zain-green-950/60">{hint}</p> : null}
      {children}
      {error ? (
        <p role="alert" className="text-meta text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  dir,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  dir?: "ltr" | "rtl";
}) {
  return (
    <FieldShell htmlFor={id} label={label} error={error} hint={hint}>
      <input
        id={id}
        type="text"
        dir={dir}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-sm border border-zain-green-950/15 bg-white px-3 py-2.5 text-body text-zain-green-950 focus:border-zain-green-700 focus:outline-none focus:ring-2 focus:ring-zain-green-700/30"
      />
    </FieldShell>
  );
}

export function TextAreaField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  rows = 4,
  dir,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  rows?: number;
  dir?: "ltr" | "rtl";
}) {
  return (
    <FieldShell htmlFor={id} label={label} error={error} hint={hint}>
      <textarea
        id={id}
        rows={rows}
        dir={dir}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-sm border border-zain-green-950/15 bg-white px-3 py-2.5 text-body text-zain-green-950 focus:border-zain-green-700 focus:outline-none focus:ring-2 focus:ring-zain-green-700/30"
      />
    </FieldShell>
  );
}

function SecondaryButton({
  children,
  onClick,
  type = "button",
}: {
  children: React.ReactNode;
  onClick: () => void;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className="inline-flex min-h-9 items-center justify-center rounded-sm border border-zain-green-950/25 px-3 py-1 text-meta font-semibold text-zain-green-950 transition-colors hover:border-zain-green-950/50 hover:bg-zain-green-950/5"
    >
      {children}
    </button>
  );
}

/**
 * Ordered, bounded list of free text — paragraphs or simple values. Empty
 * strings are left for schema validation to flag; removal is explicit.
 */
export function StringListField({
  idPrefix,
  label,
  values,
  onChange,
  addLabel,
  removeLabel,
  multiline = false,
  itemError,
  dir,
}: {
  idPrefix: string;
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  addLabel: string;
  removeLabel: string;
  multiline?: boolean;
  itemError?: (index: number) => string | undefined;
  dir?: "ltr" | "rtl";
}) {
  const replace = (index: number, value: string) => {
    const next = [...values];
    next[index] = value;
    onChange(next);
  };
  const remove = (index: number) => onChange(values.filter((_, i) => i !== index));

  return (
    <div className="flex flex-col gap-2">
      <p className="text-body font-semibold text-zain-green-950">{label}</p>
      {values.length === 0 ? (
        <p className="text-meta text-zain-green-950/50">—</p>
      ) : null}
      {values.map((value, index) => (
        <div key={index} className="flex flex-col gap-1">
          <div className="flex items-start gap-2">
            {multiline ? (
              <textarea
                id={`${idPrefix}-${index}`}
                rows={3}
                dir={dir}
                value={value}
                onChange={(event) => replace(index, event.target.value)}
                className="w-full rounded-sm border border-zain-green-950/15 bg-white px-3 py-2.5 text-body text-zain-green-950 focus:border-zain-green-700 focus:outline-none focus:ring-2 focus:ring-zain-green-700/30"
              />
            ) : (
              <input
                id={`${idPrefix}-${index}`}
                type="text"
                dir={dir}
                value={value}
                onChange={(event) => replace(index, event.target.value)}
                className="min-h-11 w-full rounded-sm border border-zain-green-950/15 bg-white px-3 py-2.5 text-body text-zain-green-950 focus:border-zain-green-700 focus:outline-none focus:ring-2 focus:ring-zain-green-700/30"
              />
            )}
            <SecondaryButton onClick={() => remove(index)}>{removeLabel}</SecondaryButton>
          </div>
          {itemError?.(index) ? (
            <p role="alert" className="text-meta text-red-700">
              {itemError(index)}
            </p>
          ) : null}
        </div>
      ))}
      <div>
        <SecondaryButton onClick={() => onChange([...values, ""])}>+ {addLabel}</SecondaryButton>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composed structured editors
// ---------------------------------------------------------------------------

function CtaFields({
  idPrefix,
  basePath,
  draft,
  update,
  errors,
}: {
  idPrefix: string;
  basePath: (string | number)[];
  draft: Draft;
  update: DraftUpdate;
  errors: FieldErrors;
}) {
  const t = useTranslations("admin");
  const label = asString(getIn(draft, [...basePath, "label"]));
  const href = asString(getIn(draft, [...basePath, "href"]));
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextField
        id={`${idPrefix}-label`}
        label={t("cmsCtaLabelField")}
        value={label}
        onChange={(value) => update([...basePath, "label"], value)}
        error={errors[[...basePath, "label"].join(".")]}
      />
      <TextField
        id={`${idPrefix}-href`}
        label={t("cmsCtaHrefField")}
        value={href}
        dir="ltr"
        onChange={(value) => update([...basePath, "href"], value)}
        error={errors[[...basePath, "href"].join(".")]}
      />
    </div>
  );
}

function StatisticsField({
  items,
  update,
  errors,
}: {
  items: Draft[];
  update: DraftUpdate;
  errors: FieldErrors;
}) {
  const t = useTranslations("admin");
  const setItems = (next: unknown[]) => update(["statistics"], next);
  const patch = (index: number, key: string, value: unknown) =>
    setItems(items.map((item, i) => (i === index ? { ...item, [key]: value } : item)));

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-body font-semibold text-zain-green-950">{t("cmsStatisticsTitle")}</p>
        <p className="text-meta text-zain-green-950/60">{t("cmsStatisticsHint")}</p>
      </div>
      {items.map((item, index) => (
        <div
          key={index}
          className="grid gap-3 rounded-md border border-zain-green-950/10 bg-white p-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end"
        >
          <TextField
            id={`stat-${index}-label`}
            label={t("cmsStatisticLabel")}
            value={asString(item.label)}
            onChange={(value) => patch(index, "label", value)}
            error={errors[`statistics.${index}.label`]}
          />
          <TextField
            id={`stat-${index}-value`}
            label={t("cmsStatisticValue")}
            value={asString(item.value)}
            onChange={(value) => patch(index, "value", value)}
            error={errors[`statistics.${index}.value`]}
          />
          <label className="flex min-h-11 items-center gap-2 text-body text-zain-green-950">
            <input
              type="checkbox"
              checked={item.approved === true}
              onChange={(event) => patch(index, "approved", event.target.checked)}
              className="h-4 w-4"
            />
            {t("cmsApprovedLabel")}
          </label>
          <SecondaryButton onClick={() => setItems(items.filter((_, i) => i !== index))}>
            {t("cmsRemoveItem")}
          </SecondaryButton>
        </div>
      ))}
      <div>
        <SecondaryButton
          onClick={() => setItems([...items, { label: "", value: "", approved: false }])}
        >
          + {t("cmsAddItem")}
        </SecondaryButton>
      </div>
    </div>
  );
}

function ValuesField({
  items,
  update,
  errors,
}: {
  items: Draft[];
  update: DraftUpdate;
  errors: FieldErrors;
}) {
  const t = useTranslations("admin");
  const setItems = (next: unknown[]) => update(["values"], next);
  const patch = (index: number, key: string, value: unknown) =>
    setItems(items.map((item, i) => (i === index ? { ...item, [key]: value } : item)));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body font-semibold text-zain-green-950">{t("cmsValueTitle")}</p>
      {items.map((item, index) => (
        <div
          key={index}
          className="flex flex-col gap-3 rounded-md border border-zain-green-950/10 bg-white p-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              id={`value-${index}-id`}
              label={t("cmsValueId")}
              value={asString(item.id)}
              dir="ltr"
              onChange={(value) => patch(index, "id", value)}
              error={errors[`values.${index}.id`]}
            />
            <TextField
              id={`value-${index}-title`}
              label={t("cmsValueTitle")}
              value={asString(item.title)}
              onChange={(value) => patch(index, "title", value)}
              error={errors[`values.${index}.title`]}
            />
          </div>
          <TextAreaField
            id={`value-${index}-description`}
            label={t("cmsValueDescription")}
            value={asString(item.description)}
            onChange={(value) => patch(index, "description", value)}
            error={errors[`values.${index}.description`]}
          />
          <div>
            <SecondaryButton onClick={() => setItems(items.filter((_, i) => i !== index))}>
              {t("cmsRemoveItem")}
            </SecondaryButton>
          </div>
        </div>
      ))}
      <div>
        <SecondaryButton
          onClick={() => setItems([...items, { id: "", title: "", description: "" }])}
        >
          + {t("cmsAddItem")}
        </SecondaryButton>
      </div>
    </div>
  );
}

export function SocialLinksField({
  items,
  onChange,
  errors,
  errorPrefix,
}: {
  items: Draft[];
  onChange: (items: Draft[]) => void;
  errors: FieldErrors;
  errorPrefix: string;
}) {
  const t = useTranslations("admin");
  const patch = (index: number, key: string, value: unknown) =>
    onChange(items.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
  const pathFor = (index: number, field: string) =>
    errorPrefix ? `${errorPrefix}.${index}.${field}` : `${index}.${field}`;

  return (
    <div className="flex flex-col gap-3">
      {items.map((item, index) => (
        <div
          key={index}
          className="grid gap-3 rounded-md border border-zain-green-950/10 bg-white p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        >
          <TextField
            id={`social-${index}-platform`}
            label={t("cmsSocialPlatform")}
            value={asString(item.platform)}
            onChange={(value) => patch(index, "platform", value)}
            error={errors[pathFor(index, "platform")]}
          />
          <TextField
            id={`social-${index}-url`}
            label={t("cmsSocialUrl")}
            value={asString(item.url)}
            dir="ltr"
            onChange={(value) => patch(index, "url", value)}
            error={errors[pathFor(index, "url")]}
          />
          <SecondaryButton onClick={() => onChange(items.filter((_, i) => i !== index))}>
            {t("cmsRemoveItem")}
          </SecondaryButton>
        </div>
      ))}
      <div>
        <SecondaryButton onClick={() => onChange([...items, { platform: "", url: "" }])}>
          + {t("cmsAddItem")}
        </SecondaryButton>
      </div>
    </div>
  );
}

function OptionalBlock({
  label,
  enabled,
  enableLabel,
  disableLabel,
  onToggle,
  children,
}: {
  label: string;
  enabled: boolean;
  enableLabel: string;
  disableLabel: string;
  onToggle: (enabled: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-zain-green-950/10 bg-zain-cream-50/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body font-semibold text-zain-green-950">{label}</p>
        <SecondaryButton onClick={() => onToggle(!enabled)}>
          {enabled ? disableLabel : enableLabel}
        </SecondaryButton>
      </div>
      {enabled ? <div className="mt-4 flex flex-col gap-4">{children}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-section forms
// ---------------------------------------------------------------------------

export function HomeFields({
  draft,
  update,
  errors,
}: {
  draft: Draft;
  update: DraftUpdate;
  errors: FieldErrors;
}) {
  const t = useTranslations("admin");
  const tHome = useTranslations("home");
  const ctas = getIn(draft, ["ctas"]);
  const finalCta = getIn(draft, ["finalCta"]);
  const ctasEnabled = ctas !== undefined && ctas !== null;
  const finalCtaEnabled = finalCta !== undefined && finalCta !== null;

  const bodyField = (
    label: string,
    path: (string | number)[],
  ) => (
    <TextAreaField
      id={path.join("-")}
      label={label}
      value={asString(getIn(draft, path))}
      onChange={(value) => update(path, value)}
      error={errors[path.join(".")]}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4">
        <TextField
          id="home-hero-headline"
          label={t("cmsHeroHeadline")}
          value={asString(getIn(draft, ["hero", "headline"]))}
          onChange={(value) => update(["hero", "headline"], value)}
          error={errors["hero.headline"]}
        />
        {bodyField(t("cmsHeroSupporting"), ["hero", "supporting"])}
      </div>

      <OptionalBlock
        label={t("cmsPrimaryCta") + " / " + t("cmsSecondaryCta")}
        enabled={ctasEnabled}
        enableLabel={t("cmsOptionalEnable")}
        disableLabel={t("cmsOptionalDisable")}
        onToggle={(enabled) =>
          update(
            ["ctas"],
            enabled
              ? {
                  primary: { label: "", href: "" },
                  secondary: { label: "", href: "" },
                }
              : undefined,
          )
        }
      >
        <CtaFields
          idPrefix="home-cta-primary"
          basePath={["ctas", "primary"]}
          draft={draft}
          update={update}
          errors={errors}
        />
        <CtaFields
          idPrefix="home-cta-secondary"
          basePath={["ctas", "secondary"]}
          draft={draft}
          update={update}
          errors={errors}
        />
      </OptionalBlock>

      <StatisticsField items={asArray(getIn(draft, ["statistics"])).map(asRecord)} update={update} errors={errors} />

      {bodyField(tHome("aboutPreviewTitle"), ["aboutPreview", "body"])}
      {bodyField(tHome("missionTitle"), ["mission", "body"])}
      {bodyField(tHome("visionTitle"), ["vision", "body"])}
      {bodyField(tHome("sustainabilityTitle"), ["sustainability", "body"])}
      {bodyField(tHome("innovationTitle"), ["innovation", "body"])}
      {bodyField(tHome("geographicPresenceTitle"), ["geographicPresence", "body"])}

      <StringListField
        idPrefix="home-featured-brands"
        label={t("cmsFeaturedBrands")}
        values={asStringArray(getIn(draft, ["featuredBrands"]))}
        addLabel={t("cmsAddItem")}
        removeLabel={t("cmsRemoveItem")}
        onChange={(values) => update(["featuredBrands"], values)}
      />
      <StringListField
        idPrefix="home-featured-products"
        label={t("cmsFeaturedProducts")}
        values={asStringArray(getIn(draft, ["featuredProducts"]))}
        addLabel={t("cmsAddItem")}
        removeLabel={t("cmsRemoveItem")}
        onChange={(values) => update(["featuredProducts"], values)}
      />

      <OptionalBlock
        label={tHome("closingCtaTitle")}
        enabled={finalCtaEnabled}
        enableLabel={t("cmsOptionalEnable")}
        disableLabel={t("cmsOptionalDisable")}
        onToggle={(enabled) =>
          update(
            ["finalCta"],
            enabled
              ? {
                  title: "",
                  primary: { label: "", href: "" },
                  secondary: { label: "", href: "" },
                }
              : undefined,
          )
        }
      >
        <TextField
          id="home-final-title"
          label={t("cmsFinalCtaTitle")}
          value={asString(getIn(draft, ["finalCta", "title"]))}
          onChange={(value) => update(["finalCta", "title"], value)}
          error={errors["finalCta.title"]}
        />
        <CtaFields
          idPrefix="home-final-primary"
          basePath={["finalCta", "primary"]}
          draft={draft}
          update={update}
          errors={errors}
        />
        <CtaFields
          idPrefix="home-final-secondary"
          basePath={["finalCta", "secondary"]}
          draft={draft}
          update={update}
          errors={errors}
        />
      </OptionalBlock>
    </div>
  );
}

export function AboutFields({
  draft,
  update,
  errors,
}: {
  draft: Draft;
  update: DraftUpdate;
  errors: FieldErrors;
}) {
  const t = useTranslations("admin");
  const tAbout = useTranslations("about");

  const paragraphList = (
    label: string,
    path: (string | number)[],
    errorPrefix: string,
  ) => (
    <StringListField
      idPrefix={path.join("-")}
      label={label}
      multiline
      values={asStringArray(getIn(draft, path))}
      addLabel={t("cmsAddParagraph")}
      removeLabel={t("cmsRemoveItem")}
      onChange={(values) => update(path, values)}
      itemError={(index) => errors[`${errorPrefix}.${index}`]}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      {paragraphList(tAbout("storyTitle"), ["story"], "story")}
      {paragraphList(tAbout("historyTitle"), ["history"], "history")}
      {paragraphList(tAbout("profileTitle"), ["profile"], "profile")}
      {paragraphList(tAbout("journeyTitle"), ["journey"], "journey")}

      <TextAreaField
        id="about-mission"
        label={tAbout("missionTitle")}
        value={asString(getIn(draft, ["mission", "body"]))}
        onChange={(value) => update(["mission", "body"], value)}
        error={errors["mission.body"]}
      />
      <TextAreaField
        id="about-vision"
        label={tAbout("visionTitle")}
        value={asString(getIn(draft, ["vision", "body"]))}
        onChange={(value) => update(["vision", "body"], value)}
        error={errors["vision.body"]}
      />

      <ValuesField items={asArray(getIn(draft, ["values"])).map(asRecord)} update={update} errors={errors} />

      {paragraphList(
        tAbout("sustainabilityTitle"),
        ["sustainability", "paragraphs"],
        "sustainability.paragraphs",
      )}
      <TextAreaField
        id="about-innovation"
        label={tAbout("innovationTitle")}
        value={asString(getIn(draft, ["innovation", "body"]))}
        onChange={(value) => update(["innovation", "body"], value)}
        error={errors["innovation.body"]}
      />
    </div>
  );
}

export function ContactFields({
  draft,
  update,
  errors,
}: {
  draft: Draft;
  update: DraftUpdate;
  errors: FieldErrors;
}) {
  const t = useTranslations("admin");
  const optionalText = (
    label: string,
    path: (string | number)[],
  ) => (
    <TextField
      id={path.join("-")}
      label={label}
      value={asString(getIn(draft, path))}
      onChange={(value) => update(path, value === "" ? undefined : value)}
      error={errors[path.join(".")]}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <StringListField
        idPrefix="contact-phone"
        label={t("cmsPhonesField")}
        values={asStringArray(getIn(draft, ["phone"]))}
        addLabel={t("cmsAddItem")}
        removeLabel={t("cmsRemoveItem")}
        dir="ltr"
        onChange={(values) => update(["phone"], values.length ? values : undefined)}
        itemError={(index) => errors[`phone.${index}`]}
      />
      {optionalText(t("cmsEmailField"), ["email"])}
      {optionalText(t("cmsAddressField"), ["address"])}
      {optionalText(t("cmsWorkingHoursField"), ["workingHours"])}
      {optionalText(t("cmsMapUrlField"), ["mapUrl"])}
      <div className="flex flex-col gap-2">
        <p className="text-body font-semibold text-zain-green-950">{t("settingsSocialLinks")}</p>
        <SocialLinksField
          items={asArray(getIn(draft, ["socialLinks"])).map(asRecord)}
          errorPrefix="socialLinks"
          errors={errors}
          onChange={(items) => update(["socialLinks"], items.length ? items : undefined)}
        />
      </div>
    </div>
  );
}
