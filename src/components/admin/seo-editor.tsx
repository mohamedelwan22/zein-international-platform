"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { MediaPicker } from "./media-picker";
import { TextAreaField, TextField } from "./cms-fields";

/**
 * Admin SEO editor (US10, T104/T105, admin-api.md §7, FR-043).
 *
 * Picks a static page or a public entity, edits the en/ar override, and saves
 * through `PUT /api/admin/seo/{targetKey}/{locale}`. Slug changes for
 * slug-bearing entities are saved in the same request and create a
 * `SlugRedirect` server-side. Redirects can also be managed explicitly below.
 */

export type SeoTargetGroup = "pages" | "brands" | "products" | "suppliers" | "categories";

export interface SeoEditorTarget {
  key: string;
  label: string;
  group: SeoTargetGroup;
  status?: string;
  slugs: Partial<Record<"en" | "ar", string>> | null;
}

export interface SeoEditorRow {
  targetType: string;
  targetId: string | null;
  pageKey: string | null;
  locale: "en" | "ar";
  metaTitle: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  slugOverride: string | null;
  ogImageMediaId: string | null;
  ogImageUrl: string | null;
  noindex: boolean;
  version: number;
  updatedAt: string;
}

export interface SeoEditorRedirect {
  id: string;
  entityType: string;
  locale: "en" | "ar";
  oldSlug: string;
  newSlug: string;
  createdAt: string;
}

interface Draft {
  metaTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  ogImageMediaId: string | null;
  noindex: boolean;
  slug: string;
  version?: number;
}

const LOCALES = ["en", "ar"] as const;
const REDIRECT_TYPES = ["brand", "product", "supplier", "category"] as const;

function rowKey(row: Pick<SeoEditorRow, "targetType" | "targetId" | "pageKey">): string {
  return row.pageKey ? `page:${row.pageKey}` : `${row.targetType}:${row.targetId}`;
}

function draftFrom(row: SeoEditorRow | undefined, target: SeoEditorTarget, locale: "en" | "ar"): Draft {
  return {
    metaTitle: row?.metaTitle ?? "",
    metaDescription: row?.metaDescription ?? "",
    canonicalUrl: row?.canonicalUrl ?? "",
    ogImageMediaId: row?.ogImageMediaId ?? null,
    noindex: row?.noindex ?? false,
    slug: target.slugs ? (row?.slugOverride ?? target.slugs[locale] ?? "") : "",
    version: row?.version,
  };
}

