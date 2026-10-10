import type { PublishedCategoryPreview } from "@/server/services/categories";
import type { AboutSection } from "@/server/validation/cms";

/**
 * Catalog preview cards (T034/T035). Pure presentational surfaces for
 * CMS/database-driven data — no business content hardcoded (FR-038).
 */

export function CategoryCard({ category }: { category: PublishedCategoryPreview }) {
  return (
    <article className="flex h-full flex-col rounded-lg border border-zain-green-950/10 bg-white p-8 transition-shadow hover:shadow-lg hover:shadow-zain-green-950/5">
      <h3 className="font-display text-h3 font-medium text-zain-green-950">
        {category.name}
      </h3>
      {category.description ? (
        <p className="mt-4 text-body text-zain-green-950/75">{category.description}</p>
      ) : null}
    </article>
  );
}

export function ValueCard({
  value,
}: {
  value: AboutSection["values"][number];
}) {
  return (
    <article className="flex h-full flex-col rounded-lg border border-zain-green-950/10 bg-white p-8">
      {/* One consistent icon language (DESIGN_SYSTEM §38) — a single
          refined gold leaf mark, shared by all seven values. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        strokeWidth="1.2"
        stroke="currentColor"
        fill="none"
        className="h-8 w-8 text-zain-gold-500"
      >
        <path
          d="M12 21c-4.5-2.6-7.5-6.2-7.5-10.2C4.5 6.4 7.8 3.5 12 3c4.2.5 7.5 3.4 7.5 7.8 0 4-3 7.6-7.5 10.2z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M12 21V9.5c1.8-2 4-2.6 6-2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <h3 className="mt-5 text-h3 font-semibold text-zain-green-950">{value.title}</h3>
      <p className="mt-3 text-body text-zain-green-950/75">{value.description}</p>
    </article>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zain-green-950/20 bg-white/60 p-12 text-center">
      <h3 className="font-display text-h3 font-medium text-zain-green-950">{title}</h3>
      <p className="mx-auto mt-3 max-w-md text-body text-zain-green-950/70">{body}</p>
    </div>
  );
}
