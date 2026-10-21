import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/**
 * Crawler policy (US10, T103). The public site is indexable; the admin area,
 * API and localized login are not. The sitemap URL advertises the localized
 * public pages.
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin", "/login", "/*/admin/", "/*/login"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
