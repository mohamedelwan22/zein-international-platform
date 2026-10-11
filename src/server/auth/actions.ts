"use server";

import { AuthError } from "next-auth";
import { prisma } from "@/server/db/prisma";
import { signIn, signOut } from "./auth";

/**
 * T048 [US3] — sign-in / sign-out server actions (FR-003, FR-039).
 *
 * The action adapts the localized login form to Auth.js and maps a failed
 * attempt to a stable, locale-agnostic error key (`auth.invalidCredentials`
 * vs `auth.accountLocked`). Messages resolve in the UI from `next-intl`, so
 * the same key serves both locales. A successful sign-in redirects to the
 * localized admin dashboard.
 *
 * Account lockout is read from the durable user row (`lockedUntil`,
 * data-model.md §2.1) so the throttled/"5 / 15 min" case gets its own
 * localized message distinct from bad credentials.
 */

export type SignInErrorKey = "invalidCredentials" | "accountLocked";

export interface SignInState {
  error?: SignInErrorKey;
}

async function isAccountLocked(email: string): Promise<boolean> {
  if (!email) return false;
  const user = await prisma.user.findUnique({
    where: { email },
    select: { lockedUntil: true },
  });
  return !!user?.lockedUntil && user.lockedUntil > new Date();
}

export async function signInAction(
  _prevState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const locale = String(formData.get("locale") ?? "en");
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  try {
    await signIn("credentials", { email, password, redirectTo: `/${locale}/admin` });
    return {};
  } catch (error) {
    // A successful sign-in throws a redirect (re-thrown below); only auth
    // failures are mapped to a localized message.
    if (error instanceof AuthError) {
      return { error: (await isAccountLocked(email)) ? "accountLocked" : "invalidCredentials" };
    }
    throw error;
  }
}

export async function signOutAction(formData: FormData): Promise<void> {
  const locale = String(formData.get("locale") ?? "en");
  await signOut({ redirectTo: `/${locale}/login` });
}
