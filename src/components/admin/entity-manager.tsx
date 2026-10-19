"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { MediaPicker } from "@/components/admin/media-picker";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import {
  entityMeta,
  type ColumnDef,
  type EntityMeta,
  type FieldDef,
} from "@/components/admin/entity-config";
import type { AdminResource } from "@/server/services/admin";

/**
 * Generic admin entity manager (US7, T082).
 *
 * One reusable surface drives all six catalog/directory modules: a paginated,
 * status-filterable `DataTable`; a bilingual create/edit form; lifecycle
 * controls (publish/unpublish/archive/restore, visibility); and a confirm
 * dialog before destructive actions. The server re-enforces every permission
 * and the optimistic `version` lock, so a stale edit surfaces as a localized
 * "changed by someone else" message with a reload action rather than a silent
 * overwrite (admin-api.md §3, US7 edge case "Concurrent edits").
 */

export interface RefOption {
  id: string;
  nameEn: string;
  nameAr: string;
  kind?: string;
  parentId?: string | null;
}

export interface EntityPermissions {
  create: boolean;
  update: boolean;
  delete: boolean;
  publish: boolean;
  archive: boolean;
  visibility: boolean;
}

export interface EntityManagerProps {
  resource: AdminResource;
  locale: string;
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
  q: string;
  status: string;
  permissions: EntityPermissions;
  categories: RefOption[];
  brands: RefOption[];
  suppliers: RefOption[];
}

interface SocialLink {
  platform: string;
  url: string;
}
interface SpecRow {
  key: string;
  value: string;
}
type FormValue = string | boolean | string[] | SocialLink[] | SpecRow[];
type FormState = Record<string, FormValue>;
type Feedback = { tone: "ok" | "error"; text: string; details?: string[] };

const STATUS_KEYS = ["draft", "published", "archived"] as const;

function labelFor(option: RefOption, locale: string): string {
  const primary = locale === "ar" ? option.nameAr : option.nameEn;
  const fallback = locale === "ar" ? option.nameEn : option.nameAr;
  return primary || fallback || option.id;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asBool(value: unknown): boolean {
  return value === true;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function recordToRows(value: unknown): SpecRow[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).map(([key, val]) => ({
    key,
    value: typeof val === "string" ? val : String(val ?? ""),
  }));
}

function rowsToRecord(rows: unknown): Record<string, string> | null {
  if (!Array.isArray(rows)) return null;
  const record: Record<string, string> = {};
  for (const row of rows as SpecRow[]) {
    const key = (row?.key ?? "").trim();
    if (key.length === 0) continue;
    record[key] = (row?.value ?? "").trim();
  }
  return Object.keys(record).length > 0 ? record : null;
}

function defaultForField(field: FieldDef): FormValue {
  if (["categories", "images", "socialLinks", "specifications"].includes(field.kind)) return [];
  if (field.kind === "boolean") return field.default ?? false;
  return "";
}

function emptyForm(meta: EntityMeta): FormState {
  const form: FormState = {};
  for (const field of meta.fields) {
    if (field.localized) {
      form[`${field.name}En`] = defaultForField(field);
      form[`${field.name}Ar`] = defaultForField(field);
    } else {
      form[field.name] = defaultForField(field);
    }
  }
  return form;
}

function detailToForm(meta: EntityMeta, detail: Record<string, unknown>): FormState {
  const form = emptyForm(meta);
  for (const field of meta.fields) {
    if (field.localized) {
      for (const suffix of ["En", "Ar"] as const) {
        const key = `${field.name}${suffix}`;
        const raw = detail[key];
        if (field.kind === "specifications") form[key] = recordToRows(raw);
        else if (field.kind === "boolean") form[key] = asBool(raw);
        else form[key] = raw == null ? "" : String(raw);
      }
      continue;
    }
    const raw = detail[field.name];
    switch (field.kind) {
      case "categories":
        form[field.name] = asArray(detail.categoryIds).map((entry) => String(entry));
        break;
      case "images":
        form[field.name] = asArray(detail.imageIds).map((entry) => String(entry));
        break;
      case "socialLinks":
        form[field.name] = asArray(detail.socialLinks).map((entry) => {
          const link = entry as { platform?: unknown; url?: unknown };
          return { platform: asString(link.platform), url: asString(link.url) };
        });
        break;
      case "specifications":
        form[field.name] = recordToRows(raw);
        break;
      case "boolean":
        form[field.name] = asBool(raw);
        break;
      case "number":
        form[field.name] = raw == null ? "" : String(raw);
        break;
      default:
        form[field.name] = raw == null ? "" : String(raw);
    }
  }
  return form;
}

function buildPayload(meta: EntityMeta, form: FormState): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of meta.fields) {
    const name = field.name;
    if (field.localized) {
      for (const suffix of ["En", "Ar"] as const) {
        const key = `${name}${suffix}`;
        if (field.kind === "specifications") payload[key] = rowsToRecord(form[key]);
        else payload[key] = String(form[key] ?? "").trim() || null;
      }
      continue;
    }
    switch (field.kind) {
      case "categories":
        payload.categoryIds = (form[name] as string[]).filter((id) => id.length > 0);
        break;
      case "images":
        payload.imageIds = (form[name] as string[]).filter((id) => id.length > 0);
        break;
      case "socialLinks": {
        const links = (form[name] as SocialLink[]).filter(
          (link) => link.platform.trim().length > 0 || link.url.trim().length > 0,
        );
        payload.socialLinks = links.length > 0 ? links : null;
        break;
      }
      case "specifications":
        payload[name] = rowsToRecord(form[name]);
        break;
      case "boolean":
        payload[name] = Boolean(form[name]);
        break;
      case "number": {
        const raw = String(form[name] ?? "").trim();
        if (raw.length === 0) {
          if (field.nullable) payload[name] = null;
        } else {
          payload[name] = Number(raw);
        }
        break;
      }
      default:
        payload[name] = String(form[name] ?? "").trim() || null;
    }
  }
  return payload;
}

