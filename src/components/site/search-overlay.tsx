"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * Global search overlay (T100, US9, FR-015, SC-006).
 *
 * A single icon trigger in the site header opens a combobox panel under the
 * sticky header. It queries `GET /api/search` (T099) with the active locale
 * and renders the merged, typed result set: each row carries its localized
 * type badge (`search.typeProduct` …) so a visitor can tell a product from a
 * supplier at a glance, and the row itself opens the entity's detail page in
 * the language being browsed.
 *
 * Contract notes honoured here:
 * - the request is debounced and cancelled in flight, so ordinary typing
 *   never floods the 30/min/IP window (a 429 resolves to an inert panel
 *   rather than a false "no results" message);
 * - `q` under the 2-character minimum is a UI-only state (`minLengthHint`)
 *   — the network is not touched, and no error is shown for it;
 * - a completed query with zero matches renders the approved localized empty
 *   state (SC-006), not an error.
 *
 * Accessibility: the ARIA 1.2 combobox pattern — `role="combobox"` on the
 * input, `aria-activedescendant` for the highlighted row, a `role="listbox"`
 * result list, arrow-key navigation, Enter to open, Escape to dismiss, and a
 * polite live region announcing the match count. Focus returns to the trigger
 * on close.
 *
 * RTL (Constitution VI): every spacing/positioning utility is logical
 * (`ps-*`/`pe-*`/`start-*`/`end-*`), so Arabic lays out correctly without
 * mirrored variants; result titles and summaries are `dir="auto"` so a mixed
 * script renders in its own direction.
 */

const DEBOUNCE_MS = 250;

/** Contract minimum for `q` (contracts/public-api.md) — mirrored in the UI. */
const MIN_QUERY_LENGTH = 2;

type FetchPhase = "idle" | "loading" | "ready" | "error";

interface OverlayItem {
  id: string;
  type: "product" | "brand" | "supplier" | "category";
  title: string;
  href: string;
  summary: string | null;
  brandName: string | null;
}

const TYPE_LABEL_KEY = {
  product: "typeProduct",
  brand: "typeBrand",
  supplier: "typeSupplier",
  category: "typeCategory",
} as const;

const TYPE_BADGE_CLASS: Record<OverlayItem["type"], string> = {
  product: "border-zain-gold-400/40 text-zain-gold-400",
  brand: "border-zain-lime-400/40 text-zain-lime-400",
  supplier: "border-zain-cream-50/40 text-zain-cream-50",
  category: "border-zain-cream-50/20 text-zain-cream-100/70",
};

/**
 * The API returns `href` already locale-prefixed. next-intl's `Link` prefixes
 * the active locale itself, so the prefix is stripped before handing the path
 * over — otherwise `/en/products/x` would become `/en/en/products/x`.
 */
function toLocalelessPath(href: string, locale: string): string {
  return href.startsWith(`/${locale}/`) ? href.slice(locale.length + 1) : href;
}

