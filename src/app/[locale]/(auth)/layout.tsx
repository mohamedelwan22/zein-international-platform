import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { isAppLocale } from "@/i18n/routing";
import { Logo } from "@/components/site/logo";

/**
 * Authentication shell (T049) — a focused, centered surface outside the
 * public site chrome. Renders the approved logo on the brand green so the
 * sign-in page stays within the visual identity without exposing navigation.
 */
export default async function AuthLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-zain-green-950 px-4 py-12">
      <Logo className="h-10 w-auto" priority />
      <div id="main-content" className="w-full max-w-md">
        {children}
      </div>
    </div>
  );
}
