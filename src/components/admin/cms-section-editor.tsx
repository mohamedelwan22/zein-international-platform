"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  CMS_SECTION_KEYS,
  CMS_SECTION_SCHEMAS,
  type CmsSectionKey,
} from "@/server/validation/cms";
import type { AppLocale } from "@/i18n/routing";
import {
  AboutFields,
  ContactFields,
  flattenIssues,
  HomeFields,
  mergeDraft,
  setIn,
  type Draft,
  type FieldErrors,
} from "./cms-fields";
import { CmsSectionPreview } from "./cms-section-preview";

/**
 * Admin CMS editor (US6, T070, admin-api.md §6, FR-031/FR-032).
 *
 * Reads the fixed section registry (home/about/contact × en/ar) and writes
 * structured drafts only. Save validates against the same per-section Zod
 * schema the API enforces, so invalid or unsupported fields are refused with
 * a visible field-level message before any request is sent. Publish/unpublish
 * follow the contract endpoints and are hidden when the role lacks
 * `cms:publish`; the preview renders the draft for staff only.
 */

export interface CmsSectionData {
  sectionKey: CmsSectionKey;
  locale: AppLocale;
  draftContent: unknown;
  publishedContent: unknown | null;
  version: number;
  updatedAt: string;
  publishedAt: string | null;
}

interface SectionState {
  sectionKey: CmsSectionKey;
  locale: AppLocale;
  draft: Draft;
  published: unknown | null;
  version: number;
  updatedAt: string;
  publishedAt: string | null;
  dirty: boolean;
}

const SECTIONS: readonly CmsSectionKey[] = CMS_SECTION_KEYS;
const LOCALES: readonly AppLocale[] = ["en", "ar"];

function keyOf(sectionKey: CmsSectionKey, locale: AppLocale): string {
  return `${sectionKey}:${locale}`;
}

function initState(data: CmsSectionData[]): Record<string, SectionState> {
  const out: Record<string, SectionState> = {};
  for (const entry of data) {
    out[keyOf(entry.sectionKey, entry.locale)] = {
      sectionKey: entry.sectionKey,
      locale: entry.locale,
      draft: mergeDraft(entry.sectionKey, entry.draftContent),
      published: entry.publishedContent,
      version: entry.version,
      updatedAt: entry.updatedAt,
      publishedAt: entry.publishedAt,
      dirty: false,
    };
  }
  return out;
}

