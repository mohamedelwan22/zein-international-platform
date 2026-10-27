"use client";

import { useEffect, useId, useRef } from "react";

/**
 * Accessible confirmation dialog for destructive admin actions (US7, T082).
 *
 * A native `<dialog>` gives focus trapping, Escape-to-close and the top-layer
 * backdrop for free. Destructive actions (delete, archive) route through here
 * so an operator cannot discard a record with a single stray click.
 */

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  tone?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  busy = false,
  tone = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      className="w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-zain-green-950/15 bg-white p-6 text-zain-green-950 backdrop:bg-zain-green-950/40"
    >
      <h2 id={titleId} className="text-h3 font-semibold">
        {title}
      </h2>
      <p id={bodyId} className="mt-2 text-body text-zain-charcoal">
        {body}
      </p>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        {cancelLabel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-11 rounded-sm border border-zain-green-950/25 px-5 py-2 text-body font-semibold text-zain-green-950 hover:bg-zain-green-950/5 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={
            tone === "danger"
              ? "min-h-11 rounded-sm bg-red-700 px-5 py-2 text-body font-semibold text-white hover:bg-red-800 disabled:opacity-60"
              : "min-h-11 rounded-sm bg-zain-green-950 px-5 py-2 text-body font-semibold text-zain-cream-50 hover:bg-zain-green-900 disabled:opacity-60"
          }
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
