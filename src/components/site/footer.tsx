import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Logo } from "./logo";
import type { ContactInfo } from "@/server/services/content";

/**
 * Public footer (T033, DESIGN_SYSTEM §28): dark premium surface with the
 * approved logo, navigation, and approved contact details from Settings
 * (FR-014). Optional elements without approved content (social links,
 * working hours — Open Item 6) are omitted rather than invented. The
 * copyright year is resolved by the (site) layout through a cached helper
 * so prerendered shells stay valid.
 */
export function SiteFooter({ contact, year }: { contact: ContactInfo | null; year: number }) {
  const tNav = useTranslations("nav");
  const tAbout = useTranslations("about");
  const tFooter = useTranslations("footer");
  const tContact = useTranslations("contact");

  const footerLinks = [
    { href: "/about", label: tNav("about") },
    { href: "/sustainability", label: tAbout("sustainabilityTitle") },
    { href: "/values", label: tAbout("valuesTitle") },
    { href: "/innovation", label: tAbout("innovationTitle") },
    { href: "/geographic-presence", label: tNav("geographicPresence") },
    { href: "/contact", label: tNav("contact") },
  ];

  return (
    <footer className="border-t border-white/10 bg-zain-green-950 text-zain-cream-50">
      <div className="container-main grid gap-12 py-16 md:grid-cols-[1.5fr_1fr_1.5fr]">
        <div>
          <Link href="/" className="inline-block">
            <Logo className="h-10 w-auto" />
          </Link>
          {contact ? (
            <p className="prose-editorial mt-6 max-w-md text-body text-zain-cream-50/80">
              {contact.city}, {contact.district}, {contact.address}
            </p>
          ) : null}
        </div>

        <div>
          <h2 className="text-meta font-semibold uppercase tracking-wide text-zain-gold-400">
            {tFooter("navTitle")}
          </h2>
          <nav aria-label={tFooter("navLabel")}>
            <ul className="mt-4 space-y-1">
              {footerLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="inline-flex min-h-11 items-center text-body text-zain-cream-50/85 transition-colors hover:text-zain-lime-400"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/login"
                  className="inline-flex min-h-11 items-center text-body text-zain-cream-50/85 transition-colors hover:text-zain-lime-400"
                >
                  {tNav("adminLogin")}
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div>
          <h2 className="text-meta font-semibold uppercase tracking-wide text-zain-gold-400">
            {tFooter("contactTitle")}
          </h2>
          {contact ? (
            <address className="mt-4 space-y-1 not-italic">
              <p className="text-body text-zain-cream-50/85">
                {contact.country} — {contact.city}, {contact.district}
                <br />
                {contact.address}
              </p>
              <p>
                {contact.phones.map((phone, index) => (
                  <span key={phone}>
                    {index > 0 ? <span aria-hidden="true"> · </span> : null}
                    <a
                      href={`tel:${phone}`}
                      dir="ltr"
                      className="inline-flex min-h-11 items-center text-body text-zain-cream-50/85 transition-colors hover:text-zain-lime-400"
                    >
                      {phone}
                    </a>
                  </span>
                ))}
              </p>
              <p>
                <a
                  href={`mailto:${contact.email}`}
                  className="inline-flex min-h-11 items-center text-body text-zain-cream-50/85 transition-colors hover:text-zain-lime-400"
                >
                  {contact.email}
                </a>
              </p>
              <p>
                <a
                  href={`https://${contact.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center text-body text-zain-cream-50/85 transition-colors hover:text-zain-lime-400"
                >
                  {contact.website}
                </a>
              </p>
            </address>
          ) : (
            <p className="mt-4 text-body text-zain-cream-50/60">{tContact("note")}</p>
          )}
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container-main flex flex-wrap items-center justify-between gap-2 py-6 text-meta text-zain-cream-50/60">
          <p>
            © {year} {tFooter("companyName")}. {tFooter("copyright")}
          </p>
        </div>
      </div>
    </footer>
  );
}
