"use client";

import { Suspense, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { Logo } from "./logo";
import { LanguageSwitch } from "./language-switch";

/**
 * Public site navigation (T033, FR-040): minimal premium header on the deep
 * green surface, active-state links, one-action language switch, and an
 * accessible disclosure menu on small viewports. Route links stay in scope
 * as routes ship: US1 covers Home/About/Sustainability/Contact.
 */

const NAV_LINKS = [
  { href: "/", namespace: "nav", key: "home" },
  { href: "/about", namespace: "nav", key: "about" },
  { href: "/sustainability", namespace: "about", key: "sustainabilityTitle" },
  { href: "/contact", namespace: "nav", key: "contact" },
] as const;

export function Navbar() {
  const tNav = useTranslations("nav");
  const tAbout = useTranslations("about");
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const label = (namespace: string, key: string) =>
    namespace === "nav" ? tNav(key) : tAbout(key);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-zain-green-950/95 backdrop-blur-sm">
      <nav
        aria-label={tNav("primaryLabel")}
        className="container-main flex items-center justify-between gap-4 py-3"
      >
        <Link href="/" className="shrink-0">
          <Logo className="h-8 w-auto md:h-10" />
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={isActive(link.href) ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-sm px-4 text-body font-medium transition-colors ${
                  isActive(link.href)
                    ? "text-zain-gold-400"
                    : "text-zain-cream-50 hover:text-zain-lime-400"
                }`}
              >
                {label(link.namespace, link.key)}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <Suspense fallback={null}>
            <LanguageSwitch />
          </Suspense>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm text-zain-cream-50 md:hidden"
          >
            <span className="sr-only">{menuOpen ? tNav("closeMenu") : tNav("openMenu")}</span>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
              fill="none"
              className="h-6 w-6"
            >
              {menuOpen ? (
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </nav>

      {menuOpen ? (
        <div id="mobile-nav" className="border-t border-white/10 md:hidden">
          <ul className="container-main flex flex-col py-2">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  aria-current={isActive(link.href) ? "page" : undefined}
                  className={`flex min-h-11 items-center rounded-sm px-2 py-3 text-body font-medium ${
                    isActive(link.href)
                      ? "text-zain-gold-400"
                      : "text-zain-cream-50 hover:text-zain-lime-400"
                  }`}
                >
                  {label(link.namespace, link.key)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </header>
  );
}
