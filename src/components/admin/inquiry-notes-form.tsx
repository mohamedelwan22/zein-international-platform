"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

/**
 * Internal-notes editor (T059, admin-api.md §4). Notes are staff-only and
 * never serialized on any public surface; the write is optimistic-locked and
 * audited like every other lead mutation.
 */

export function InquiryNotesForm({
  id,
  notes,
  version,
}: {
  id: string;
  notes: string | null;
  version: number;
}) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [value, setValue] = useState(notes ?? "");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/inquiries/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: value, version }),
      });
      if (response.ok) {
        setFeedback({ tone: "ok", text: t("notesSaved") });
        router.refresh();
      } else if (response.status === 409) {
        setFeedback({ tone: "error", text: t("versionConflictAction") });
      } else {
        setFeedback({ tone: "error", text: t("leadActionFailed") });
      }
    } catch {
      setFeedback({ tone: "error", text: t("leadActionFailed") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save}>
      <label htmlFor="lead-notes" className="text-body font-semibold text-zain-green-950">
        {t("leadNotesLabel")}
      </label>
      <p className="mt-1 text-meta text-zain-green-950/60">{t("leadNotesHint")}</p>
      <textarea
        id="lead-notes"
        rows={5}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="mt-3 w-full rounded-sm border border-zain-green-950/15 bg-white px-3 py-2.5 text-body text-zain-green-950 focus:border-zain-green-700 focus:outline-none focus:ring-2 focus:ring-zain-green-700/30"
      />
      <div className="mt-3 flex items-center gap-4">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex min-h-11 items-center justify-center rounded-sm bg-zain-green-950 px-6 py-2.5 text-body font-semibold text-zain-cream-50 transition-colors hover:bg-zain-green-900 disabled:opacity-60"
        >
          {t("saveNotes")}
        </button>
        {feedback ? (
          <span
            role="status"
            className={feedback.tone === "ok" ? "text-body text-zain-green-700" : "text-body text-red-700"}
          >
            {feedback.text}
          </span>
        ) : null}
      </div>
    </form>
  );
}
