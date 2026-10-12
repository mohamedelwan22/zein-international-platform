"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  INQUIRY_TYPES,
  inquirySchema,
  type InquiryTypeValue,
} from "@/server/validation/inquiries";

/**
 * Business inquiry form (T058, FR-016, Clarification 2, FR-040).
 *
 * The public form is validated with the same Zod schema the API uses (double
 * validation by design). Issue messages are `validation.*` keys, so field
 * errors render in the active language and every failure focuses the error
 * summary (FR-040). Consent is mandatory; its copy resolves from
 * `Settings.privacy_notice` and, while that content is pending (Open Item 6),
 * a localized "content pending" note shows instead of a placeholder (T060) —
 * the form never blocks and never invents copy.
 */

const TYPE_LABEL_KEY: Record<InquiryTypeValue, string> = {
  product: "typeProduct",
  brand: "typeBrand",
  supplier: "typeSupplier",
  distribution: "typeDistribution",
  partnership: "typePartnership",
  general: "typeGeneral",
};

export interface InquiryFormProps {
  privacyNotice: string | null;
  defaultType?: InquiryTypeValue;
  productId?: string;
  brandId?: string;
  supplierId?: string;
  sourcePath?: string;
}

interface FormValues {
  type: InquiryTypeValue;
  name: string;
  company: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  consent: boolean;
}

const fieldClass =
  "mt-2 min-h-11 w-full rounded-sm border border-zain-green-950/15 bg-white px-3 py-2.5 text-body text-zain-green-950 focus:border-zain-green-700 focus:outline-none focus:ring-2 focus:ring-zain-green-700/30";

