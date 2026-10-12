"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { LeadStatusValue } from "@/server/validation/inquiries";

/**
 * Staff status controls (T059, admin-api.md §4, SC-012).
 *
 * Only the transitions the service allows are offered; every successful move
 * writes an ActivityLog row server-side. A stale `version` (409) asks the
 * operator to reload rather than silently overwriting another edit.
 */

const TRANSITIONS: Record<LeadStatusValue, readonly LeadStatusValue[]> = {
  new: ["contacted", "inProgress", "closed"],
  contacted: ["inProgress", "closed"],
  inProgress: ["closed"],
  closed: ["contacted"],
};

const STATUS_KEY: Record<LeadStatusValue, string> = {
  new: "statusNew",
  contacted: "statusContacted",
  inProgress: "statusInProgress",
  closed: "statusClosed",
};

export function InquiryStatusControls({
  id,
  status,
  version,
  endpoint = "/api/admin/inquiries",
}: {
  id: string;
  status: LeadStatusValue;
  version: number;
  endpoint?: string;
}) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [pending, setPending] = useState<LeadStatusValue | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const move = async (target: LeadStatusValue) => {
    setPending(target);
    setFeedback(null);
    try {
      const response = await fetch(`${endpoint}/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: target, version }),
      });
      if (response.ok) {
        setFeedback({ tone: "ok", text: t("statusUpdated") });
        router.refresh();
      } else if (response.status === 409) {
        setFeedback({ tone: "error", text: t("versionConflictAction") });
      } else {
        setFeedback({ tone: "error", text: t("leadActionFailed") });
      }
    } catch {
      setFeedback({ tone: "error", text: t("leadActionFailed") });
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-meta font-semibold uppercase tracking-wide text-zain-green-700">
        {t("moveToLabel")}
      </p>
      <div className="flex flex-wrap gap-3">
        {TRANSITIONS[status].map((target) => (
          <button
            key={target}
            type="button"
            onClick={() => move(target)}
            disabled={pending !== null}
            className="inline-flex min-h-11 items-center justify-center rounded-sm border border-zain-green-950/25 px-5 py-2 text-body font-semibold text-zain-green-950 transition-colors hover:border-zain-green-950/50 hover:bg-zain-green-950/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("moveToLabel")}: {t(STATUS_KEY[target] as never)}
          </button>
        ))}
      </div>

      {feedback ? (
        <p
          role="status"
          className={feedback.tone === "ok" ? "text-body text-zain-green-700" : "text-body text-red-700"}
        >
          {feedback.text}
        </p>
      ) : null}
    </div>
  );
}
