import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Limit static-generation/build workers. Default on this machine is
    // os.cpus().length (12), which exhausts memory during page-data
    // collection on a 7.6 GB box. Supported key in Next 16.4.0
    // (see next/dist/build/index.js getNumberOfWorkers).
    cpus: 2,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
