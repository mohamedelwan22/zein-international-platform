import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getSessionUser } from "@/server/auth/authorize";
import { hasPermission } from "@/server/auth/permissions";
import { getDashboardOverview } from "@/server/services/dashboard";

/**
 * Admin dashboard (T108, US11, FR-023, contracts/admin-api.md §2).
 *
 * The landing page of the admin area: a count per module, a link into every
 * module the signed-in role may read, and the most recent recorded activity.
 *
 * Everything on this page is permission-scoped (FR-022): the counts and the
 * entry points follow the permission matrix, and the recent activity is only
 * shown to a role that holds `activity:read` — the log itself is restricted to
 * the Super Admin and the Content Manager.
 */

export const instant = false;

/** The counted modules — the admin section, the count bucket and the label. */
const COUNT_CARDS = [
  { section: "brands", count: "brands", label: "brands", metric: "published" },
  { section: "products", count: "products", label: "products", metric: "published" },
  { section: "categories", count: "categories", label: "categories", metric: "published" },
  { section: "suppliers", count: "suppliers", label: "suppliers", metric: "published" },
  { section: "clients", count: "clients", label: "clients", metric: "published" },
  { section: "locations", count: "locations", label: "locations", metric: "published" },
  { section: "cms", count: "content", label: "dashboardContentSections", metric: "published" },
  { section: "media", count: "media", label: "media", metric: "archived" },
  { section: "inquiries", count: "inquiries", label: "inquiries", metric: "new" },
  { section: "partnerships", count: "partnerships", label: "partnerships", metric: "new" },
] as const;

const METRIC_LABEL = {
  published: "dashboardCountPublished",
  new: "dashboardCountNew",
  archived: "dashboardCountArchived",
} as const;

interface CountBucket {
  total: number;
  published?: number;
  new?: number;
  archived?: number;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "admin" });
  return { title: t("dashboard"), robots: { index: false, follow: false } };
}

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("admin");
  const tErrors = await getTranslations("errors");
  const user = await getSessionUser().catch(() => null);

  if (!user || !hasPermission(user.role, "dashboard:read")) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-h2 font-bold text-zain-green-950">{t("noAccessTitle")}</h1>
        <p role="alert" className="text-body text-red-700">
          {tErrors("forbidden")}
        </p>
      </section>
    );
  }

  const { counts, entryPoints, recentActivity } = await getDashboardOverview(user.role);
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  const cards = entryPoints.flatMap((entry) => {
    const card = COUNT_CARDS.find((candidate) => candidate.section === entry.key);
    if (!card) {
      return [];
    }
    const bucket: CountBucket | undefined = counts[card.count];
    if (!bucket) {
      return [];
    }
    return [{ ...card, href: entry.href, bucket }];
  });

  const activityEntry = entryPoints.find((entry) => entry.key === "activity");

  return (
    <section className="flex flex-col gap-8">
      <div>
        <h1 className="text-h2 font-bold text-zain-green-950">{t("dashboard")}</h1>
        <p className="mt-2 max-w-3xl text-body text-zain-charcoal">{t("dashboardIntro")}</p>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="text-h3 font-semibold text-zain-green-950">{t("dashboardCountsHeading")}</h2>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {cards.map((card) => (
            <li
              key={card.count}
              data-testid={`dashboard-count-${card.count}`}
              className="rounded-lg border border-zain-green-950/10 bg-white p-5"
            >
              <Link
                href={card.href}
                className="text-body font-semibold text-zain-green-950 underline-offset-4 hover:underline"
              >
                {t(card.label as never)}
              </Link>
              <p className="mt-2 text-h3 font-bold text-zain-green-950">{card.bucket.total}</p>
              <p className="mt-1 text-meta text-zain-charcoal">
                {t(METRIC_LABEL[card.metric] as never)}:{" "}
                {card.metric === "published"
                  ? (card.bucket.published ?? 0)
                  : card.metric === "new"
                    ? (card.bucket.new ?? 0)
                    : (card.bucket.archived ?? 0)}
              </p>
            </li>
          ))}
        </ul>
      </div>

      {activityEntry ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-h3 font-semibold text-zain-green-950">
              {t("dashboardRecentActivityHeading")}
            </h2>
            <Link
              href={activityEntry.href}
              className="text-body font-semibold text-zain-green-700 underline-offset-4 hover:underline"
            >
              {t("activity")}
            </Link>
          </div>

          {recentActivity.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zain-green-950/20 bg-white p-8 text-body text-zain-charcoal">
              {t("dashboardEmptyActivity")}
            </p>
          ) : (
            <ul className="divide-y divide-zain-green-950/10 rounded-lg border border-zain-green-950/10 bg-white">
              {recentActivity.map((entry) => (
                <li
                  key={entry.id}
                  data-testid="dashboard-activity-item"
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3"
                >
                  <span className="text-body font-semibold text-zain-green-950">
                    {entry.actorName}
                  </span>
                  <span className="text-meta text-zain-green-700">{entry.action}</span>
                  <span className="text-meta text-zain-charcoal">{entry.entityType}</span>
                  <time
                    dateTime={entry.createdAt}
                    className="ms-auto text-meta text-zain-charcoal"
                  >
                    {dateFmt.format(new Date(entry.createdAt))}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
