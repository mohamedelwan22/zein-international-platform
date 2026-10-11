"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { signInAction, type SignInState } from "@/server/auth/actions";

/**
 * T049 [US3] — localized admin sign-in form (FR-003/FR-020).
 *
 * Progressive-enhancement form wired to the `signInAction` server action via
 * `useActionState`: it exposes a pending state ("Signing in…"), announces
 * failures through `role="alert"` (locales via `auth.*` keys), and carries
 * the active `locale` so a successful sign-in redirects to the localized
 * dashboard. No credentials are ever logged (FR-039).
 */

const initialState: SignInState = {};

const inputClass =
  "w-full rounded-md border border-zain-green-800/25 bg-white px-3 py-2 text-body text-zain-charcoal shadow-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zain-gold-500";

export function LoginForm({ locale }: { locale: string }) {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(signInAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="locale" value={locale} />

      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-body font-semibold text-zain-green-950">
          {t("emailLabel")}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          dir="ltr"
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="password" className="text-body font-semibold text-zain-green-950">
          {t("passwordLabel")}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          dir="ltr"
          className={inputClass}
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-body font-medium text-red-700">
          {t(state.error)}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="inline-flex items-center justify-center rounded-md bg-zain-green-800 px-5 py-3 text-body font-semibold text-zain-cream-50 transition-colors hover:bg-zain-green-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zain-gold-500 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? t("signingIn") : t("signInButton")}
      </button>
    </form>
  );
}