export function CmsSectionEditor({
  sections: initialSections,
  canUpdate,
  canPublish,
}: {
  sections: CmsSectionData[];
  canUpdate: boolean;
  canPublish: boolean;
}) {
  const t = useTranslations("admin");
  const tNav = useTranslations("nav");
  const tLang = useTranslations("languageSwitch");
  const tErrors = useTranslations("errors");
  const router = useRouter();

  const [sections, setSections] = useState<Record<string, SectionState>>(() =>
    initState(initialSections),
  );
  const [activeSection, setActiveSection] = useState<CmsSectionKey>("home");
  const [activeLocale, setActiveLocale] = useState<AppLocale>("en");
  const [showPreview, setShowPreview] = useState(false);
  const [pending, setPending] = useState<"save" | "publish" | "unpublish" | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const state = sections[keyOf(activeSection, activeLocale)];
  const endpoint = `/api/admin/cms/sections/${activeSection}/${activeLocale}`;
  const busy = pending !== null;
  const errorEntries = Object.entries(errors);

  const update: (path: (string | number)[], value: unknown) => void = (path, value) => {
    const key = keyOf(activeSection, activeLocale);
    setSections((prev) => {
      const current = prev[key];
      return {
        ...prev,
        [key]: { ...current, draft: setIn(current.draft, path, value) as Draft, dirty: true },
      };
    });
    if (errorEntries.length) setErrors({});
    setFeedback(null);
  };

  async function applyError(response: Response) {
    let code = "";
    let details: { path?: string; message?: string; locale?: string }[] | undefined;
    try {
      const body = (await response.json()) as {
        error?: { code?: string; details?: { path?: string; message?: string; locale?: string }[] };
      };
      code = body?.error?.code ?? "";
      details = body?.error?.details;
    } catch {
      // Non-JSON error body — fall through to the generic message.
    }
    if (response.status === 409 || code === "VERSION_CONFLICT") {
      setFeedback({ tone: "error", text: t("versionConflictAction") });
      return;
    }
    if (response.status === 400 || code === "VALIDATION_FAILED") {
      const map: FieldErrors = {};
      for (const detail of details ?? []) {
        if (detail.path) map[detail.path] = detail.message ?? "";
      }
      setErrors(map);
      setFeedback({ tone: "error", text: t("cmsActionFailed") });
      return;
    }
    if (response.status === 403) {
      setFeedback({ tone: "error", text: tErrors("forbidden") });
      return;
    }
    setFeedback({ tone: "error", text: t("cmsActionFailed") });
  }

  async function persistDraft(): Promise<SectionState | null> {
    const key = keyOf(activeSection, activeLocale);
    const current = sections[key];
    const parsed = CMS_SECTION_SCHEMAS[current.sectionKey].safeParse(current.draft);
    if (!parsed.success) {
      setErrors(flattenIssues(parsed.error));
      setFeedback({ tone: "error", text: t("cmsActionFailed") });
      return null;
    }

    setPending("save");
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "If-Match": String(current.version),
        },
        body: JSON.stringify(current.draft),
      });
      if (!response.ok) {
        await applyError(response);
        return null;
      }
      const row = (await response.json()) as Partial<CmsSectionData>;
      const next: SectionState = {
        ...current,
        draft: mergeDraft(current.sectionKey, row.draftContent ?? current.draft),
        published: row.publishedContent ?? current.published,
        version: row.version ?? current.version,
        updatedAt: row.updatedAt ?? current.updatedAt,
        publishedAt: row.publishedAt ?? current.publishedAt,
        dirty: false,
      };
      setSections((prev) => ({ ...prev, [key]: next }));
      setErrors({});
      setFeedback({ tone: "ok", text: t("cmsDraftSaved") });
      return next;
    } catch {
      setFeedback({ tone: "error", text: t("cmsActionFailed") });
      return null;
    } finally {
      setPending(null);
    }
  }

  async function publish() {
    const key = keyOf(activeSection, activeLocale);
    let version = sections[key].version;
    if (sections[key].dirty) {
      const saved = await persistDraft();
      if (!saved) return;
      version = saved.version;
    }

    setPending("publish");
    try {
      const response = await fetch(`${endpoint}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version }),
      });
      if (!response.ok) {
        await applyError(response);
        return;
      }
      const row = (await response.json()) as Partial<CmsSectionData>;
      setSections((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          published: row.publishedContent ?? prev[key].draft,
          publishedAt: row.publishedAt ?? new Date().toISOString(),
          version: row.version ?? version,
          updatedAt: row.updatedAt ?? prev[key].updatedAt,
        },
      }));
      setFeedback({ tone: "ok", text: t("cmsPublished") });
      router.refresh();
    } catch {
      setFeedback({ tone: "error", text: t("cmsActionFailed") });
    } finally {
      setPending(null);
    }
  }

  async function unpublish() {
    const key = keyOf(activeSection, activeLocale);
    setPending("unpublish");
    try {
      const response = await fetch(`${endpoint}/unpublish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: sections[key].version }),
      });
      if (!response.ok) {
        await applyError(response);
        return;
      }
      const row = (await response.json()) as Partial<CmsSectionData>;
      setSections((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          published: null,
          publishedAt: null,
          version: row.version ?? prev[key].version,
          updatedAt: row.updatedAt ?? prev[key].updatedAt,
        },
      }));
      setFeedback({ tone: "ok", text: t("cmsUnpublished") });
      router.refresh();
    } catch {
      setFeedback({ tone: "error", text: t("cmsActionFailed") });
    } finally {
      setPending(null);
    }
  }

  const dateFmt = new Intl.DateTimeFormat(activeLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const formatDate = (value: string | null) => {
    if (!value) return "—";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "—" : dateFmt.format(parsed);
  };

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-h2 font-bold text-zain-green-950">{t("cms")}</h1>
        <p className="mt-2 max-w-3xl text-body text-zain-charcoal">{t("cmsIntro")}</p>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("cmsSectionLabel")}>
        {SECTIONS.map((sectionKey) => (
          <button
            key={sectionKey}
            type="button"
            role="tab"
            aria-selected={activeSection === sectionKey}
            onClick={() => {
              setActiveSection(sectionKey);
              setErrors({});
              setFeedback(null);
            }}
            className={`min-h-11 rounded-full px-5 py-2 text-body ${
              activeSection === sectionKey
                ? "bg-zain-green-950 font-semibold text-zain-cream-50"
                : "border border-zain-green-950/20 text-zain-green-950 hover:bg-zain-green-950/5"
            }`}
          >
            {tNav(sectionKey)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2" aria-label={t("cmsLocaleLabel")}>
        {LOCALES.map((locale) => (
          <button
            key={locale}
            type="button"
            aria-pressed={activeLocale === locale}
            onClick={() => {
              setActiveLocale(locale);
              setErrors({});
              setFeedback(null);
            }}
            className={`min-h-9 rounded-sm px-4 py-1 text-meta font-semibold ${
              activeLocale === locale
                ? "bg-zain-green-700 text-zain-white"
                : "border border-zain-green-950/20 text-zain-green-950 hover:bg-zain-green-950/5"
            }`}
          >
            {tLang(locale)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-zain-green-950/10 bg-zain-cream-50/60 px-4 py-3 text-meta text-zain-green-950/80">
        <span>
          {t("statusLabel")}:{" "}
          <strong>
            {state.published ? t("cmsPublishedState") : t("cmsUnpublishedState")}
          </strong>
        </span>
        <span>{t("cmsVersionLabel", { version: state.version })}</span>
        <span>
          {t("cmsSavedAtLabel")}: {formatDate(state.updatedAt)}
        </span>
        {state.published ? (
          <span>
            {t("cmsPublishedAtLabel")}: {formatDate(state.publishedAt)}
          </span>
        ) : null}
        {state.dirty ? <span className="font-semibold text-zain-gold-700">{t("cmsDraftState")} •</span> : null}
      </div>

      <div className="flex flex-wrap gap-3">
        {canUpdate ? (
          <button
            type="button"
            onClick={() => void persistDraft()}
            disabled={busy}
            className="inline-flex min-h-11 items-center justify-center rounded-sm bg-zain-green-950 px-6 py-2.5 text-body font-semibold text-zain-cream-50 transition-colors hover:bg-zain-green-900 disabled:opacity-60"
          >
            {pending === "save" ? t("cmsSaving") : t("cmsSaveDraft")}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setShowPreview((value) => !value)}
          className="inline-flex min-h-11 items-center justify-center rounded-sm border border-zain-green-950/25 px-6 py-2.5 text-body font-semibold text-zain-green-950 transition-colors hover:bg-zain-green-950/5"
        >
          {showPreview ? t("cmsHidePreview") : t("cmsPreview")}
        </button>
        {canPublish ? (
          <>
            <button
              type="button"
              onClick={() => void publish()}
              disabled={busy}
              className="inline-flex min-h-11 items-center justify-center rounded-sm border border-zain-green-700 px-6 py-2.5 text-body font-semibold text-zain-green-800 transition-colors hover:bg-zain-green-700/10 disabled:opacity-60"
            >
              {pending === "publish" ? t("cmsPublishing") : t("cmsPublish")}
            </button>
            <button
              type="button"
              onClick={() => void unpublish()}
              disabled={busy || !state.published}
              className="inline-flex min-h-11 items-center justify-center rounded-sm border border-red-700/40 px-6 py-2.5 text-body font-semibold text-red-700 transition-colors hover:bg-red-700/5 disabled:opacity-40"
            >
              {pending === "unpublish" ? t("cmsUnpublishing") : t("cmsUnpublish")}
            </button>
          </>
        ) : null}
      </div>

      {state.dirty ? <p className="text-meta text-zain-green-950/60">{t("cmsDirtyHint")}</p> : null}

      {feedback ? (
        <p
          role="status"
          className={feedback.tone === "ok" ? "text-body text-zain-green-700" : "text-body text-red-700"}
        >
          {feedback.text}
        </p>
      ) : null}

      {errorEntries.length ? (
        <div role="alert" className="rounded-md border border-red-700/30 bg-red-50 p-4">
          <p className="text-body font-semibold text-red-700">{t("cmsValidationSummary")}</p>
          <ul className="mt-2 list-disc space-y-1 ps-5 text-meta text-red-700">
            {errorEntries.map(([path, message]) => (
              <li key={path}>
                <span dir="ltr">{path}</span>: {message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-lg border border-zain-green-950/10 bg-zain-cream-50/40 p-5 md:p-6">
        {activeSection === "home" ? (
          <HomeFields draft={state.draft} update={update} errors={errors} />
        ) : activeSection === "about" ? (
          <AboutFields draft={state.draft} update={update} errors={errors} />
        ) : (
          <ContactFields draft={state.draft} update={update} errors={errors} />
        )}
      </div>

      {showPreview ? (
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-h3 font-semibold text-zain-green-950">{t("cmsPreviewTitle")}</h2>
            <p className="text-meta text-zain-green-950/60">{t("cmsPreviewHint")}</p>
          </div>
          <CmsSectionPreview
            sectionKey={activeSection}
            locale={activeLocale}
            draft={state.draft}
          />
        </div>
      ) : null}
    </section>
  );
}