export function InquiryForm({
  privacyNotice,
  defaultType = "general",
  productId,
  brandId,
  supplierId,
  sourcePath,
}: InquiryFormProps) {
  const t = useTranslations("inquiry");
  const tv = useTranslations("validation");
  const locale = useLocale();

  const [values, setValues] = useState<FormValues>({
    type: defaultType,
    name: "",
    company: "",
    email: "",
    phone: "",
    subject: "",
    message: "",
    consent: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "submitting" | "success">("idle");
  const summaryRef = useRef<HTMLDivElement>(null);

  const contextLabel = productId
    ? t("contextProduct")
    : brandId
      ? t("contextBrand")
      : supplierId
        ? t("contextSupplier")
        : null;

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((previous) => ({ ...previous, [key]: value }));
  };

  const translateIssue = (key: string) => tv(key as never);

  const focusSummary = () => {
    requestAnimationFrame(() => summaryRef.current?.focus());
  };

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const payload = {
      type: values.type,
      name: values.name,
      company: values.company,
      email: values.email,
      phone: values.phone,
      subject: values.subject,
      message: values.message,
      consentAccepted: values.consent,
      locale,
      productId: productId || undefined,
      brandId: brandId || undefined,
      supplierId: supplierId || undefined,
      sourcePath: sourcePath || undefined,
    };

    const parsed = inquirySchema.safeParse(payload);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".") || "_";
        if (!next[path]) next[path] = translateIssue(issue.message);
      }
      setErrors(next);
      setFormError(t("errorGeneric"));
      focusSummary();
      return;
    }

    setErrors({});
    setPhase("submitting");
    try {
      const response = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      if (response.status === 201) {
        setPhase("success");
        return;
      }

      setPhase("idle");
      const body = (await response.json().catch(() => null)) as {
        error?: { code?: string; details?: { path: string; issue: string }[] };
      } | null;

      const details = body?.error?.details ?? [];
      if (details.length > 0) {
        const next: Record<string, string> = {};
        for (const detail of details) {
          if (!next[detail.path]) next[detail.path] = translateIssue(detail.issue);
        }
        setErrors(next);
      }

      setFormError(
        body?.error?.code === "RATE_LIMITED" ? t("errorRateLimited") : t("errorGeneric"),
      );
      focusSummary();
    } catch {
      setPhase("idle");
      setFormError(t("errorGeneric"));
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

  const errorEntries = Object.entries(errors);

  return (
    <form noValidate onSubmit={onSubmit} aria-busy={phase === "submitting"}>
      {/* Error summary — focus target on failure (FR-040). */}
      <div
        ref={summaryRef}
        tabIndex={-1}
        role={formError ? "alert" : undefined}
        className={formError ? "rounded-sm border border-red-400 bg-red-50 p-4" : ""}
      >
        {formError ? (
          <>
            <p className="text-body font-semibold text-red-800">{formError}</p>
            {errorEntries.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 ps-5 text-body text-red-800">
                {errorEntries.map(([path, message]) => (
                  <li key={path}>{message}</li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </div>

      {contextLabel ? (
        <p className="mt-6 rounded-sm bg-zain-green-950/5 px-4 py-3 text-body font-semibold text-zain-green-900">
          {contextLabel}
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="inquiry-type" className="text-body font-semibold text-zain-green-950">
            {t("typeLabel")}
          </label>
          <select
            id="inquiry-type"
            name="type"
            className={fieldClass}
            value={values.type}
            onChange={(event) => set("type", event.target.value as InquiryTypeValue)}
          >
            {INQUIRY_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(TYPE_LABEL_KEY[type] as never)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="inquiry-name" className="text-body font-semibold text-zain-green-950">
            {t("nameLabel")}
          </label>
          <input
            id="inquiry-name"
            name="name"
            className={fieldClass}
            value={values.name}
            onChange={(event) => set("name", event.target.value)}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "inquiry-name-error" : undefined}
          />
          {errors.name ? (
            <p id="inquiry-name-error" className="mt-1 text-meta text-red-700">
              {errors.name}
            </p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="inquiry-company"
            className="text-body font-semibold text-zain-green-950"
          >
            {t("companyLabel")}
          </label>
          <input
            id="inquiry-company"
            name="company"
            className={fieldClass}
            value={values.company}
            onChange={(event) => set("company", event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="inquiry-email" className="text-body font-semibold text-zain-green-950">
            {t("emailLabel")}
          </label>
          <input
            id="inquiry-email"
            name="email"
            type="email"
            className={fieldClass}
            value={values.email}
            onChange={(event) => set("email", event.target.value)}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "inquiry-email-error" : undefined}
          />
          {errors.email ? (
            <p id="inquiry-email-error" className="mt-1 text-meta text-red-700">
              {errors.email}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="inquiry-phone" className="text-body font-semibold text-zain-green-950">
            {t("phoneLabel")}
          </label>
          <input
            id="inquiry-phone"
            name="phone"
            type="tel"
            className={fieldClass}
            value={values.phone}
            onChange={(event) => set("phone", event.target.value)}
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={errors.phone ? "inquiry-phone-error" : undefined}
          />
          {errors.phone ? (
            <p id="inquiry-phone-error" className="mt-1 text-meta text-red-700">
              {errors.phone}
            </p>
          ) : null}
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor="inquiry-subject"
            className="text-body font-semibold text-zain-green-950"
          >
            {t("subjectLabel")}
          </label>
          <input
            id="inquiry-subject"
            name="subject"
            className={fieldClass}
            value={values.subject}
            onChange={(event) => set("subject", event.target.value)}
            aria-invalid={Boolean(errors.subject)}
            aria-describedby={errors.subject ? "inquiry-subject-error" : undefined}
          />
          {errors.subject ? (
            <p id="inquiry-subject-error" className="mt-1 text-meta text-red-700">
              {errors.subject}
            </p>
          ) : null}
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor="inquiry-message"
            className="text-body font-semibold text-zain-green-950"
          >
            {t("messageLabel")}
          </label>
          <textarea
            id="inquiry-message"
            name="message"
            rows={6}
            className={fieldClass}
            value={values.message}
            onChange={(event) => set("message", event.target.value)}
            aria-invalid={Boolean(errors.message)}
            aria-describedby={errors.message ? "inquiry-message-error" : undefined}
          />
          {errors.message ? (
            <p id="inquiry-message-error" className="mt-1 text-meta text-red-700">
              {errors.message}
            </p>
          ) : null}
        </div>
      </div>

      {/* Consent — mandatory, linked to the Settings privacy notice (FR-016). */}
      <div className="mt-8 rounded-lg border border-zain-green-950/10 bg-zain-cream-50 p-5">
        <div className="flex items-start gap-3">
          <input
            id="inquiry-consent"
            name="consentAccepted"
            type="checkbox"
            checked={values.consent}
            onChange={(event) => set("consent", event.target.checked)}
            aria-invalid={Boolean(errors.consentAccepted)}
            aria-describedby={errors.consentAccepted ? "inquiry-consent-error" : undefined}
            className="mt-1 h-5 w-5 shrink-0"
          />
          <label htmlFor="inquiry-consent" className="text-body text-zain-green-950">
            {t("consentLabel")}
          </label>
        </div>

        {privacyNotice ? (
          <details className="mt-3">
            <summary className="cursor-pointer text-body font-semibold text-zain-green-700">
              {t("consentLink")}
            </summary>
            <p className="prose-editorial mt-3 max-h-64 overflow-y-auto text-body text-zain-green-950/80">
              {privacyNotice}
            </p>
          </details>
        ) : (
          <p className="mt-3 text-meta text-zain-green-950/60">{t("consentPending")}</p>
        )}

        {errors.consentAccepted ? (
          <p id="inquiry-consent-error" className="mt-2 text-meta text-red-700">
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
