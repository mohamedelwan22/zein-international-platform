"use client";

import { useTranslations } from "next-intl";
import type { CmsSectionKey } from "@/server/validation/cms";
import {
  asArray,
  asRecord,
  asString,
  asStringArray,
  getIn,
  type Draft,
} from "./cms-fields";

/**
 * Draft preview (US6, T072, FR-031): renders the current draft through a
 * public-style surface so staff see what publishing will produce — without
 * ever exposing the draft on an anonymous route (it lives only in this
 * auth-gated admin screen). Text-only typed fields; no raw markup renders.
 */
export function CmsSectionPreview({
  sectionKey,
  locale,
  draft,
}: {
  sectionKey: CmsSectionKey;
  locale: "en" | "ar";
  draft: Draft;
}) {
  const tHome = useTranslations("home");
  const tAbout = useTranslations("about");
  const tContact = useTranslations("contact");

  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <div
      dir={dir}
      className="rounded-lg border border-zain-green-950/10 bg-white p-6 shadow-sm md:p-10"
    >
      {sectionKey === "home" ? (
        <HomePreview draft={draft} tHome={tHome} />
      ) : sectionKey === "about" ? (
        <AboutPreview draft={draft} tAbout={tAbout} />
      ) : (
        <ContactPreview draft={draft} tContact={tContact} />
      )}
    </div>
  );
}

function PreviewHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-8 text-meta font-semibold uppercase tracking-wide text-zain-green-700 first:mt-0">
      {children}
    </h3>
  );
}

function PreviewBody({ value }: { value: string }) {
  if (!value.trim()) return <p className="text-meta text-zain-green-950/40">—</p>;
  return (
    <p className="mt-3 whitespace-pre-wrap text-body text-zain-green-950/85">{value}</p>
  );
}

