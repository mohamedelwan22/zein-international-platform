"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  SETTINGS_KEYS,
  SETTINGS_SCHEMAS,
  type SettingsKey,
} from "@/server/validation/cms";
import {
  asArray,
  asRecord,
  asString,
  asStringArray,
  flattenIssues,
  setIn,
  SocialLinksField,
  StringListField,
  TextAreaField,
  TextField,
  type Draft,
  type FieldErrors,
} from "./cms-fields";

/**
 * Admin Settings editor (US6, T070, admin-api.md §9, FR-014).
 *
 * Renders the four supported settings keys (`contact_info`, `social_links`,
 * `working_hours`, `privacy_notice`) as typed bilingual fields. Save validates
 * both locales against the per-key Zod schema (so unsupported keys/fields are
 * impossible), then writes through `PUT /api/admin/settings/{key}`; the write
 * is permission-gated server-side by `settings:update`.
 */

export interface SettingsData {
  key: SettingsKey;
  valueEn: unknown;
  valueAr: unknown;
  updatedAt: string | null;
}

type Locale = "en" | "ar";

const LOCALES: readonly Locale[] = ["en", "ar"];

const SETTING_LABEL_KEY: Record<SettingsKey, string> = {
  contact_info: "settingsContactInfo",
  social_links: "settingsSocialLinks",
  working_hours: "settingsWorkingHours",
  privacy_notice: "settingsPrivacyNotice",
};

interface SettingEntry {
  en: unknown;
  ar: unknown;
  updatedAt: string | null;
}

function defaultValue(key: SettingsKey): unknown {
  switch (key) {
    case "contact_info":
      return {
        country: "",
        city: "",
        district: "",
        address: "",
        phones: [],
        email: "",
        website: "",
        note: "",
      };
    case "social_links":
      return [];
    case "working_hours":
    case "privacy_notice":
      return "";
  }
}

function mergeValue(key: SettingsKey, incoming: unknown): unknown {
  const base = defaultValue(key);
  if (base && typeof base === "object" && !Array.isArray(base)) {
    if (incoming && typeof incoming === "object" && !Array.isArray(incoming)) {
      return { ...(base as Draft), ...(incoming as Draft) };
    }
    return base;
  }
  if (Array.isArray(base)) return Array.isArray(incoming) ? incoming : base;
  return typeof incoming === "string" ? incoming : base;
}

function initState(data: SettingsData[]): Record<string, SettingEntry> {
  const out: Record<string, SettingEntry> = {};
  for (const key of SETTINGS_KEYS) {
    const row = data.find((entry) => entry.key === key);
    out[key] = {
      en: mergeValue(key, row?.valueEn),
      ar: mergeValue(key, row?.valueAr),
      updatedAt: row?.updatedAt ?? null,
    };
  }
  return out;
}