export function SeoEditor({
  targets,
  rows: initialRows,
  redirects: initialRedirects,
  canUpdate,
}: {
  targets: SeoEditorTarget[];
  rows: SeoEditorRow[];
  redirects: SeoEditorRedirect[];
  canUpdate: boolean;
}) {
  const t = useTranslations("admin");
  const tLang = useTranslations("languageSwitch");
  const tErrors = useTranslations("errors");
  const router = useRouter();

  const [targetKey, setTargetKey] = useState(targets[0]?.key ?? "");
  const [locale, setLocale] = useState<"en" | "ar">("en");
  const [rows, setRows] = useState(initialRows);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error" | "warn"; text: string } | null>(
    null,
  );

  const [redirects, setRedirects] = useState(initialRedirects);
  const [redirectForm, setRedirectForm] = useState({
    entityType: "brand",
    locale: "en",
    oldSlug: "",
    newSlug: "",
  });
  const [redirectBusy, setRedirectBusy] = useState(false);
  const [redirectFeedback, setRedirectFeedback] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);

  const target = targets.find((entry) => entry.key === targetKey) ?? targets[0];
  const stateKey = `${target?.key ?? ""}:${locale}`;
  const row = rows.find(
    (entry) => rowKey(entry) === target?.key && entry.locale === locale,
  );
  const draft = target
    ? (drafts[stateKey] ?? draftFrom(row, target, locale))
    : null;

  const groups: SeoTargetGroup[] = ["pages", "brands", "products", "suppliers", "categories"];

  function update(patch: Partial<Draft>) {
    if (!draft) return;
    setDrafts((prev) => ({ ...prev, [stateKey]: { ...draft, ...patch } }));
    setFeedback(null);
  }

  async function save() {
    if (!target || !draft) return;
    setSaving(true);
    setFeedback(null);
    try {
      const body: Record<string, unknown> = {
        metaTitle: draft.metaTitle.trim() || null,
        metaDescription: draft.metaDescription.trim() || null,
        canonicalUrl: draft.canonicalUrl.trim() || null,
        ogImageMediaId: draft.ogImageMediaId,
        noindex: draft.noindex,
        version: draft.version,
      };
      if (target.slugs) {
        body.slug = draft.slug.trim() || null;
      }

      const response = await fetch(
        `/api/admin/seo/${encodeURIComponent(target.key)}/${locale}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        let code = "";
        try {
          const payload = (await response.json()) as { error?: { code?: string } };
          code = payload.error?.code ?? "";
        } catch {
          // ignore non-JSON error bodies
        }
        if (code === "VERSION_CONFLICT") {
          setFeedback({ tone: "warn", text: t("seoVersionConflict") });
        } else if (code === "SLUG_CONFLICT") {
          setFeedback({ tone: "error", text: t("seoSlugConflict") });
        } else if (response.status === 403) {
          setFeedback({ tone: "error", text: tErrors("forbidden") });
        } else if (code === "VALIDATION_FAILED") {
          setFeedback({ tone: "error", text: t("seoInvalid") });
        } else {
          setFeedback({ tone: "error", text: t("seoActionFailed") });
        }
        return;
      }

      const saved = (await response.json()) as SeoEditorRow;
      setRows((prev) => {
        const index = prev.findIndex(
          (entry) => rowKey(entry) === rowKey(saved) && entry.locale === saved.locale,
        );
        if (index === -1) return [saved, ...prev];
        const next = [...prev];
        next[index] = saved;
        return next;
      });
      setDrafts((prev) => ({
        ...prev,
        [stateKey]: draftFrom(saved, target, locale),
      }));
      setFeedback({ tone: "ok", text: t("seoSaved") });
      router.refresh();
    } catch {
      setFeedback({ tone: "error", text: t("seoActionFailed") });
    } finally {
      setSaving(false);
    }
  }

  async function addRedirect() {
    setRedirectBusy(true);
    setRedirectFeedback(null);
    try {
      const response = await fetch("/api/admin/seo/redirects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(redirectForm),
      });
      if (!response.ok) {
        let code = "";
        try {
          const payload = (await response.json()) as { error?: { code?: string } };
          code = payload.error?.code ?? "";
        } catch {
          // ignore non-JSON error bodies
        }
        setRedirectFeedback({
          tone: "error",
          text:
            code === "SLUG_CONFLICT"
              ? t("seoRedirectDuplicate")
              : code === "VALIDATION_FAILED"
                ? t("seoRedirectTargetMissing")
                : t("seoActionFailed"),
        });
        return;
      }
      const created = (await response.json()) as SeoEditorRedirect;
      setRedirects((prev) => [created, ...prev]);
      setRedirectForm((prev) => ({ ...prev, oldSlug: "", newSlug: "" }));
      setRedirectFeedback({ tone: "ok", text: t("seoRedirectAdded") });
      router.refresh();
    } catch {
      setRedirectFeedback({ tone: "error", text: t("seoActionFailed") });
    } finally {
      setRedirectBusy(false);
    }
  }

  async function removeRedirect(id: string) {
    setRedirectBusy(true);
    setRedirectFeedback(null);
    try {
      const response = await fetch(`/api/admin/seo/redirects/${id}`, { method: "DELETE" });
      if (!response.ok) {
        setRedirectFeedback({ tone: "error", text: t("seoActionFailed") });
        return;
      }
      setRedirects((prev) => prev.filter((entry) => entry.id !== id));
      setRedirectFeedback({ tone: "ok", text: t("seoRedirectDeleted") });
      router.refresh();
    } catch {
      setRedirectFeedback({ tone: "error", text: t("seoActionFailed") });
    } finally {
      setRedirectBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-h2 font-bold text-zain-green-950">{t("seo")}</h1>
        <p className="mt-2 max-w-3xl text-body text-zain-charcoal">{t("seoIntro")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="seo-target" className="text-body font-semibold text-zain-green-950">
            {t("seoTargetLabel")}
          </label>
          <select
            id="seo-target"
            value={target?.key ?? ""}
            onChange={(event) => {
              setTargetKey(event.target.value);
              setFeedback(null);
            }}
            className="min-h-11 rounded-sm border border-zain-green-950/25 bg-white px-3 py-2 text-body text-zain-green-950"
          >
            {groups.map((group) => {
              const entries = targets.filter((entry) => entry.group === group);
              if (entries.length === 0) return null;
              return (
                <optgroup key={group} label={t(`seoGroup${group[0].toUpperCase()}${group.slice(1)}` as never)}>
                  {entries.map((entry) => (
                    <option key={entry.key} value={entry.key}>
                      {entry.label}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-body font-semibold text-zain-green-950">
            {t("cmsLocaleLabel")}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {LOCALES.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={locale === option}
                onClick={() => {
                  setLocale(option);
                  setFeedback(null);
                }}
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
        </div>
      </div>

      {target && draft ? (
        <div className="rounded-lg border border-zain-green-950/10 bg-zain-cream-50/40 p-5 md:p-6">
          <div className="flex flex-col gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <TextField
                  id="seo-title"
                  label={t("seoMetaTitle")}
                  value={draft.metaTitle}
                  dir={locale === "ar" ? "rtl" : "ltr"}
                  onChange={(value) => update({ metaTitle: value })}
                />
                <span className="text-meta text-zain-green-950/60" dir="ltr">
                  {draft.metaTitle.length}/60
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <TextAreaField
                  id="seo-description"
                  label={t("seoMetaDescription")}
                  value={draft.metaDescription}
                  rows={3}
                  dir={locale === "ar" ? "rtl" : "ltr"}
                  onChange={(value) => update({ metaDescription: value })}
                />
                <span className="text-meta text-zain-green-950/60" dir="ltr">
                  {draft.metaDescription.length}/160
                </span>
              </div>
            </div>

            {target.slugs ? (
              <TextField
                id="seo-slug"
                label={t("seoSlug")}
                hint={t("seoSlugHint")}
                value={draft.slug}
                dir="ltr"
                onChange={(value) => update({ slug: value })}
              />
            ) : null}

            <TextField
              id="seo-canonical"
              label={t("seoCanonical")}
              hint={t("seoCanonicalHint")}
              value={draft.canonicalUrl}
              dir="ltr"
              onChange={(value) => update({ canonicalUrl: value })}
            />

            <MediaPicker
              idPrefix="seo-og"
              label={t("seoOgImage")}
              value={draft.ogImageMediaId}
              onChange={(value) => update({ ogImageMediaId: value })}
            />

            <label className="flex items-start gap-3 text-body text-zain-green-950">
              <input
                type="checkbox"
                checked={draft.noindex}
                onChange={(event) => update({ noindex: event.target.checked })}
                className="mt-1 h-5 w-5"
              />
              <span>
                <span className="block font-semibold">{t("seoNoindex")}</span>
                <span className="block text-meta text-zain-green-950/60">
                  {t("seoNoindexHint")}
                </span>
              </span>
            </label>

            <p className="text-meta text-zain-green-950/60">{t("seoFallbackHint")}</p>

            {canUpdate ? (
              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving}
                  className="inline-flex min-h-11 items-center justify-center rounded-sm bg-zain-green-950 px-6 py-2.5 text-body font-semibold text-zain-cream-50 transition-colors hover:bg-zain-green-900 disabled:opacity-60"
                >
                  {saving ? t("seoSaving") : t("seoSave")}
                </button>
                {feedback ? (
                  <span
                    role="status"
                    className={
                      feedback.tone === "ok"
                        ? "text-body text-zain-green-700"
                        : "text-body text-red-700"
                    }
                  >
                    {feedback.text}
                  </span>
                ) : null}
              </div>
            ) : (
              <p role="status" className="text-body text-zain-green-950/70">
                {t("seoReadOnly")}
              </p>
            )}
          </div>
        </div>
      ) : null}

      {canUpdate ? (
        <div className="rounded-lg border border-zain-green-950/10 bg-zain-cream-50/40 p-5 md:p-6">
          <h2 className="text-h3 font-semibold text-zain-green-950">
            {t("seoRedirectsHeading")}
          </h2>
          <p className="mt-2 max-w-3xl text-body text-zain-charcoal">
            {t("seoRedirectsIntro")}
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="seo-redirect-type" className="text-meta font-semibold">
                {t("seoRedirectEntity")}
              </label>
              <select
                id="seo-redirect-type"
                value={redirectForm.entityType}
                onChange={(event) =>
                  setRedirectForm((prev) => ({ ...prev, entityType: event.target.value }))
                }
                className="min-h-11 rounded-sm border border-zain-green-950/25 bg-white px-3 py-2 text-body"
              >
                {REDIRECT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`seoGroup${type[0].toUpperCase()}${type.slice(1)}` as never)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="seo-redirect-locale" className="text-meta font-semibold">
                {t("seoRedirectLocale")}
              </label>
              <select
                id="seo-redirect-locale"
                value={redirectForm.locale}
                onChange={(event) =>
                  setRedirectForm((prev) => ({ ...prev, locale: event.target.value }))
                }
                className="min-h-11 rounded-sm border border-zain-green-950/25 bg-white px-3 py-2 text-body"
              >
                {LOCALES.map((option) => (
                  <option key={option} value={option}>
                    {tLang(option)}
                  </option>
                ))}
              </select>
            </div>
            <TextField
              id="seo-redirect-old"
              label={t("seoRedirectOldSlug")}
              value={redirectForm.oldSlug}
              dir="ltr"
              onChange={(value) => setRedirectForm((prev) => ({ ...prev, oldSlug: value }))}
            />
            <TextField
              id="seo-redirect-new"
              label={t("seoRedirectNewSlug")}
              value={redirectForm.newSlug}
              dir="ltr"
              onChange={(value) => setRedirectForm((prev) => ({ ...prev, newSlug: value }))}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => void addRedirect()}
              disabled={
                redirectBusy ||
                redirectForm.oldSlug.trim().length === 0 ||
                redirectForm.newSlug.trim().length === 0
              }
              className="inline-flex min-h-11 items-center justify-center rounded-sm border border-zain-green-950 px-5 py-2 text-body font-semibold text-zain-green-950 hover:bg-zain-green-950/5 disabled:opacity-50"
            >
              {redirectBusy ? t("seoRedirectAdding") : t("seoRedirectAdd")}
            </button>
            {redirectFeedback ? (
              <span
                role="status"
                className={
                  redirectFeedback.tone === "ok"
                    ? "text-body text-zain-green-700"
                    : "text-body text-red-700"
                }
              >
                {redirectFeedback.text}
              </span>
            ) : null}
          </div>

          {redirects.length === 0 ? (
            <p className="mt-5 text-body text-zain-green-950/70">{t("seoRedirectEmpty")}</p>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[42rem] border-collapse text-body">
                <thead>
                  <tr className="border-b border-zain-green-950/15 text-start">
                    <th className="p-3 text-start">{t("seoRedirectEntity")}</th>
                    <th className="p-3 text-start">{t("seoRedirectLocale")}</th>
                    <th className="p-3 text-start">{t("seoRedirectOldSlug")}</th>
                    <th className="p-3 text-start">{t("seoRedirectNewSlug")}</th>
                    <th className="p-3 text-start">{t("seoRedirectActions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {redirects.map((entry) => (
                    <tr key={entry.id} className="border-b border-zain-green-950/10">
                      <td className="p-3">{entry.entityType}</td>
                      <td className="p-3">{entry.locale}</td>
                      <td className="p-3" dir="ltr">
                        {entry.oldSlug}
                      </td>
                      <td className="p-3" dir="ltr">
                        {entry.newSlug}
                      </td>
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => void removeRedirect(entry.id)}
                          disabled={redirectBusy}
                          className="min-h-9 rounded-sm border border-red-700/40 px-3 py-1 text-meta font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          {t("seoRedirectDelete")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
