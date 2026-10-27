import Image from "next/image";
import type { HomeSection } from "@/server/validation/cms";
import { FadeIn } from "./fade-in";
import { CtaButton } from "./cta-button";

/**
 * Home hero (T034, FR-006, DESIGN_SYSTEM §3–§5): the approved hero asset as
 * a full-bleed cinematic composition with the documented overlay gradient
 * (§5, verbatim), real HTML for the logo-adjacent eyebrow, editorial
 * headline, supporting statement, and primary/secondary calls to action.
 * The image is decorative atmosphere — empty alt, no text baked in.
 */

export interface HeroCta {
  label: string;
  href: string;
}

export function Hero({
  hero,
  eyebrow,
  primaryCta,
  secondaryCta,
}: {
  hero: HomeSection["hero"];
  eyebrow: string;
  primaryCta: HeroCta;
  secondaryCta: HeroCta;
}) {
  return (
    <section aria-labelledby="hero-heading" className="relative isolate overflow-hidden bg-zain-green-950">
      <div className="absolute inset-0">
        <Image
          src="/hero.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[80%_50%] sm:object-[72%_50%] md:object-[64%_50%]"
        />
        {/* §5 overlay — verbatim values; flipped for RTL so the dark,
            text-safe side stays on the reading-start edge. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(90deg,rgba(6,43,27,0.94),rgba(6,43,27,0.52),rgba(6,43,27,0.04))] rtl:bg-[linear-gradient(270deg,rgba(6,43,27,0.94),rgba(6,43,27,0.52),rgba(6,43,27,0.04))]"
        />
        {/* Stronger overlay on mobile (§33). */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-zain-green-950/95 via-zain-green-950/70 to-zain-green-950/40 md:hidden"
        />
      </div>

      <div className="container-main relative flex min-h-[calc(100svh-4.5rem)] items-center py-14 sm:py-16 lg:py-20">
        <div className="hero-copy">
          <FadeIn>
            <p className="hero-eyebrow text-zain-gold-400">{eyebrow}</p>
          </FadeIn>
          <FadeIn delay={0.1}>
            <h1
              id="hero-heading"
              dir="auto"
              className="hero-title mt-4 text-zain-cream-50 md:mt-5"
            >
              {hero.headline}
            </h1>
          </FadeIn>
          <FadeIn delay={0.2}>
            <p className="hero-body mt-5 text-zain-cream-50/85 md:mt-7" dir="auto">
              {hero.supporting}
            </p>
          </FadeIn>
          <FadeIn delay={0.3}>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4 md:mt-9">
              <CtaButton href={primaryCta.href} className="w-full sm:w-auto">
                {primaryCta.label}
              </CtaButton>
              <CtaButton
                href={secondaryCta.href}
                variant="secondary"
                className="w-full sm:w-auto"
              >
                {secondaryCta.label}
              </CtaButton>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