export function SettingsEditor({
  settings: initialSettings,
  canUpdate,
}: {
  settings: SettingsData[];
  canUpdate: boolean;
}) {
  const t = useTranslations("admin");
  const tLang = useTranslations("languageSwitch");
  const tErrors = useTranslations("errors");
  const router = useRouter();

  const [values, setValues] = useState<Record<string, SettingEntry>>(() =>
    initState(initialSettings),
  );
  const [active, setActive] = useState<SettingsKey>("contact_info");
  const [locale, setLocale] = useState<Locale>("en");
  const [pending, setPending] = useState<SettingsKey | null>(null);
  const [errors, setErrors] = useState<Record<string, FieldErrors>>({});
  const [feedback, setFeedback] = useState<Record<string, { tone: "ok" | "error"; text: string }>>(
    {},
  );

  const errorKey = `${active}:${locale}`;
  const fieldErrors: FieldErrors = errors[errorKey] ?? {};
  const current = values[active];
  const value = current[locale];
  const busy = pending !== null;

  const setPath = (path: (string | number)[], next: unknown) => {
    setValues((prev) => ({
      ...prev,
      [active]: { ...prev[active], [locale]: setIn(prev[active][locale], path, next) },
    }));
    setErrors((prev) => ({ ...prev, [errorKey]: {} }));
    setFeedback((prev) => {
      if (!(active in prev)) return prev;
      const next = { ...prev };
      delete next[active];
      return next;
    });
  };

  const setWhole = (next: unknown) => setPath([], next);

  async function save() {
    const entry = values[active];
    const parsedEn = SETTINGS_SCHEMAS[active].safeParse(entry.en);
    const parsedAr = SETTINGS_SCHEMAS[active].safeParse(entry.ar);
    if (!parsedEn.success || !parsedAr.success) {
      setErrors((prev) => {
        const next = { ...prev };
        if (!parsedEn.success) next[`${active}:en`] = flattenIssues(parsedEn.error);
        if (!parsedAr.success) next[`${active}:ar`] = flattenIssues(parsedAr.error);
        return next;
      });
      setFeedback((prev) => ({
        ...prev,
        [active]: { tone: "error", text: t("settingsActionFailed") },
      }));
      return;
    }

    setPending(active);
    try {
      const response = await fetch(`/api/admin/settings/${active}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valueEn: parsedEn.data, valueAr: parsedAr.data }),
      });
      if (!response.ok) {
        let code = "";
        try {
          const body = (await response.json()) as { error?: { code?: string } };
          code = body?.error?.code ?? "";
        } catch {
          // ignore non-JSON error bodies
        }
        if (response.status === 400 || code === "VALIDATION_FAILED") {
          setFeedback((prev) => ({
            ...prev,
            [active]: { tone: "error", text: t("settingsActionFailed") },
          }));
        } else if (response.status === 403) {
          setFeedback((prev) => ({
            ...prev,
            [active]: { tone: "error", text: tErrors("forbidden") },
          }));
        } else {
          setFeedback((prev) => ({
            ...prev,
            [active]: { tone: "error", text: t("settingsActionFailed") },
          }));
        }
        return;
      }
      const row = (await response.json()) as { valueEn?: unknown; valueAr?: unknown; updatedAt?: string };
      setValues((prev) => ({
        ...prev,
        [active]: {
          en: mergeValue(active, row.valueEn ?? prev[active].en),
          ar: mergeValue(active, row.valueAr ?? prev[active].ar),
          updatedAt: row.updatedAt ?? prev[active].updatedAt,
        },
      }));
      setErrors((prev) => ({ ...prev, [`${active}:en`]: {}, [`${active}:ar`]: {} }));
      setFeedback((prev) => ({
        ...prev,
        [active]: { tone: "ok", text: t("settingsSaved") },
      }));
      router.refresh();
    } catch {
      setFeedback((prev) => ({
        ...prev,
        [active]: { tone: "error", text: t("settingsActionFailed") },
      }));
    } finally {
      setPending(null);
    }
  }

  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const formatDate = (raw: string | null) => {
    if (!raw) return "—";
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? "—" : dateFmt.format(parsed);
  };

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-h2 font-bold text-zain-green-950">{t("settings")}</h1>
        <p className="mt-2 max-w-3xl text-body text-zain-charcoal">{t("settingsIntro")}</p>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist">
        {SETTINGS_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active === key}
            onClick={() => setActive(key)}
            className={`min-h-11 rounded-full px-5 py-2 text-body ${
              active === key
                ? "bg-zain-green-950 font-semibold text-zain-cream-50"
                : "border border-zain-green-950/20 text-zain-green-950 hover:bg-zain-green-950/5"
            }`}
          >
            {t(SETTING_LABEL_KEY[key] as never)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap items-center gap-2" aria-label={t("cmsLocaleLabel")}>
          {LOCALES.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={locale === option}
              onClick={() => setLocale(option)}
              className={`min-h-9 rounded-sm px-4 py-1 text-meta font-semibold ${
                locale === option
                  ? "bg-zain-green-700 text-zain-white"
                  : "border border-zain-green-950/20 text-zain-green-950 hover:bg-zain-green-950/5"
              }`}
            >
              {tLang(option)}
            </button>
          ))}
        </div>
        <span className="text-meta text-zain-green-950/70">
          {t("cmsSavedAtLabel")}: {formatDate(current.updatedAt)}
        </span>
      </div>

      <div className="rounded-lg border border-zain-green-950/10 bg-zain-cream-50/40 p-5 md:p-6">
        <SettingFields
          settingKey={active}
          locale={locale}
          value={value}
          update={setPath}
          replace={setWhole}
          errors={fieldErrors}
        />
      </div>

      {canUpdate ? (
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="inline-flex min-h-11 items-center justify-center rounded-sm bg-zain-green-950 px-6 py-2.5 text-body font-semibold text-zain-cream-50 transition-colors hover:bg-zain-green-900 disabled:opacity-60"
          >
            {pending === active ? t("settingsSaving") : t("settingsSave")}
          </button>
          {feedback[active] ? (
            <span
              role="status"
              className={
                feedback[active].tone === "ok"
                  ? "text-body text-zain-green-700"
                  : "text-body text-red-700"
              }
            >
              {feedback[active].text}
            </span>
          ) : null}
        </div>
      ) : null}

      {Object.keys(fieldErrors).length ? (
        <div role="alert" className="rounded-md border border-red-700/30 bg-red-50 p-4">
          <p className="text-body font-semibold text-red-700">{t("cmsValidationSummary")}</p>
          <ul className="mt-2 list-disc space-y-1 ps-5 text-meta text-red-700">
            {Object.entries(fieldErrors).map(([path, message]) => (
              <li key={path}>
                <span dir="ltr">{path}</span>: {message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function SettingFields({
  settingKey,
  locale,
  value,
  update,
  replace,
  errors,
}: {
  settingKey: SettingsKey;
  locale: Locale;
  value: unknown;
  update: (path: (string | number)[], next: unknown) => void;
  replace: (next: unknown) => void;
  errors: FieldErrors;
}) {
  const t = useTranslations("admin");
  const dir = locale === "ar" ? "rtl" : "ltr";

  if (settingKey === "working_hours") {
    return (
      <TextAreaField
        id="setting-working-hours"
        label={t("cmsWorkingHoursField")}
        value={asString(value)}
        dir={dir}
        onChange={(next) => replace(next)}
        error={errors["_form"]}
      />
    );
  }

  if (settingKey === "privacy_notice") {
    return (
      <TextAreaField
        id="setting-privacy-notice"
        label={t("cmsPrivacyNoticeField")}
        value={asString(value)}
        dir={dir}
        rows={8}
        onChange={(next) => replace(next)}
        error={errors["_form"]}
      />
    );
  }

  if (settingKey === "social_links") {
    return (
      <SocialLinksField
        items={asArray(value).map(asRecord)}
        errorPrefix=""
        errors={errors}
        onChange={(items) => replace(items)}
      />
    );
  }

  const contact = asRecord(value);
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="setting-country"
          label={t("cmsCountryField")}
          value={asString(contact.country)}
          dir={dir}
          onChange={(next) => update(["country"], next)}
          error={errors["country"]}
        />
        <TextField
          id="setting-city"
          label={t("cmsCityField")}
          value={asString(contact.city)}
          dir={dir}
          onChange={(next) => update(["city"], next)}
          error={errors["city"]}
        />
        <TextField
          id="setting-district"
          label={t("cmsDistrictField")}
          value={asString(contact.district)}
          dir={dir}
          onChange={(next) => update(["district"], next)}
          error={errors["district"]}
        />
        <TextField
          id="setting-address"
          label={t("cmsAddressField")}
          value={asString(contact.address)}
          dir={dir}
          onChange={(next) => update(["address"], next)}
          error={errors["address"]}
        />
      </div>

      <StringListField
        idPrefix="setting-phones"
        label={t("cmsPhonesField")}
        values={asStringArray(contact.phones)}
        addLabel={t("cmsAddItem")}
        removeLabel={t("cmsRemoveItem")}
        dir="ltr"
        onChange={(phones) => update(["phones"], phones)}
        itemError={(index) => errors[`phones.${index}`]}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="setting-email"
          label={t("cmsEmailField")}
          value={asString(contact.email)}
          dir="ltr"
          onChange={(next) => update(["email"], next)}
          error={errors["email"]}
        />
        <TextField
          id="setting-website"
          label={t("cmsWebsiteField")}
          value={asString(contact.website)}
          dir="ltr"
          onChange={(next) => update(["website"], next)}
          error={errors["website"]}
        />
      </div>

      <TextAreaField
        id="setting-note"
        label={t("cmsNoteField")}
        value={asString(contact.note)}
        dir={dir}
        rows={3}
        onChange={(next) => update(["note"], next === "" ? undefined : next)}
        error={errors["note"]}
      />
    </div>
  );
}