function validate(meta: EntityMeta, form: FormState, isCreate: boolean): string[] {
  const missing: string[] = [];
  for (const field of meta.fields) {
    if (!field.required) continue;
    if (field.localized) {
      if (!String(form[`${field.name}En`] ?? "").trim()) missing.push(`${field.name}En`);
      if (!String(form[`${field.name}Ar`] ?? "").trim()) missing.push(`${field.name}Ar`);
    } else if (field.kind === "categories") {
      if (isCreate && (form[field.name] as string[]).length === 0) missing.push(field.name);
    } else if (!String(form[field.name] ?? "").trim()) {
      missing.push(field.name);
    }
  }
  return missing;
}

function fieldForPath(meta: EntityMeta, path: string): FieldDef | undefined {
  const base = path.replace(/(En|Ar)$/, "");
  return meta.fields.find((field) => field.name === base);
}

/** Validation-issue keys that exist in the `validation` namespace. */
const KNOWN_ISSUES = new Set([
  "required",
  "invalidType",
  "minLength",
  "maxLength",
  "invalidEmail",
  "invalidSlug",
  "invalidUrl",
  "notFound",
  "maxDepth",
]);

export function EntityManager(props: EntityManagerProps) {
  const { resource, locale, rows, total, page, pageSize, q, status, permissions } = props;
  const meta = entityMeta(resource);
  const t = useTranslations("admin");
  const router = useRouter();

  const [search, setSearch] = useState(q);
  const [statusFilter, setStatusFilter] = useState(status);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Record<string, unknown> | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  function navigate(next: { page?: number; q?: string; status?: string }) {
    const params = new URLSearchParams();
    const nextQ = next.q ?? search;
    const nextStatus = next.status ?? statusFilter;
    const nextPage = next.page ?? 1;
    if (nextQ) params.set("q", nextQ);
    if (nextStatus) params.set("status", nextStatus);
    if (nextPage > 1) params.set("page", String(nextPage));
    const suffix = params.toString();
    router.push(`/admin/${resource}${suffix ? `?${suffix}` : ""}`);
  }

  function applyFilter(event: React.FormEvent) {
    event.preventDefault();
    navigate({ q: search, status: statusFilter, page: 1 });
  }

  async function openEdit(row: Record<string, unknown>) {
    setLoadingDetail(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/${resource}/${String(row.id)}`);
      if (!response.ok) {
        setFeedback({ tone: "error", text: t("entityFailed") });
        return;
      }
      setEditing((await response.json()) as Record<string, unknown>);
      setFormOpen(true);
    } catch {
      setFeedback({ tone: "error", text: t("entityFailed") });
    } finally {
      setLoadingDetail(false);
    }
  }

  async function runAction(id: string, action: string, body: Record<string, unknown>, okText: string) {
    setActionBusyId(id);
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/${resource}/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        setFeedback({ tone: "ok", text: okText });
        router.refresh();
      } else if (response.status === 409) {
        setFeedback({ tone: "error", text: t("entityVersionConflict") });
      } else {
        setFeedback({ tone: "error", text: t("entityFailed") });
      }
    } catch {
      setFeedback({ tone: "error", text: t("entityFailed") });
    } finally {
      setActionBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteBusy(true);
    try {
      const response = await fetch(`/api/admin/${resource}/${String(pendingDelete.id)}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setFeedback({ tone: "ok", text: t("entityDeleted") });
        setPendingDelete(null);
        router.refresh();
      } else if (response.status === 400) {
        setFeedback({ tone: "error", text: t("entityDeleteBlocked") });
        setPendingDelete(null);
      } else {
        setFeedback({ tone: "error", text: t("entityFailed") });
        setPendingDelete(null);
      }
    } catch {
      setFeedback({ tone: "error", text: t("entityFailed") });
      setPendingDelete(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-h2 font-bold text-zain-green-950">{t(resource)}</h1>
        <p className="mt-2 max-w-3xl text-body text-zain-charcoal">{t(`${resource}Intro` as never)}</p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <form onSubmit={applyFilter} className="flex flex-wrap items-end gap-3" role="search">
          <label className="flex flex-col gap-1.5 text-body text-zain-green-950">
            <span className="text-meta font-semibold">{t("entitySearchLabel")}</span>
            <input
              name="q"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("entitySearchPlaceholder")}
              className="min-h-11 min-w-56 rounded-sm border border-zain-green-950/25 bg-white px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-body text-zain-green-950">
            <span className="text-meta font-semibold">{t("entityFilterStatus")}</span>
            <select
              name="status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="min-h-11 rounded-sm border border-zain-green-950/25 bg-white px-3 py-2"
            >
              <option value="">{t("entityFilterAll")}</option>
              {STATUS_KEYS.map((key) => (
                <option key={key} value={key}>
                  {t(`entityStatus${key[0].toUpperCase()}${key.slice(1)}` as never)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="min-h-11 rounded-sm border border-zain-green-950/25 px-5 py-2 text-body font-semibold text-zain-green-950 hover:bg-zain-green-950/5"
          >
            {t("entityApply")}
          </button>
        </form>

        {permissions.create ? (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
              setFeedback(null);
            }}
            className="min-h-11 rounded-sm bg-zain-green-950 px-6 py-2.5 text-body font-semibold text-zain-cream-50 hover:bg-zain-green-900"
          >
            {t("entityCreate")}
          </button>
        ) : null}
      </div>

      {feedback ? (
        <div
          role="status"
          className={
            feedback.tone === "ok"
              ? "rounded-sm border border-zain-green-700/30 bg-zain-green-50 px-4 py-3 text-body text-zain-green-800"
              : "rounded-sm border border-red-700/30 bg-red-50 px-4 py-3 text-body text-red-700"
          }
        >
          <p>{feedback.text}</p>
          {feedback.details && feedback.details.length > 0 ? (
            <ul className="mt-2 list-inside list-disc text-meta">
              {feedback.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          ) : null}
          {feedback.tone === "error" && feedback.text === t("entityVersionConflict") ? (
            <button
              type="button"
              onClick={() => router.refresh()}
              className="mt-2 text-meta font-semibold text-red-700 underline"
            >
              {t("entityReload")}
            </button>
          ) : null}
        </div>
      ) : null}

      {formOpen ? (
        <EntityForm
          meta={meta}
          locale={locale}
          editing={editing}
          references={props}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSaved={(message) => {
            setFormOpen(false);
            setEditing(null);
            setFeedback({ tone: "ok", text: message });
            router.refresh();
          }}
          onError={(message, details) => setFeedback({ tone: "error", text: message, details })}
        />
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zain-green-950/20 bg-white p-10">
          <h2 className="text-h3 font-semibold text-zain-green-950">{t("entityEmptyTitle")}</h2>
          <p className="mt-2 text-body text-zain-charcoal">{t("entityEmptyBody")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zain-green-950/10 bg-white">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-zain-green-950/10 text-meta uppercase tracking-wide text-zain-green-700">
                {meta.columns.map((column) => (
                  <th key={column.key} className="px-4 py-3 text-start">
                    {t(column.labelKey as never)}
                  </th>
                ))}
                <th className="px-4 py-3 text-start">{t("entityTableActions")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const id = String(row.id);
                const busy = actionBusyId === id;
                const rowStatus = asString(row.status) || "draft";
                const isActive = asBool(row.isActive);
                return (
                  <tr key={id} className="border-b border-zain-green-950/5 align-top">
                    {meta.columns.map((column) => (
                      <td key={column.key} className="px-4 py-3 text-body text-zain-charcoal">
                        <Cell column={column} row={row} locale={locale} t={t} />
                      </td>
                    ))}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {permissions.update ? (
                          <button
                            type="button"
                            disabled={loadingDetail}
                            onClick={() => void openEdit(row)}
                            className="min-h-9 rounded-sm border border-zain-green-950/25 px-3 py-1 text-meta font-semibold text-zain-green-950 hover:bg-zain-green-950/5 disabled:opacity-60"
                          >
                            {t("entityEdit")}
                          </button>
                        ) : null}

                        {permissions.publish && rowStatus !== "published" ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void runAction(id, "publish", { version: row.version }, t("entityPublished"))}
                            className="min-h-9 rounded-sm bg-zain-green-950 px-3 py-1 text-meta font-semibold text-zain-cream-50 disabled:opacity-60"
                          >
                            {t("entityPublish")}
                          </button>
                        ) : null}
                        {permissions.publish && rowStatus === "published" ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void runAction(id, "unpublish", { version: row.version }, t("entityUnpublished"))}
                            className="min-h-9 rounded-sm border border-zain-green-950/25 px-3 py-1 text-meta font-semibold text-zain-green-950 hover:bg-zain-green-950/5 disabled:opacity-60"
                          >
                            {t("entityUnpublish")}
                          </button>
                        ) : null}

                        {permissions.visibility ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void runAction(
                                id,
                                "visibility",
                                { isActive: !isActive, version: row.version },
                                isActive ? t("entityHiddenDone") : t("entityShownDone"),
                              )
                            }
                            className="min-h-9 rounded-sm border border-zain-green-950/25 px-3 py-1 text-meta font-semibold text-zain-green-950 hover:bg-zain-green-950/5 disabled:opacity-60"
                          >
                            {isActive ? t("entityHide") : t("entityShow")}
                          </button>
                        ) : null}

                        {permissions.archive && rowStatus !== "archived" ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void runAction(id, "archive", { version: row.version }, t("entityArchived"))}
                            className="min-h-9 rounded-sm border border-zain-green-950/25 px-3 py-1 text-meta font-semibold text-zain-green-950 hover:bg-zain-green-950/5 disabled:opacity-60"
                          >
                            {t("entityArchive")}
                          </button>
                        ) : null}
                        {permissions.archive && rowStatus === "archived" ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void runAction(id, "restore", { version: row.version }, t("entityRestored"))}
                            className="min-h-9 rounded-sm border border-zain-green-950/25 px-3 py-1 text-meta font-semibold text-zain-green-950 hover:bg-zain-green-950/5 disabled:opacity-60"
                          >
                            {t("entityRestore")}
                          </button>
                        ) : null}

                        {permissions.delete ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setPendingDelete(row)}
                            className="min-h-9 rounded-sm border border-red-700/40 px-3 py-1 text-meta font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                          >
                            {t("entityDelete")}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 ? (
        <div className="flex items-center gap-4">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => navigate({ page: page - 1 })}
            className="min-h-9 rounded-sm border border-zain-green-950/25 px-3 py-1 text-meta font-semibold text-zain-green-950 hover:bg-zain-green-950/5 disabled:opacity-40"
          >
            {t("previousPage")}
          </button>
          <span className="text-meta text-zain-charcoal">{t("pageSummary", { page, pages })}</span>
          <button
            type="button"
            disabled={page >= pages}
            onClick={() => navigate({ page: page + 1 })}
            className="min-h-9 rounded-sm border border-zain-green-950/25 px-3 py-1 text-meta font-semibold text-zain-green-950 hover:bg-zain-green-950/5 disabled:opacity-40"
          >
            {t("nextPage")}
          </button>
        </div>
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("entityDeleteConfirmTitle")}
        body={t("entityDeleteConfirmBody")}
        confirmLabel={t("entityDeleteConfirm")}
        cancelLabel={t("entityCancel")}
        busy={deleteBusy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );
}

