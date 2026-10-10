import { CtaButton, type CtaLink } from "./cta-button";

/**
 * Closing call-to-action panel (T034, DESIGN_SYSTEM §26): deep green with a
 * restrained gold detail, used at the end of public journeys to route
 * visitors to Contact and Partnership.
 */
export function CtaSection({
  title,
  primary,
  secondary,
}: {
  title: string;
  primary: CtaLink;
  secondary?: CtaLink;
}) {
  return (
    <section className="bg-zain-green-950">
      <div className="container-main py-20 md:py-28">
        <div className="relative overflow-hidden rounded-xl bg-zain-green-900 px-8 py-16 text-center md:px-16 md:py-20">
          {/* Gold detail — a thin inlaid rule (§26). */}
          <span
            aria-hidden="true"
            className="absolute inset-x-12 top-0 h-px bg-zain-gold-500/60"
          />
          <h2 className="mx-auto max-w-2xl font-display text-h1 font-medium text-zain-cream-50">
            {title}
          </h2>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <CtaButton href={primary.href}>{primary.label}</CtaButton>
            {secondary ? (
              <CtaButton href={secondary.href} variant="secondary">
                {secondary.label}
              </CtaButton>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
