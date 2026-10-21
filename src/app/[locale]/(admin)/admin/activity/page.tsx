import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isAppLocale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { getSessionUser } from "@/server/auth/authorize";
import { hasPermission } from "@/server/auth/permissions";
import { listActivityLog } from "@/server/services/activity";
import {
  ACTIVITY_ACTIONS,
  activityListQuerySchema,
} from "@/server/validation/activity";

/**
 * Admin activity log (T109, US11, FR-035, SC-012, contracts/admin-api.md §10).
 *
 * Permission `activity:read` (Super Admin + Content Manager) enforced here
 * because the static route shadows the shared `[...section]` guard.
 *
 * The log is APPEND-ONLY (data-model.md §2.15): the page is read-only by
 * construction — there is no create, edit or delete control anywhere on it,
 * and the API exposes `GET` only. The filters (actor, action, entity type and
 * a date range) and the pagination are plain `GET` parameters, so every view
 * of the log is a shareable, bookmarkable URL.
 */

export const instant = false;

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** `YYYY-MM-DD` for a date input. */
function toDateInput(value: Date | undefined): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("activity"), robots: { index: false, follow: false } };
}

export default async function AdminActivityPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const t = await getTranslations("admin");
  const tErrors = await getTranslations("errors");
  const user = await getSessionUser().catch(() => null);

  if (!user || !hasPermission(user.role, "activity:read")) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-h2 font-bold text-zain-green-950">{t("noAccessTitle")}</h1>
        <p role="alert" className="text-body text-red-700">
          {tErrors("forbidden")}
        </p>
      </section>
    );
  }

  const query = await searchParams;
  const parsed = activityListQuerySchema.safeParse({
    actor: firstParam(query.actor),
    action: firstParam(query.action),
    entityType: firstParam(query.entityType),
    from: firstParam(query.from),
    to: firstParam(query.to),
    page: firstParam(query.page),
    pageSize: firstParam(query.pageSize),
  });
  const { actor, action, entityType, from, to, page, pageSize } = parsed.success
    ? parsed.data
    : { actor: undefined, action: undefined, entityType: undefined, from: undefined, to: undefined, page: 1, pageSize: 50 };

  const { items, total, pages, actors } = await listActivityLog({
    actor,
    action,
    entityType,
    from,
    to,
    page,
    pageSize,
  });

  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const selectedActor = actors.find(
    (candidate) => candidate.id === actor || candidate.email === actor,
  );

  const pageHref = (target: number) => {
    const search = new URLSearchParams();
    if (actor) search.set("actor", actor);
    if (action) search.set("action", action);
    if (entityType) search.set("entityType", entityType);
    if (from) search.set("from", from.toISOString());
    if (to) search.set("to", to.toISOString());
    search.set("page", String(target));
    return `/admin/activity?${search.toString()}`;
  };

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-h2 font-bold text-zain-green-950">{t("activity")}</h1>
        <p className="mt-2 max-w-3xl text-body text-zain-charcoal">{t("activityIntro")}</p>
        <p className="mt-2 text-meta text-zain-charcoal">{t("activityReadOnly")}</p>
      </div>

      <form
        method="get"
        action={`/${locale}/admin/activity`}
        className="grid grid-cols-1 gap-4 rounded-lg border border-zain-green-950/10 bg-white p-5 sm:grid-cols-2 lg:grid-cols-5"
      >
        <div className="flex flex-col gap-1.5 text-body text-zain-green-950">
          <label htmlFor="activity-actor" className="text-meta font-semibold">
            {t("activityFilterActor")}
          </label>
          <select
            id="activity-actor"
            name="actor"
            defaultValue={selectedActor?.id ?? ""}
            className="min-h-11 rounded-sm border border-zain-green-950/25 bg-white px-3 py-2"
          >
            <option value="">{t("activityAllActors")}</option>
            {actors.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name} — {option.email}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5 text-body text-zain-green-950">
          <label htmlFor="activity-action" className="text-meta font-semibold">
            {t("activityFilterAction")}
          </label>
          <select
            id="activity-action"
            name="action"
            defaultValue={action ?? ""}
            className="min-h-11 rounded-sm border border-zain-green-950/25 bg-white px-3 py-2"
          >
            <option value="">{t("activityAllActions")}</option>
            {ACTIVITY_ACTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5 text-body text-zain-green-950">
          <label htmlFor="activity-entity-type" className="text-meta font-semibold">
            {t("activityFilterEntityType")}
          </label>
          <input
            id="activity-entity-type"
            name="entityType"
            type="text"
            maxLength={64}
            defaultValue={entityType ?? ""}
            className="min-h-11 rounded-sm border border-zain-green-950/25 bg-white px-3 py-2"
          />
        </div>

        <div className="flex flex-col gap-1.5 text-body text-zain-green-950">
          <label htmlFor="activity-from" className="text-meta font-semibold">
            {t("activityFilterFrom")}
          </label>
          <input
            id="activity-from"
            name="from"
            type="date"
            defaultValue={toDateInput(from)}
            className="min-h-11 rounded-sm border border-zain-green-950/25 bg-white px-3 py-2"
          />
        </div>

        <div className="flex flex-col gap-1.5 text-body text-zain-green-950">
          <label htmlFor="activity-to" className="text-meta font-semibold">
            {t("activityFilterTo")}
          </label>
          <input
            id="activity-to"
            name="to"
            type="date"
            defaultValue={toDateInput(to)}
            className="min-h-11 rounded-sm border border-zain-green-950/25 bg-white px-3 py-2"
          />
        </div>

        <div className="flex items-center gap-4 sm:col-span-2 lg:col-span-5">
          <button
            type="submit"
            className="min-h-11 rounded-sm bg-zain-green-950 px-5 py-2 text-body font-semibold text-zain-cream-50"
          >
            {t("activityApply")}
          </button>
          <Link
            href="/admin/activity"
            className="text-body font-semibold text-zain-green-700 underline-offset-4 hover:underline"
          >
            {t("activityReset")}
          </Link>
        </div>
      </form>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zain-green-950/20 bg-white p-10">
          <h2 className="text-h3 font-semibold text-zain-green-950">{t("activityEmpty")}</h2>
        </div>
      ) : (
        <div
          role="region"
          aria-label={t("activity")}
          tabIndex={0}
          className="overflow-x-auto rounded-lg border border-zain-green-950/10 bg-white"
        >
          <table className="w-full border-collapse text-start">
            <caption className="sr-only">{t("activity")}</caption>
            <thead>
              <tr className="border-b border-zain-green-950/10 text-start text-meta uppercase tracking-wide text-zain-green-700">
                <th scope="col" className="px-4 py-3 text-start">
                  {t("activityTableActor")}
                </th>
                <th scope="col" className="px-4 py-3 text-start">
                  {t("activityTableAction")}
                </th>
                <th scope="col" className="px-4 py-3 text-start">
                  {t("activityTableEntity")}
                </th>
                <th scope="col" className="px-4 py-3 text-start">
                  {t("activityTableSummary")}
                </th>
                <th scope="col" className="px-4 py-3 text-start">
                  {t("activityTableTime")}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => (
                <tr key={entry.id} data-testid="activity-row" className="border-b border-zain-green-950/5">
                  <td className="px-4 py-3 text-body text-zain-green-950">
                    <span className="font-semibold">{entry.actorName}</span>
                    <span className="block text-meta text-zain-charcoal" dir="ltr">
                      {entry.actorEmail}
                    </span>
                  </td>
                  <td
                    data-testid="activity-action"
                    className="px-4 py-3 text-body text-zain-charcoal"
                  >
                    {entry.action}
                  </td>
                  <td className="px-4 py-3 text-body text-zain-charcoal">
                    {entry.entityType}
                    {entry.entityId ? (
                      <span className="block text-meta text-zain-charcoal" dir="ltr">
                        {entry.entityId}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-body text-zain-charcoal">{entry.summary ?? "—"}</td>
                  <td className="px-4 py-3 text-body text-zain-charcoal">
                    <time dateTime={entry.createdAt}>{dateFmt.format(new Date(entry.createdAt))}</time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 ? (
        <nav className="flex items-center gap-4" aria-label={t("pageSummary", { page, pages })}>
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="text-body font-semibold text-zain-green-700">
              {t("previousPage")}
            </Link>
          ) : null}
          <span className="text-body text-zain-charcoal">
            {t("pageSummary", { page, pages })}
          </span>
          {page < pages ? (
            <Link href={pageHref(page + 1)} className="text-body font-semibold text-zain-green-700">
              {t("nextPage")}
            </Link>
          ) : null}
        </nav>
      ) : null}

      <p className="text-meta text-zain-charcoal">{t("activityEntryCount", { count: total })}</p>
    </section>
  );
}
