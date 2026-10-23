"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  PARTNERSHIP_ATTACHMENT_EXTENSIONS,
  PARTNERSHIP_ATTACHMENT_MAX_BYTES,
  partnershipSchema,
} from "@/server/validation/partnerships";

/**
 * Partnership request form (T065, FR-018, FR-040).
 *
 * Same double-validation model as the inquiry form: client validation uses the
 * exact Zod schema the API uses; field errors render in the active language
 * from the `validation.*` namespace and the error summary receives focus
 * (FR-040). The optional attachment is checked by extension + size here and
 * re-checked by magic bytes on the server; when the file is rejected the
 * entered data is preserved for correction (spec edge case "Attachment
 * failures") — the component never clears its state on failure.
 */

const ALLOWED_EXTENSIONS = new Set<string>(PARTNERSHIP_ATTACHMENT_EXTENSIONS);

interface FormValues {
  company: string;
  name: string;
  email: string;
  phone: string;
  country: string;
  businessType: string;
  website: string;
  productCategory: string;
  message: string;
  consent: boolean;
}

const fieldClass =
  "mt-2 min-h-11 w-full rounded-sm border border-zain-green-950/15 bg-white px-3 py-2.5 text-body text-zain-green-950 focus:border-zain-green-700 focus:outline-none focus:ring-2 focus:ring-zain-green-700/30";