export function SearchOverlay() {
  const t = useTranslations("search");
  const locale = useLocale();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [fetchPhase, setFetchPhase] = useState<FetchPhase>("idle");
  const [items, setItems] = useState<OverlayItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  const listboxId = useId();
  const inputId = useId();
  const panelId = useId();

  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLAnchorElement | HTMLLIElement | null)[]>([]);
  const controllerRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
    controllerRef.current?.abort();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  /**
   * Debounced, cancellable fetch. Every state transition happens inside the
   * timer or a fetch callback — never synchronously in the effect body — so a
   * keystroke yields one render instead of a cascade. Below the 2-character
   * minimum nothing is scheduled and nothing is reset: `status` below is
   * derived from `query`, so the hint state costs no state write and no
   * network call.
   */
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) return;

    debounceRef.current = setTimeout(() => {
      setFetchPhase("loading");
      const controller = new AbortController();
      controllerRef.current = controller;

      fetch(`/api/search?q=${encodeURIComponent(trimmed)}&locale=${locale}&pageSize=8`, {
        signal: controller.signal,
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((body: { items?: OverlayItem[] } | null) => {
          if (controller.signal.aborted) return;
          if (!body) {
            // Rate limited or failed: stay inert rather than claim "no results".
            setFetchPhase("error");
            setItems([]);
            setActiveIndex(-1);
            return;
          }
          setItems(body.items ?? []);
          setActiveIndex(-1);
          setFetchPhase("ready");
        })
        .catch(() => {
          if (!controller.signal.aborted) setFetchPhase("error");
        });
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      controllerRef.current?.abort();
    };
  }, [query, locale]);

  /** `short` and `idle` are pure functions of the input — never stored. */
  const trimmed = query.trim();
  const status: FetchPhase | "short" =
    trimmed.length === 0
      ? "idle"
      : trimmed.length < MIN_QUERY_LENGTH
        ? "short"
        : fetchPhase;

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (query) {
        setQuery("");
        inputRef.current?.focus();
      } else {
        close();
      }
      return;
    }
    if (items.length === 0) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((previous) => {
        const delta = event.key === "ArrowDown" ? 1 : -1;
        const next = (previous + delta + items.length) % items.length;
        optionRefs.current[next]?.scrollIntoView({ block: "nearest" });
        return next;
      });
      return;
    }

    if (event.key === "Enter" && activeIndex >= 0) {
      const item = items[activeIndex];
      if (item?.href) {
        event.preventDefault();
        close();
      }
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(items.length - 1);
    }
  }

  const optionId = (index: number) => `${listboxId}-option-${index}`;
  const showEmpty = status === "ready" && items.length === 0;
  const resultCount = status === "ready" ? items.length : 0;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm text-zain-cream-50 transition-colors hover:text-zain-lime-400"
      >
        <span className="sr-only">{t("button")}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          strokeWidth="1.5"
          stroke="currentColor"
          fill="none"
          className="h-5 w-5"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
        </svg>
      </button>

      {open ? (
        <div className="absolute inset-x-0 top-full border-b border-white/10 bg-zain-green-950/98 backdrop-blur-sm">
          <div id={panelId} role="dialog" aria-modal="false" aria-label={t("button")}>
            <div className="container-main py-4">
              <div className="relative">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  fill="none"
                  className="pointer-events-none absolute inset-y-0 start-3 my-auto h-5 w-5 text-zain-cream-50/60 rtl:inset-y-0 rtl:start-3"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
                </svg>

                <input
                  ref={inputRef}
                  id={inputId}
                  type="search"
                  role="combobox"
                  aria-expanded="true"
                  aria-controls={listboxId}
                  aria-autocomplete="list"
                  aria-activedescendant={
                    activeIndex >= 0 ? optionId(activeIndex) : undefined
                  }
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={t("placeholder")}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={onInputKeyDown}
                  aria-describedby={status === "short" ? `${inputId}-hint` : undefined}
                  className="min-h-12 w-full rounded-sm border border-white/15 bg-white/5 ps-12 pe-12 text-body text-zain-cream-50 placeholder:text-zain-cream-50/50 focus:border-zain-gold-400/60 focus:outline-none focus:ring-2 focus:ring-zain-gold-400/30"
                />

                {query ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      inputRef.current?.focus();
                    }}
                    className="absolute inset-y-0 end-3 my-auto inline-flex h-8 w-8 items-center justify-center rounded-sm text-zain-cream-50/70 hover:text-zain-cream-50"
                  >
                    <span className="sr-only">{t("button")}</span>
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      strokeWidth="1.5"
                      stroke="currentColor"
                      fill="none"
                      className="h-4 w-4"
                    >
                      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                    </svg>
                  </button>
                ) : null}
              </div>

              {/* Polite announcements: the match count once results are ready.
                  The min-length hint is NOT mirrored here — it is linked to the
                  input via `aria-describedby`, so announcing it in the live
                  region too would make a screen reader hear it twice. */}
              <p id={`${inputId}-status`} aria-live="polite" className="sr-only">
                {status === "ready" && resultCount > 0 ? `${resultCount}` : ""}
              </p>

              {status === "short" ? (
                <p
                  id={`${inputId}-hint`}
                  className="mt-3 text-meta text-zain-gold-300"
                >
                  {t("minLengthHint")}
                </p>
              ) : null}

              {showEmpty ? (
                <div className="mt-3 rounded-sm border border-white/10 bg-white/5 px-6 py-10 text-center">
                  <h2 className="font-display text-h3 font-medium text-zain-cream-50">
                    {t("emptyTitle")}
                  </h2>
                  <p className="mt-2 text-body text-zain-cream-100/80">{t("emptyBody")}</p>
                </div>
              ) : null}

              {status === "ready" && items.length > 0 ? (
                <>
                  <p className="mt-3 text-meta text-zain-cream-100/70">
                    {t("resultsFor", { query })}
                  </p>
                  <ul
                    id={listboxId}
                    role="listbox"
                    aria-label={t("resultsFor", { query })}
                    className="mt-2 max-h-[60vh] overflow-y-auto"
                  >
                    {items.map((item, index) => {
                      const badge = t(TYPE_LABEL_KEY[item.type] as never);
                      const inner = (
                        <>
                          <span
                            className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-meta font-medium ${TYPE_BADGE_CLASS[item.type]}`}
                          >
                            {badge}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span
                              dir="auto"
                              className="block truncate text-body font-semibold text-zain-cream-50"
                            >
                              {item.title}
                            </span>
                            {item.summary || item.brandName ? (
                              <span
                                dir="auto"
                                className="mt-0.5 block truncate text-meta text-zain-cream-100/70"
                              >
                                {item.brandName ? `${item.brandName} · ` : ""}
                                {item.summary ?? ""}
                              </span>
                            ) : null}
                          </span>
                        </>
                      );

                      return (
                        <li
                          key={`${item.type}-${item.id}`}
                          id={optionId(index)}
                          role="option"
                          aria-selected={index === activeIndex}
                          onMouseEnter={() => setActiveIndex(index)}
                          className="rounded-sm"
                        >
                          {item.href ? (
                            <Link
                              href={toLocalelessPath(item.href, locale)}
                              tabIndex={-1}
                              ref={(node) => {
                                optionRefs.current[index] = node;
                              }}
                              onClick={close}
                              className={`flex items-center gap-3 px-3 py-2.5 ${
                                index === activeIndex ? "bg-white/10" : "hover:bg-white/5"
                              }`}
                            >
                              {inner}
                            </Link>
                          ) : (
                            <span className="flex cursor-default items-center gap-3 px-3 py-2.5 opacity-70">
                              {inner}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
