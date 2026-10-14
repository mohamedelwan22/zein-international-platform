"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";

/**
 * Shared media picker (US12, T091).
 *
 * Lets any admin form (US7 brand/product/supplier/client/location records)
 * choose an image from the shared library, or upload a new one, then emits the
 * selected `mediaId`. Library access uses `media:read` and upload uses
 * `media:upload` — both granted to every role that edits records.
 */

interface MediaOption {
  id: string;
  originalName: string;
  url: string;
}

export interface MediaPickerProps {
  value: string | null;
  onChange: (mediaId: string | null) => void;
  canUpload?: boolean;
  label?: string;
  idPrefix?: string;
}

export function MediaPicker({
  value,
  onChange,
  canUpload = true,
  label,
  idPrefix,
}: MediaPickerProps) {
  const t = useTranslations("admin");
  const tErrors = useTranslations("errors");
  const generateId = useId();
  const base = idPrefix ?? generateId;

  const [options, setOptions] = useState<MediaOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch("/api/admin/media?kind=image&pageSize=100");
        if (!response.ok) return;
        const body = (await response.json()) as { items?: MediaOption[] };
        if (active) setOptions(body.items ?? []);
      } catch {
        // A failed library fetch leaves the manual select empty; upload still works.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const selected = options.find((option) => option.id === value) ?? null;

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/admin/media", { method: "POST", body: form });
      if (!response.ok) {
        setError(tErrors("unsupportedMediaType"));
        return;
      }
      const created = (await response.json()) as MediaOption;
      setOptions((prev) => [created, ...prev]);
      onChange(created.id);
    } catch {
      setError(tErrors("internal"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={`${base}-select`} className="text-meta font-semibold text-zain-green-950">
        {label ?? t("mediaPickerLabel")}
      </label>

      <div className="flex flex-wrap items-center gap-4">
        {selected ? (
          <span className="relative block h-20 w-20 overflow-hidden rounded-md border border-zain-green-950/10">
            <Image src={selected.url} alt="" fill sizes="80px" className="object-cover" />
          </span>
        ) : null}

        <select
          id={`${base}-select`}
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value || null)}
          className="min-h-11 min-w-56 rounded-sm border border-zain-green-950/25 bg-white px-3 py-2 text-body text-zain-green-950"
        >
          <option value="">{t("mediaPickerNone")}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.originalName}
            </option>
          ))}
        </select>

        {value ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="min-h-11 rounded-sm border border-zain-green-950/25 px-4 py-2 text-body text-zain-green-950 hover:bg-zain-green-950/5"
          >
            {t("mediaPickerClear")}
          </button>
        ) : null}
      </div>

      {canUpload ? (
        <div className="flex flex-wrap items-center gap-3">
          <input
            id={`${base}-file`}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/avif"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = "";
            }}
            className="text-body text-zain-charcoal"
          />
          {busy ? <span className="text-meta text-zain-green-700">{t("mediaUploading")}</span> : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-meta text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
