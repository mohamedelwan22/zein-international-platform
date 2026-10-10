import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Locale-aware navigation primitives (T020) — always use these instead of
 * next/link and next/navigation so locale segments are preserved
 * automatically (FR-001: language switch preserves current location).
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
