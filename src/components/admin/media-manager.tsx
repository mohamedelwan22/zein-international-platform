"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useRouter } from "@/i18n/navigation";

/**
 * Admin Media library (US12, T091, admin-api.md §5).
 *
 * Uploads (magic-byte validated server-side), previews, bilingual alt text,
 * and the archive/purge lifecycle. Purge is only offered on archived rows and
 * is refused server-side while any entity still references the row. Every
 * mutation is audited.
 */

export interface MediaRowData {
  id: string;
  kind: "image" | "document";
  mimeType: string;
  byteSize: number;
  originalName: string;
  altEn: string | null;
  altAr: string | null;
  archivedAt: string | null;
  createdAt: string;
  url: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaManager({
  items,
  canUpload,
  canUpdate,
  canArchive,
  canDelete,
}: {
  items: MediaRowData[];
  canUpload: boolean;
  canUpdate: boolean;
  canArchive: boolean;
  canDelete: boolean;
}) {
  const t = useTranslations("admin");
  const router = useRouter();

  return (
    <section className="flex flex-col gap-8">
      {canUpload ? <UploadForm onDone={() => router.refresh()} /> : null}

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zain-green-950/20 bg-white p-10">
          <h2 className="text-h3 font-semibold text-zain-green-950">{t("noMedia")}</h2>
          <p className="mt-2 text-body text-zain-charcoal">{t("noMediaBody")}</p>
        </div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <MediaCard
              key={item.id}
              item={item}
              canUpdate={canUpdate}
              canArchive={canArchive}
              canDelete={canDelete}
              onDone={() => router.refresh()}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function UploadForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations("admin");
  const tErrors = useTranslations("errors");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (!(data.get("file") instanceof File) || (data.get("file") as File).size === 0) {
      setFeedback({ tone: "error", text: tErrors("validation") });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/admin/media", { method: "POST", body: data });
      if (response.ok) {
        setFeedback({ tone: "ok", text: t("mediaUploaded") });
        form.reset();
        onDone();
      } else if (response.status === 415) {
        setFeedback({ tone: "error", text: tErrors("unsupportedMediaType") });
      } else if (response.status === 413) {
        setFeedback({ tone: "error", text: tErrors("payloadTooLarge") });
      } else {
        setFeedback({ tone: "error", text: t("mediaUploadFailed") });
      }
    } catch {
      setFeedback({ tone: "error", text: t("mediaUploadFailed") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-5 rounded-lg border border-zain-green-950/10 bg-zain-cream-50/40 p-5 md:p-6"
    >
      <h2 className="text-h3 font-semibold text-zain-green-950">{t("mediaUploadHeading")}</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5 text-body text-zain-green-950 sm:col-span-3">
          <span className="text-meta font-semibold">{t("mediaUploadFileLabel")}</span>
          <input
            name="file"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/avif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="text-body text-zain-charcoal"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-body text-zain-green-950">
          <span className="text-meta font-semibold">{t("mediaAltEnLabel")}</span>
          <input
            name="altEn"
            dir="ltr"
            className="min-h-11 rounded-sm border border-zain-green-950/25 bg-white px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-body text-zain-green-950">
          <span className="text-meta font-semibold">{t("mediaAltArLabel")}</span>
          <input
            name="altAr"
            dir="rtl"
            className="min-h-11 rounded-sm border border-zain-green-950/25 bg-white px-3 py-2"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-11 items-center justify-center rounded-sm bg-zain-green-950 px-6 py-2.5 text-body font-semibold text-zain-cream-50 hover:bg-zain-green-900 disabled:opacity-60"
        >
          {busy ? t("mediaUploading") : t("mediaUploadSubmit")}
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

function MediaCard({
  item,
  canUpdate,
  canArchive,
  canDelete,
  onDone,
}: {
  item: MediaRowData;
  canUpdate: boolean;
  canArchive: boolean;
  canDelete: boolean;
  onDone: () => void;
}) {
  const t = useTranslations("admin");
  const [altEn, setAltEn] = useState(item.altEn ?? "");
  const [altAr, setAltAr] = useState(item.altAr ?? "");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function run(url: string, method: string, body?: unknown, okText?: string) {
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (response.ok) {
        if (okText) setFeedback({ tone: "ok", text: okText });
        onDone();
      } else if (response.status === 400) {
        setFeedback({ tone: "error", text: t("mediaInUse") });
      } else {
        setFeedback({ tone: "error", text: t("mediaActionFailed") });
      }
    } catch {
      setFeedback({ tone: "error", text: t("mediaActionFailed") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-4 rounded-lg border border-zain-green-950/10 bg-white p-4">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md bg-zain-cream-100">
        {item.kind === "image" && item.archivedAt === null ? (
          <Image
            src={item.url}
            alt={altEn || item.originalName}
            fill
            sizes="(max-width: 640px) 100vw, 33vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center p-4 text-center text-meta text-zain-charcoal">
            {item.originalName}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-body font-semibold text-zain-green-950" dir="ltr">
          {item.originalName}
        </span>
        <span className="text-meta text-zain-charcoal">
          {t(item.kind === "image" ? "mediaKindImage" : "mediaKindDocument")} · {formatBytes(item.byteSize)}
        </span>
        {item.archivedAt ? (
          <span className="text-meta font-semibold text-zain-green-700">{t("mediaArchivedBadge")}</span>
        ) : null}
      </div>

      {canUpdate ? (
        <div className="grid gap-3">
          <label className="flex flex-col gap-1 text-meta text-zain-green-950">
            <span className="font-semibold">{t("mediaAltEnLabel")}</span>
            <input
              value={altEn}
              dir="ltr"
              onChange={(event) => setAltEn(event.target.value)}
              className="min-h-9 rounded-sm border border-zain-green-950/25 bg-white px-2 py-1 text-body"
            />
          </label>
          <label className="flex flex-col gap-1 text-meta text-zain-green-950">
            <span className="font-semibold">{t("mediaAltArLabel")}</span>
            <input
              value={altAr}
              dir="rtl"
              onChange={(event) => setAltAr(event.target.value)}
              className="min-h-9 rounded-sm border border-zain-green-950/25 bg-white px-2 py-1 text-body"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(
                `/api/admin/media/${item.id}`,
                "PUT",
                { altEn, altAr },
                t("mediaAltSaved"),
              )
            }
            className="min-h-9 self-start rounded-sm border border-zain-green-950/25 px-3 py-1 text-meta font-semibold text-zain-green-950 hover:bg-zain-green-950/5 disabled:opacity-60"
          >
            {t("mediaSaveAlt")}
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {canArchive && item.archivedAt === null ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(`/api/admin/media/${item.id}/archive`, "POST", undefined, t("mediaArchiveDone"))}
            className="min-h-9 rounded-sm border border-zain-green-950/25 px-3 py-1 text-meta font-semibold text-zain-green-950 hover:bg-zain-green-950/5 disabled:opacity-60"
          >
            {t("mediaArchive")}
          </button>
        ) : null}
        {canDelete && item.archivedAt !== null ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(`/api/admin/media/${item.id}`, "DELETE", undefined, t("mediaPurged"))}
            className="min-h-9 rounded-sm border border-red-700/40 px-3 py-1 text-meta font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
          >
            {t("mediaPurge")}
          </button>
        ) : null}
      </div>

      {feedback ? (
        <span
          role="status"
          className={feedback.tone === "ok" ? "text-meta text-zain-green-700" : "text-meta text-red-700"}
        >
          {feedback.text}
        </span>
      ) : null}
    </li>
  );
}
