"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * T052 [US3] — session-expiry UX (spec edge case "Session expiry mid-edit").
 *
 * A client-side interceptor: authenticated data clients dispatch the
 * `auth:session-expired` window event when a request comes back 401 (stale
 * token / expired session). The guard then shows a localized, blocking
 * prompt that routes back to sign-in. It never submits, publishes, or
 * discards anything — an unsaved draft stays in the editor untouched, so
 * content can only be published deliberately after re-authentication
 * (FR-039, US3.4).
 */
export const SESSION_EXPIRED_EVENT = "auth:session-expired";

export function SessionGuard() {
  const t = useTranslations("auth");
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const onExpired = () => setExpired(true);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  if (!expired) {
    return null;
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-expired-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-zain-black/60 p-4"
    >
      <div className="w-full max-w-md rounded-xl bg-zain-cream-50 p-6 shadow-xl">
        <h2 id="session-expired-title" className="text-h3 font-bold text-zain-green-950">
          {t("sessionExpiredTitle")}
        </h2>
        <p className="mt-3 text-body text-zain-charcoal">{t("sessionExpiredBody")}</p>
        <Link
          href="/login"
          className="mt-5 inline-flex items-center justify-center rounded-md bg-zain-green-800 px-5 py-3 text-body font-semibold text-zain-cream-50 transition-colors hover:bg-zain-green-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zain-gold-500"
        >
          {t("reSignIn")}
        </Link>
      </div>
    </div>
  );
}
