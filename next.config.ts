import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { buildContentSecurityPolicy } from "./src/lib/content-security-policy";

const withNextIntl = createNextIntlPlugin();

/**
 * Security headers (T110 — plan.md Security Strategy).
 *
 * CSP is enforced on every response. The app is statically cached (Cache
 * Components + `"use cache"`), so a nonce-based `script-src` is deliberately
 * not used: nonces require dynamic rendering for every page and would defeat
 * the caching strategy in plan.md. `'unsafe-inline'` is therefore still
 * required for Next's inline bootstrap scripts and for Leaflet/next-image
 * style attributes; the policy still blocks external script origins, plugin
 * content, being framed (`frame-ancestors`), `<base>` injection and
 * cross-origin form posts. `frame-src` narrowly allows the Google Maps embed
 * origins used by location cards.
 * The stricter nonce/SRI upgrade path is tracked in
 * `docs/ops/security-headers.md`.
 */
const isProduction = process.env.NODE_ENV === "production";

const contentSecurityPolicy = buildContentSecurityPolicy(isProduction);

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  // HSTS is only meaningful (and only safe) over HTTPS; sending it in local
  // HTTP development would pin the browser's localhost hostname.
  ...(isProduction
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // T117: the production image runs `.next/standalone/server.js`.
  output: "standalone",
  experimental: {
    // Limit static-generation/build workers. Default on this machine is
    // os.cpus().length (12), which exhausts memory during page-data
    // collection on a 7.6 GB box. Supported key in Next 16.4.0
    // (see next/dist/build/index.js getNumberOfWorkers).
    cpus: 1,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        // Every response, including API routes and the app-proxied media.
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // Defence in depth for the admin tree (plan.md: frame-ancestors
        // 'none' for admin). The global CSP already sets it; this also
        // applies to any response that bypasses the CSP header (e.g. an
        // error page served by the platform proxy).
        source: "/:locale/admin/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        source: "/admin/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
