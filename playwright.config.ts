import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "tests/e2e",
  // Tests run against the dev server (webServer below), which compiles routes
  // on demand. Locally, serialize projects (workers: 1) — concurrent project
  // workers starve the dev server and produce timeout flakes; CI machines
  // run projects in parallel. One worker per project keeps runs stable.
  fullyParallel: false,
  workers: process.env.CI ? 4 : 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "en",
  },
  // The webServer is `pnpm dev` (routes compile on demand); assertions need
  // headroom beyond the 5s default for cold compiles and client-side
  // navigations under concurrent project workers.
  expect: {
    timeout: 15_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "laptop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "tablet", use: { ...devices["Tablet Portrait"], viewport: { width: 768, height: 1024 } } },
    { name: "mobile", use: { ...devices["Mobile Chrome"], viewport: { width: 375, height: 667 } } },
  ],
  webServer: {
    command: "pnpm dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});