function HomePreview({
  draft,
  tHome,
}: {
  draft: Draft;
  tHome: ReturnType<typeof useTranslations<"home">>;
}) {
  const statistics = asArray(getIn(draft, ["statistics"]))
    .map(asRecord)
    .filter((item) => item.approved === true);

  return (
    <div>
      <p className="font-display text-h1 font-medium text-zain-green-950">
        {asString(getIn(draft, ["hero", "headline"])) || "—"}
      </p>
      <p className="mt-4 max-w-2xl text-body-lg text-zain-green-950/80">
        {asString(getIn(draft, ["hero", "supporting"]))}
      </p>

      {getIn(draft, ["ctas"]) ? (
        <div className="mt-6 flex flex-wrap gap-3">
          <span className="rounded-sm bg-zain-green-950 px-5 py-2.5 text-body font-semibold text-zain-cream-50">
            {asString(getIn(draft, ["ctas", "primary", "label"])) || "—"}
          </span>
          <span className="rounded-sm border border-zain-green-950/25 px-5 py-2.5 text-body font-semibold text-zain-green-950">
            {asString(getIn(draft, ["ctas", "secondary", "label"])) || "—"}
          </span>
        </div>
      ) : null}

      <PreviewHeading>{tHome("statisticsTitle")}</PreviewHeading>
      {statistics.length ? (
        <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statistics.map((statistic, index) => (
            <li key={index} className="text-center">
              <p className="font-display text-h2 font-medium text-zain-green-800" dir="auto">
                {asString(statistic.value) || "—"}
              </p>
              <p className="mt-1 text-meta text-zain-green-950/70">
                {asString(statistic.label)}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-meta text-zain-green-950/40">—</p>
      )}

      <PreviewHeading>{tHome("aboutPreviewTitle")}</PreviewHeading>
      <PreviewBody value={asString(getIn(draft, ["aboutPreview", "body"]))} />

      {(
        [
          ["missionTitle", "mission"],
          ["visionTitle", "vision"],
          ["sustainabilityTitle", "sustainability"],
          ["innovationTitle", "innovation"],
          ["geographicPresenceTitle", "geographicPresence"],
        ] as const
      ).map(([titleKey, field]) => (
        <div key={field}>
          <PreviewHeading>{tHome(titleKey)}</PreviewHeading>
          <PreviewBody value={asString(getIn(draft, [field, "body"]))} />
        </div>
      ))}

      {getIn(draft, ["finalCta"]) ? (
        <>
          <PreviewHeading>{asString(getIn(draft, ["finalCta", "title"])) || tHome("closingCtaTitle")}</PreviewHeading>
          <div className="mt-3 flex flex-wrap gap-3">
            <span className="rounded-sm bg-zain-green-950 px-5 py-2.5 text-body font-semibold text-zain-cream-50">
              {asString(getIn(draft, ["finalCta", "primary", "label"])) || "—"}
            </span>
            <span className="rounded-sm border border-zain-green-950/25 px-5 py-2.5 text-body font-semibold text-zain-green-950">
              {asString(getIn(draft, ["finalCta", "secondary", "label"])) || "—"}
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}

function AboutPreview({
  draft,
  tAbout,
}: {
  draft: Draft;
  tAbout: ReturnType<typeof useTranslations<"about">>;
}) {
  const paragraphGroups = (
    [
      ["storyTitle", "story"],
      ["historyTitle", "history"],
      ["profileTitle", "profile"],
      ["journeyTitle", "journey"],
    ] as const
  ).map(([titleKey, field]) => ({ titleKey, paragraphs: asStringArray(getIn(draft, [field])) }));

  const values = asArray(getIn(draft, ["values"])).map(asRecord);

  return (
    <div>
      {paragraphGroups.map((group) => (
        <div key={group.titleKey}>
          <PreviewHeading>{tAbout(group.titleKey)}</PreviewHeading>
          {group.paragraphs.length ? (
            <div className="mt-3 space-y-3">
              {group.paragraphs.map((paragraph, index) => (
                <p key={index} className="whitespace-pre-wrap text-body text-zain-green-950/85">
                  {paragraph}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-meta text-zain-green-950/40">—</p>
          )}
        </div>
      ))}

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <div>
          <PreviewHeading>{tAbout("missionTitle")}</PreviewHeading>
          <PreviewBody value={asString(getIn(draft, ["mission", "body"]))} />
        </div>
        <div>
          <PreviewHeading>{tAbout("visionTitle")}</PreviewHeading>
          <PreviewBody value={asString(getIn(draft, ["vision", "body"]))} />
        </div>
      </div>

      <PreviewHeading>{tAbout("valuesTitle")}</PreviewHeading>
      {values.length ? (
        <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {values.map((value, index) => (
            <li key={index} className="rounded-md border border-zain-green-950/10 p-4">
              <p className="text-body font-semibold text-zain-green-950">
                {asString(value.title) || "—"}
              </p>
              <p className="mt-1 text-meta text-zain-green-950/70">
                {asString(value.description)}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-meta text-zain-green-950/40">—</p>
      )}

      <PreviewHeading>{tAbout("sustainabilityTitle")}</PreviewHeading>
      {asStringArray(getIn(draft, ["sustainability", "paragraphs"])).length ? (
        <div className="mt-3 space-y-3">
          {asStringArray(getIn(draft, ["sustainability", "paragraphs"])).map((paragraph, index) => (
            <p key={index} className="whitespace-pre-wrap text-body text-zain-green-950/85">
              {paragraph}
            </p>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-meta text-zain-green-950/40">—</p>
      )}

      <PreviewHeading>{tAbout("innovationTitle")}</PreviewHeading>
      <PreviewBody value={asString(getIn(draft, ["innovation", "body"]))} />
    </div>
  );
}

function ContactPreview({
  draft,
  tContact,
}: {
  draft: Draft;
  tContact: ReturnType<typeof useTranslations<"contact">>;
}) {
  const phones = asStringArray(getIn(draft, ["phone"]));
  const socialLinks = asArray(getIn(draft, ["socialLinks"])).map(asRecord);
  const email = asString(getIn(draft, ["email"]));
  const address = asString(getIn(draft, ["address"]));
  const workingHours = asString(getIn(draft, ["workingHours"]));

  return (
    <div>
      <PreviewHeading>{tContact("phoneLabel")}</PreviewHeading>
      {phones.length ? (
        <ul className="mt-3 space-y-1">
          {phones.map((phone, index) => (
            <li key={index} className="text-body text-zain-green-950/85" dir="ltr">
              {phone}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-meta text-zain-green-950/40">—</p>
      )}

      <PreviewHeading>{tContact("emailLabel")}</PreviewHeading>
      <p className="mt-3 text-body text-zain-green-950/85" dir="ltr">
        {email || "—"}
      </p>

      <PreviewHeading>{tContact("addressLabel")}</PreviewHeading>
      <PreviewBody value={address} />

      <PreviewHeading>{tContact("workingHoursLabel")}</PreviewHeading>
      <PreviewBody value={workingHours} />

      <PreviewHeading>{tContact("websiteLabel")}</PreviewHeading>
      {socialLinks.length ? (
        <ul className="mt-3 space-y-1">
          {socialLinks.map((link, index) => (
            <li key={index} className="text-body text-zain-green-950/85" dir="ltr">
              {asString(link.platform)}: {asString(link.url)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-meta text-zain-green-950/40">—</p>
      )}
    </div>
  );
}
