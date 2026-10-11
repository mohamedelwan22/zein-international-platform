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
 * as routes ship: US1 covers Home/About/Sustainability/Contact; US2 adds
 * Brands and Products (T042/T043).
 *
 * Cache Components (T042): the active link depends on `usePathname()`. On a
 * route whose pathname is known at prerender (every `[locale]`-static page)
 * the hook resolves statically; on a route with an unknown dynamic param
 * (e.g. `/brands/[slug]`) it suspends while the shell is generated. The read
 * is therefore pushed down to the smallest leaf (`ActiveNavLinks`) and wrapped
 * in `<Suspense>`, so the header, logo, and links prerender into the static
 * shell and only the active highlight streams in.
 */

const NAV_LINKS = [
  { href: "/", namespace: "nav", key: "home" },
  { href: "/about", namespace: "nav", key: "about" },
  { href: "/brands", namespace: "nav", key: "brands" },
  { href: "/products", namespace: "nav", key: "products" },
  { href: "/sustainability", namespace: "about", key: "sustainabilityTitle" },
  { href: "/contact", namespace: "nav", key: "contact" },
] as const;

type ListVariant = "desktop" | "mobile";

const LIST_CLASS: Record<ListVariant, string> = {
  // Compact spacing at the tablet range (md), comfortable at desktop (lg).
  // FR-041/SC-008: the six primary links must fit the 768px tablet viewport
  // where US1 keeps the desktop nav visible, so the row tightens below lg.
  desktop: "hidden items-center gap-0.5 md:flex lg:gap-1",
  mobile: "container-main flex flex-col py-2",
};

function navLinkClass(active: boolean, variant: ListVariant): string {
  const base =
    variant === "desktop"
      ? "inline-flex min-h-11 items-center rounded-sm px-2 text-meta font-medium transition-colors lg:px-4 lg:text-body"
      : "flex min-h-11 items-center rounded-sm px-2 py-3 text-body font-medium";
  const state = active
    ? "text-zain-gold-400"
    : "text-zain-cream-50 hover:text-zain-lime-400";
  return `${base} ${state}`;
}

/**
 * Presentational nav list. Takes `pathname` as a plain value (null while the
 * value is unresolved) so it can be rendered both as the suspended leaf's
 * output and as its static fallback without reading the route itself.
 */
function NavLinks({
  pathname,
  variant,
  onNavigate,
}: {
  pathname: string | null;
  variant: ListVariant;
  onNavigate?: () => void;
}) {
  const tNav = useTranslations("nav");
  const tAbout = useTranslations("about");

  const label = (namespace: string, key: string) =>
    namespace === "nav" ? tNav(key) : tAbout(key);

  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/"
      : pathname !== null && pathname.startsWith(href);

  return (
    <ul className={LIST_CLASS[variant]}>
      {NAV_LINKS.map((link) => {
        const active = isActive(link.href);
        return (
          <li key={link.href}>
            <Link
              href={link.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={navLinkClass(active, variant)}
            >
              {label(link.namespace, link.key)}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** The dynamic leaf: reads the route, leaving everything else prerendered. */
function ActiveNavLinks({
  variant,
  onNavigate,
}: {
  variant: ListVariant;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return <NavLinks pathname={pathname} variant={variant} onNavigate={onNavigate} />;
}

export function Navbar() {
  const tNav = useTranslations("nav");
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-zain-green-950/95 backdrop-blur-sm">
      <nav
        aria-label={tNav("primaryLabel")}
        className="container-main flex items-center justify-between gap-2 py-3 lg:gap-4"
      >
        <Link href="/" className="shrink-0">
          <Logo className="h-8 w-auto lg:h-10" />
        </Link>

        <Suspense fallback={<NavLinks pathname={null} variant="desktop" />}>
          <ActiveNavLinks variant="desktop" />
        </Suspense>

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
          <Suspense
            fallback={
              <NavLinks
                pathname={null}
                variant="mobile"
                onNavigate={() => setMenuOpen(false)}
              />
            }
          >
            <ActiveNavLinks
              variant="mobile"
              onNavigate={() => setMenuOpen(false)}
            />
          </Suspense>
        </div>
      ) : null}
    </header>
  );
}