function Cell({
  column,
  row,
  locale,
  t,
}: {
  column: ColumnDef;
  row: Record<string, unknown>;
  locale: string;
  t: ReturnType<typeof useTranslations<"admin">>;
}) {
  switch (column.kind) {
    case "localized":
      return <>{asString(row[`${column.key}${locale === "ar" ? "Ar" : "En"}`]) || "—"}</>;
    case "status":
      return <>{t(`entityStatus${capitalize(asString(row[column.key]) || "draft")}` as never)}</>;
    case "active":
      return <>{asBool(row[column.key]) ? t("entityActive") : t("entityInactive")}</>;
    case "boolean":
      return <>{asBool(row[column.key]) ? t("entityYes") : t("entityNo")}</>;
    default:
      return <>{asString(row[column.key]) || "—"}</>;
  }
}

function capitalize(value: string): string {
  return value.length > 0 ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

interface EntityFormProps {
  meta: EntityMeta;
  locale: string;
  editing: Record<string, unknown> | null;
  references: EntityManagerProps;
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (message: string, details?: string[]) => void;
}

function EntityForm({ meta, locale, editing, references, onClose, onSaved, onError }: EntityFormProps) {
  const t = useTranslations("admin");
  const tValidation = useTranslations("validation");
  const tErrors = useTranslations("errors");
  const isCreate = editing === null;

  const [tab, setTab] = useState<"en" | "ar">("en");
  const [form, setForm] = useState<FormState>(() =>
    editing ? detailToForm(meta, editing) : emptyForm(meta),
  );
  const [busy, setBusy] = useState(false);

  const categoryOptions = useMemo(() => {
    if (!meta.categoryKind) return [] as RefOption[];
    return references.categories.filter((option) => option.kind === meta.categoryKind);
  }, [meta.categoryKind, references.categories]);

  const parentOptions = useMemo(() => {
    const kind = String(form.kind ?? "brand");
    const selfId = editing ? String(editing.id) : "";
    return references.categories.filter(
      (option) => option.kind === kind && !option.parentId && option.id !== selfId,
    );
  }, [references.categories, form.kind, editing]);

  function set(name: string, value: FormValue) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const missing = validate(meta, form, isCreate);
    if (missing.length > 0) {
      onError(
        tValidation("required"),
        missing.map((path) => {
          const field = fieldForPath(meta, path);
          return field ? t(field.labelKey as never) : path;
        }),
      );
      return;
    }

    const payload = buildPayload(meta, form);
    setBusy(true);
    try {
      const url = isCreate
        ? `/api/admin/${meta.resource}`
        : `/api/admin/${meta.resource}/${String(editing?.id)}`;
      const body = isCreate ? payload : { ...payload, version: editing?.version };
      const response = await fetch(url, {
        method: isCreate ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        onSaved(isCreate ? t("entityCreated") : t("entitySaved"));
        return;
      }
      const parsed = (await response.json().catch(() => null)) as
        | { error?: { code?: string; details?: { path?: string; issue?: string }[] } }
        | null;
      const code = parsed?.error?.code;
      if (code === "SLUG_CONFLICT") {
        onError(tErrors("slugConflict"));
      } else if (code === "VERSION_CONFLICT") {
        onError(t("entityVersionConflict"));
      } else if (code === "VALIDATION_FAILED") {
        const details = (parsed?.error?.details ?? []).map((detail) => {
          const field = detail.path ? fieldForPath(meta, detail.path) : undefined;
          const label = field ? t(field.labelKey as never) : (detail.path ?? "");
          const issue =
            detail.issue && KNOWN_ISSUES.has(detail.issue)
              ? tValidation(detail.issue as never)
              : "";
          return issue ? `${label}: ${issue}` : label;
        });
        onError(t("entityInvalid"), details);
      } else if (code === "FORBIDDEN") {
        onError(tErrors("forbidden"));
      } else {
        onError(t("entityFailed"));
      }
    } catch {
      onError(t("entityFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-5 rounded-lg border border-zain-green-950/15 bg-zain-cream-50/40 p-5 md:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-h3 font-semibold text-zain-green-950">
          {isCreate ? t("entityCreateHeading") : t("entityEditHeading")}
        </h2>
        <div role="tablist" aria-label={t("cmsLocaleLabel")} className="flex gap-2">
          {(["en", "ar"] as const).map((code) => (
            <button
              key={code}
              type="button"
              role="tab"
              aria-selected={tab === code}
              onClick={() => setTab(code)}
              className={
                tab === code
                  ? "min-h-9 rounded-sm bg-zain-green-950 px-4 py-1 text-meta font-semibold text-zain-cream-50"
                  : "min-h-9 rounded-sm border border-zain-green-950/25 px-4 py-1 text-meta font-semibold text-zain-green-950 hover:bg-zain-green-950/5"
              }
            >
              {code === "en" ? t("entityLanguageEnglish") : t("entityLanguageArabic")}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {meta.fields.map((field) =>
          field.localized ? (
            <div key={`${field.name}-${tab}`} className="md:col-span-2">
              <FieldInput
                field={field}
                name={`${field.name}${tab === "en" ? "En" : "Ar"}`}
                value={form[`${field.name}${tab === "en" ? "En" : "Ar"}`]}
                form={form}
                set={set}
                locale={locale}
                references={references}
                categoryOptions={categoryOptions}
                parentOptions={parentOptions}
              />
            </div>
          ) : (
            <div key={field.name} className={spanFor(field) ? "md:col-span-2" : undefined}>
              <FieldInput
                field={field}
                name={field.name}
                value={form[field.name]}
                form={form}
                set={set}
                locale={locale}
                references={references}
                categoryOptions={categoryOptions}
                parentOptions={parentOptions}
              />
            </div>
          ),
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-11 items-center justify-center rounded-sm bg-zain-green-950 px-6 py-2.5 text-body font-semibold text-zain-cream-50 hover:bg-zain-green-900 disabled:opacity-60"
        >
          {busy ? t("entitySaving") : isCreate ? t("entityCreateSubmit") : t("entitySaveSubmit")}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="min-h-11 rounded-sm border border-zain-green-950/25 px-5 py-2 text-body font-semibold text-zain-green-950 hover:bg-zain-green-950/5 disabled:opacity-60"
        >
          {t("entityCancel")}
        </button>
      </div>
    </form>
  );
}

function spanFor(field: FieldDef): boolean {
  return (
    field.localized === true ||
    ["textarea", "categories", "images", "socialLinks", "specifications"].includes(field.kind)
  );
}

interface FieldInputProps {
  field: FieldDef;
  name: string;
  value: FormValue | undefined;
  form: FormState;
  set: (name: string, value: FormValue) => void;
  locale: string;
  references: EntityManagerProps;
  categoryOptions: RefOption[];
  parentOptions: RefOption[];
}

function FieldInput(props: FieldInputProps) {
  const { field, name, value, set, locale, references, categoryOptions, parentOptions } = props;
  const t = useTranslations("admin");
  const label = t(field.labelKey as never);
  const labelSuffix = name.endsWith("Ar") ? ` (${t("entityLanguageArabic")})` : name.endsWith("En") ? ` (${t("entityLanguageEnglish")})` : "";
  const describedLabel = field.localized ? `${label}${labelSuffix}` : label;
  const id = `entity-${name}`;

  if (field.kind === "boolean") {
    // The hint lives OUTSIDE the <label> so clicking it does not toggle the
    // checkbox; it is still wired via `aria-describedby`.
    const hintId = `${id}-hint`;
    const hint = field.hintKey ? t(field.hintKey as never) : null;

    return (
      <div className="flex flex-col gap-1">
        <label className="flex min-h-11 items-center gap-3 text-body text-zain-green-950">
          <input
            id={id}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => set(name, event.target.checked)}
            aria-describedby={hint ? hintId : undefined}
            className="h-5 w-5 rounded-sm border border-zain-green-950/40"
          />
          <span className="text-meta font-semibold">{describedLabel}</span>
        </label>
        {hint ? (
          <p id={hintId} className="max-w-prose ps-8 text-meta text-zain-green-950/60">
            {hint}
          </p>
        ) : null}
      </div>
    );
  }

  if (field.kind === "categories") {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      <fieldset className="flex flex-col gap-2">
        <legend className="text-meta font-semibold text-zain-green-950">{describedLabel}</legend>
        {categoryOptions.length === 0 ? (
          <p className="text-meta text-zain-charcoal">{t("entityNoCategories")}</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {categoryOptions.map((option) => {
              const checked = selected.includes(option.id);
              return (
                <label key={option.id} className="flex items-center gap-2 text-body text-zain-charcoal">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) =>
                      set(
                        name,
                        event.target.checked
                          ? [...selected, option.id]
                          : selected.filter((entry) => entry !== option.id),
                      )
                    }
                  />
                  {labelFor(option, locale)}
                </label>
              );
            })}
          </div>
        )}
      </fieldset>
    );
  }

  if (field.kind === "media") {
    return (
      <MediaPicker
        value={typeof value === "string" && value.length > 0 ? value : null}
        onChange={(mediaId) => set(name, mediaId ?? "")}
        label={describedLabel}
        idPrefix={id}
      />
    );
  }

  if (field.kind === "images") {
    const images = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="flex flex-col gap-3">
        <span className="text-meta font-semibold text-zain-green-950">{describedLabel}</span>
        {images.map((imageId, index) => (
          <div key={`${name}-${index}`} className="flex flex-wrap items-start gap-3">
            <MediaPicker
              value={imageId.length > 0 ? imageId : null}
              onChange={(mediaId) => {
                const next = [...images];
                next[index] = mediaId ?? "";
                set(name, next);
              }}
              label={t("entityImageNumber", { number: index + 1 })}
              idPrefix={`${id}-${index}`}
            />
            <button
              type="button"
              onClick={() => set(name, images.filter((_, i) => i !== index))}
              className="min-h-9 rounded-sm border border-red-700/40 px-3 py-1 text-meta font-semibold text-red-700 hover:bg-red-50"
            >
              {t("entityRemoveRow")}
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => set(name, [...images, ""])}
          className="min-h-9 w-fit rounded-sm border border-zain-green-950/25 px-3 py-1 text-meta font-semibold text-zain-green-950 hover:bg-zain-green-950/5"
        >
          {t("entityAddImage")}
        </button>
      </div>
    );
  }

  if (field.kind === "socialLinks") {
    const links = Array.isArray(value) ? (value as SocialLink[]) : [];
    return (
      <div className="flex flex-col gap-3">
        <span className="text-meta font-semibold text-zain-green-950">{describedLabel}</span>
        {links.map((link, index) => (
          <div key={`${name}-${index}`} className="flex flex-wrap items-center gap-2">
            <input
              value={link.platform}
              placeholder={t("entityPlatform")}
              onChange={(event) => {
                const next = [...links];
                next[index] = { ...next[index], platform: event.target.value };
                set(name, next);
              }}
              className="min-h-11 min-w-40 rounded-sm border border-zain-green-950/25 bg-white px-3 py-2 text-body"
            />
            <input
              value={link.url}
              placeholder={t("entityUrl")}
              onChange={(event) => {
                const next = [...links];
                next[index] = { ...next[index], url: event.target.value };
                set(name, next);
              }}
              className="min-h-11 min-w-56 flex-1 rounded-sm border border-zain-green-950/25 bg-white px-3 py-2 text-body"
            />
            <button
              type="button"
              onClick={() => set(name, links.filter((_, i) => i !== index))}
              className="min-h-9 rounded-sm border border-red-700/40 px-3 py-1 text-meta font-semibold text-red-700 hover:bg-red-50"
            >
              {t("entityRemoveRow")}
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => set(name, [...links, { platform: "", url: "" }])}
          className="min-h-9 w-fit rounded-sm border border-zain-green-950/25 px-3 py-1 text-meta font-semibold text-zain-green-950 hover:bg-zain-green-950/5"
        >
          {t("entityAddRow")}
        </button>
      </div>
    );
  }

  if (field.kind === "specifications") {
    const rows = Array.isArray(value) ? (value as SpecRow[]) : [];
    return (
      <div className="flex flex-col gap-3">
        <span className="text-meta font-semibold text-zain-green-950">{describedLabel}</span>
        {rows.map((row, index) => (
          <div key={`${name}-${index}`} className="flex flex-wrap items-center gap-2">
            <input
              value={row.key}
              placeholder={t("entityKey")}
              onChange={(event) => {
                const next = [...rows];
                next[index] = { ...next[index], key: event.target.value };
                set(name, next);
              }}
              className="min-h-11 min-w-48 rounded-sm border border-zain-green-950/25 bg-white px-3 py-2 text-body"
            />
            <input
              value={row.value}
              placeholder={t("entityValue")}
              onChange={(event) => {
                const next = [...rows];
                next[index] = { ...next[index], value: event.target.value };
                set(name, next);
              }}
              className="min-h-11 min-w-56 flex-1 rounded-sm border border-zain-green-950/25 bg-white px-3 py-2 text-body"
            />
            <button
              type="button"
              onClick={() => set(name, rows.filter((_, i) => i !== index))}
              className="min-h-9 rounded-sm border border-red-700/40 px-3 py-1 text-meta font-semibold text-red-700 hover:bg-red-50"
            >
              {t("entityRemoveRow")}
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => set(name, [...rows, { key: "", value: "" }])}
          className="min-h-9 w-fit rounded-sm border border-zain-green-950/25 px-3 py-1 text-meta font-semibold text-zain-green-950 hover:bg-zain-green-950/5"
        >
          {t("entityAddRow")}
        </button>
      </div>
    );
  }

  if (field.kind === "select") {
    return (
      <label htmlFor={id} className="flex flex-col gap-1.5 text-body text-zain-green-950">
        <span className="text-meta font-semibold">{describedLabel}</span>
        <select
          id={id}
          value={String(value ?? "")}
          onChange={(event) => set(name, event.target.value)}
          className="min-h-11 rounded-sm border border-zain-green-950/25 bg-white px-3 py-2"
        >
          <option value="">—</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {t(`entityKind${capitalize(option)}` as never)}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.kind === "brandRef" || field.kind === "supplierRef") {
    const options = field.kind === "brandRef" ? references.brands : references.suppliers;
    return (
      <label htmlFor={id} className="flex flex-col gap-1.5 text-body text-zain-green-950">
        <span className="text-meta font-semibold">{describedLabel}</span>
        <select
          id={id}
          value={String(value ?? "")}
          onChange={(event) => set(name, event.target.value)}
          className="min-h-11 rounded-sm border border-zain-green-950/25 bg-white px-3 py-2"
        >
          <option value="">—</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {labelFor(option, locale)}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.kind === "parentCategory") {
    return (
      <label htmlFor={id} className="flex flex-col gap-1.5 text-body text-zain-green-950">
        <span className="text-meta font-semibold">{describedLabel}</span>
        <select
          id={id}
          value={String(value ?? "")}
          onChange={(event) => set(name, event.target.value)}
          className="min-h-11 rounded-sm border border-zain-green-950/25 bg-white px-3 py-2"
        >
          <option value="">—</option>
          {parentOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {labelFor(option, locale)}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.kind === "textarea") {
    return (
      <label htmlFor={id} className="flex flex-col gap-1.5 text-body text-zain-green-950">
        <span className="text-meta font-semibold">{describedLabel}</span>
        <textarea
          id={id}
          rows={4}
          maxLength={field.max}
          value={String(value ?? "")}
          onChange={(event) => set(name, event.target.value)}
          className="rounded-sm border border-zain-green-950/25 bg-white px-3 py-2"
        />
      </label>
    );
  }

  const inputType = field.kind === "url" ? "url" : field.kind === "email" ? "email" : field.kind === "number" ? "number" : "text";
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5 text-body text-zain-green-950">
      <span className="text-meta font-semibold">{describedLabel}</span>
      <input
        id={id}
        type={inputType}
        step={field.kind === "number" ? "any" : undefined}
        maxLength={field.kind === "number" ? undefined : field.max}
        dir={field.kind === "number" || field.kind === "url" || field.kind === "email" ? "ltr" : undefined}
        value={String(value ?? "")}
        onChange={(event) => set(name, event.target.value)}
        className="min-h-11 rounded-sm border border-zain-green-950/25 bg-white px-3 py-2"
      />
    </label>
  );
}
