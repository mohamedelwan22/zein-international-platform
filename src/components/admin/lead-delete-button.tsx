"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";

/**
 * Delete button for closed leads (inquiries / partnership requests).
 *
 * Only renders when the lead is closed — the service enforces the same guard
 * server-side, so hiding the button for open leads is a UX convenience, not
 * a security measure. Uses the shared `ConfirmDialog` for destructive-action
 * confirmation (T082).
 */

export function LeadDeleteButton({
  id,
  status,
  endpoint = "/api/admin/inquiries",
  redirectTo = "/admin/inquiries",
  variant = "default",
}: {
  id: string;
  status: string;
  endpoint?: string;
  redirectTo?: string;
  variant?: "default" | "row";
}) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  if (status !== "closed") {
    return null;
  }

  const handleDelete = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(`${endpoint}/${id}`, { method: "DELETE" });
      if (response.ok) {
        setFeedback({ tone: "ok", text: t("leadDeleted") });
        setConfirming(false);
        if (variant === "row") {
          router.refresh();
        } else {
          setTimeout(() => router.push(redirectTo), 600);
        }
      } else if (response.status === 400) {
        const body = (await response.json().catch(() => null)) as { details?: Array<{ issue?: string }> } | null;
        const issue = body?.details?.[0]?.issue;
        setFeedback({
          tone: "error",
          text: issue === "notClosed" ? t("leadDeleteNotClosed") : t("leadActionFailed"),
        });
        setConfirming(false);
      } else {
        setFeedback({ tone: "error", text: t("leadActionFailed") });
        setConfirming(false);
      }
    } catch {
      setFeedback({ tone: "error", text: t("leadActionFailed") });
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  const isRow = variant === "row";

  return (
    <>
      <div className={isRow ? "inline-flex items-center gap-2" : "flex flex-col gap-3 border-t border-zain-green-950/10 pt-6"}>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={
            isRow
              ? "text-body font-semibold text-red-700 underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              : "inline-flex min-h-11 w-fit items-center justify-center rounded-sm border border-red-700/25 px-5 py-2 text-body font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          }
        >
          {t("leadDelete")}
        </button>

        {feedback ? (
          <p
            role="status"
            className={
              feedback.tone === "ok"
                ? isRow ? "text-meta text-zain-green-700" : "text-body text-zain-green-700"
                : isRow ? "text-meta text-red-700" : "text-body text-red-700"
            }
          >
            {feedback.text}
          </p>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirming}
        title={t("leadDeleteConfirmTitle")}
        body={t("leadDeleteConfirmBody")}
        confirmLabel={t("leadDeleteConfirm")}
        cancelLabel={t("entityCancel")}
        busy={busy}
        tone="danger"
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