export function PartnershipForm({
  privacyNotice,
  sourcePath,
}: {
  privacyNotice: string | null;
  sourcePath?: string;
}) {
  const t = useTranslations("partnership");
  const tInquiry = useTranslations("inquiry");
  const tv = useTranslations("validation");
  const locale = useLocale();

  const [values, setValues] = useState<FormValues>({
    company: "",
    name: "",
    email: "",
    phone: "",
    country: "",
    businessType: "",
    website: "",
    productCategory: "",
    message: "",
    consent: false,
  });
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [fileWarning, setFileWarning] = useState(false);
  const [phase, setPhase] = useState<"idle" | "submitting" | "success">("idle");
  const summaryRef = useRef<HTMLDivElement>(null);

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((previous) => ({ ...previous, [key]: value }));
  };

  const translateIssue = (key: string) => tv(key as never);

  const focusSummary = () => {
    requestAnimationFrame(() => summaryRef.current?.focus());
  };

  function validateFile(candidate: File | null): string | null {
    if (!candidate) return null;
    const extension = candidate.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTENSIONS.has(extension)) return translateIssue("fileUnsupported");
    if (candidate.size > PARTNERSHIP_ATTACHMENT_MAX_BYTES) return translateIssue("fileTooLarge");
    return null;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFileWarning(false);

    const parsed = partnershipSchema.safeParse({
      ...values,
      consentAccepted: values.consent,
      locale,
      sourcePath: sourcePath || undefined,
    });

    const nextErrors: Record<string, string> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".") || "_";
        if (!nextErrors[path]) nextErrors[path] = translateIssue(issue.message);
      }
    }

    const fileError = validateFile(file);
    if (fileError) {
      nextErrors.attachment = fileError;
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setFileWarning(Boolean(fileError));
      setFormError(tInquiry("errorGeneric"));
      focusSummary();
      return;
    }

    if (!parsed.success) return;

    setErrors({});
    setPhase("submitting");
    try {
      const body = new FormData();
      for (const [key, value] of Object.entries(parsed.data)) {
        if (value !== undefined && value !== null) body.set(key, String(value));
      }
      if (file) body.set("attachment", file);

      const response = await fetch("/api/partnerships", { method: "POST", body });

      if (response.status === 201) {
        setPhase("success");
        return;
      }

      setPhase("idle");
      const payload = (await response.json().catch(() => null)) as {
        error?: { code?: string; details?: { path: string; issue: string }[] };
      } | null;
      const code = payload?.error?.code;

      const details = payload?.error?.details ?? [];
      if (details.length > 0) {
        const mapped: Record<string, string> = {};
        for (const detail of details) {
          if (!mapped[detail.path]) mapped[detail.path] = translateIssue(detail.issue);
        }
        setErrors(mapped);
      }

      const isFileError = code === "UNSUPPORTED_MEDIA_TYPE" || code === "PAYLOAD_TOO_LARGE";
      if (isFileError) {
        setFileWarning(true);
        setErrors((previous) => ({
          ...previous,
          attachment:
            code === "PAYLOAD_TOO_LARGE"
              ? translateIssue("fileTooLarge")
              : translateIssue("fileUnsupported"),
        }));
      }

      setFormError(
        code === "RATE_LIMITED"
          ? tInquiry("errorRateLimited")
          : isFileError
            ? tInquiry("errorGeneric")
            : tInquiry("errorGeneric"),
      );
      focusSummary();
    } catch {
      setPhase("idle");
      setFormError(tInquiry("errorGeneric"));
      focusSummary();
    }
  }

  if (phase === "success") {
    return (
      <div
        role="status"
        className="rounded-lg border border-zain-green-950/10 bg-zain-cream-50 p-8"
      >
        <h2 className="font-display text-h3 font-medium text-zain-green-950">
          {t("successTitle")}
        </h2>
        <p className="mt-3 text-body text-zain-green-950/80">{t("successBody")}</p>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={onSubmit} aria-busy={phase === "submitting"}>
      {/* Error summary — focus target on failure (FR-040). */}
      <div
        ref={summaryRef}
        tabIndex={-1}
        role={formError ? "alert" : undefined}
        className="focus:outline-none"
      >
        {formError ? (
          <div className="rounded-sm border border-red-200 bg-red-50/60 p-4">
            <p className="text-body font-semibold text-red-700">{formError}</p>
            {fileWarning ? (
              <p className="mt-2 text-body text-zain-charcoal">{t("dataPreserved")}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <Field id="partnership-company" label={t("companyLabel")} error={errors.company}>
          <input
            id="partnership-company"
            name="company"
            className={fieldClass}
            value={values.company}
            onChange={(event) => set("company", event.target.value)}
            aria-invalid={Boolean(errors.company)}
            aria-describedby={errors.company ? "partnership-company-error" : undefined}
          />
        </Field>

        <Field id="partnership-name" label={t("contactPersonLabel")} error={errors.name}>
          <input
            id="partnership-name"
            name="name"
            className={fieldClass}
            value={values.name}
            onChange={(event) => set("name", event.target.value)}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "partnership-name-error" : undefined}
          />
        </Field>

        <Field id="partnership-email" label={t("emailLabel")} error={errors.email}>
          <input
            id="partnership-email"
            name="email"
            type="email"
            className={fieldClass}
            value={values.email}
            onChange={(event) => set("email", event.target.value)}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "partnership-email-error" : undefined}
          />
        </Field>

        <Field id="partnership-phone" label={t("phoneLabel")} error={errors.phone}>
          <input
            id="partnership-phone"
            name="phone"
            type="tel"
            className={fieldClass}
            value={values.phone}
            onChange={(event) => set("phone", event.target.value)}
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={errors.phone ? "partnership-phone-error" : undefined}
          />
        </Field>

        <Field id="partnership-country" label={t("countryLabel")} error={errors.country}>
          <input
            id="partnership-country"
            name="country"
            className={fieldClass}
            value={values.country}
            onChange={(event) => set("country", event.target.value)}
          />
        </Field>

        <Field id="partnership-business-type" label={t("businessTypeLabel")} error={errors.businessType}>
          <input
            id="partnership-businessType"
            name="businessType"
            className={fieldClass}
            value={values.businessType}
            onChange={(event) => set("businessType", event.target.value)}
          />
        </Field>

        <Field id="partnership-website" label={t("websiteLabel")} error={errors.website}>
          <input
            id="partnership-website"
            name="website"
            type="url"
            dir="ltr"
            className={fieldClass}
            value={values.website}
            onChange={(event) => set("website", event.target.value)}
          />
        </Field>

        <Field
          id="partnership-product-category"
          label={t("productCategoryLabel")}
          error={errors.productCategory}
        >
          <input
            id="partnership-product-category"
            name="productCategory"
            className={fieldClass}
            value={values.productCategory}
            onChange={(event) => set("productCategory", event.target.value)}
          />
        </Field>

        <div className="sm:col-span-2">
          <label
            htmlFor="partnership-message"
            className="text-body font-semibold text-zain-green-950"
          >
            {t("messageLabel")}
          </label>
          <textarea
            id="partnership-message"
            name="message"
            rows={6}
            className={fieldClass}
            value={values.message}
            onChange={(event) => set("message", event.target.value)}
            aria-invalid={Boolean(errors.message)}
            aria-describedby={errors.message ? "partnership-message-error" : undefined}
          />
          {errors.message ? (
            <p id="partnership-message-error" className="mt-1 text-meta text-red-700">
              {errors.message}
            </p>
          ) : null}
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor="partnership-attachment"
            className="text-body font-semibold text-zain-green-950"
          >
            {t("attachmentLabel")}
          </label>
          <p className="mt-1 text-meta text-zain-green-950/60">{t("attachmentHint")}</p>
          <input
            id="partnership-attachment"
            name="attachment"
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            aria-invalid={Boolean(errors.attachment)}
            aria-describedby={errors.attachment ? "partnership-attachment-error" : undefined}
            className="mt-3 block w-full text-body text-zain-green-950 file:me-3 file:min-h-11 file:cursor-pointer file:rounded-sm file:border file:border-zain-green-950/20 file:bg-white file:px-4 file:text-body file:font-semibold file:text-zain-green-950"
          />
          {errors.attachment ? (
            <p id="partnership-attachment-error" className="mt-1 text-meta text-red-700">
              {errors.attachment}
            </p>
          ) : null}
        </div>
      </div>

      {/* Consent — mandatory, linked to the Settings privacy notice (FR-018). */}
      <div className="mt-8 rounded-lg border border-zain-green-950/10 bg-zain-cream-50 p-5">
        <div className="flex items-start gap-3">
          <input
            id="partnership-consent"
            name="consentAccepted"
            type="checkbox"
            checked={values.consent}
            onChange={(event) => set("consent", event.target.checked)}
            aria-invalid={Boolean(errors.consentAccepted)}
            aria-describedby={errors.consentAccepted ? "partnership-consent-error" : undefined}
            className="mt-1 h-5 w-5 shrink-0"
          />
          <label htmlFor="partnership-consent" className="text-body text-zain-green-950">
            {t("consentLabel")}
          </label>
        </div>

        {privacyNotice ? (
          <details className="mt-3">
            <summary className="cursor-pointer text-body font-semibold text-zain-green-700">
              {tInquiry("consentLink")}
            </summary>
            <p className="prose-editorial mt-3 max-h-64 overflow-y-auto text-body text-zain-green-950/80">
              {privacyNotice}
            </p>
          </details>
        ) : (
          <p className="mt-3 text-meta text-zain-green-950/70">{tInquiry("consentPending")}</p>
        )}

        {errors.consentAccepted ? (
          <p id="partnership-consent-error" className="mt-2 text-meta text-red-700">
            {errors.consentAccepted}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={phase === "submitting"}
        className="mt-8 inline-flex min-h-11 items-center justify-center rounded-sm bg-zain-green-950 px-8 py-3 text-body font-semibold text-zain-cream-50 transition-colors hover:bg-zain-green-900 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {phase === "submitting" ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-body font-semibold text-zain-green-950">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-meta text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
