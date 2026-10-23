import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "tests/e2e",
  // T118: the debug artifact `zz-us5-debug.spec.ts` is a leftover scratch
  // spec with no assertions. It is excluded from every Playwright run (local
  // and CI) so it never reaches the release gate — the file itself is kept
  // untouched on disk (it is intentionally excluded from version control).
  testIgnore: "**/zz-us5-debug.spec.ts",
  // T047: provision the four role accounts (idempotent) before the suite.
  globalSetup: "./tests/e2e/global-setup.ts",
  // Tests run against the dev server (webServer below), which compiles routes
  // on demand. Locally, serialize projects (workers: 1) — concurrent project
  // workers starve the dev server and produce timeout flakes; CI machines
  // run projects in parallel. One worker per project keeps runs stable.
  // On-demand compilation of the admin section (reached via the sign-in
  // redirect) and the multi-route SC-007/FR-010 specs can exceed the previous
  // 30s test budget on a cold server, so allow headroom here.
  timeout: 90_000,
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
  // The webServer is `pnpm dev` (routes compile on demand) locally; in CI the
  // suite runs against the production build (`pnpm build` + `pnpm start`) so
  // the gate exercises the artifact that would actually be deployed
  // (Next.js Playwright guide: "run your tests against the production build").
  // Assertions need headroom beyond the 5s default for cold compiles and
  // client-side navigations under concurrent project workers. The sign-in
  // action's redirect to the admin dashboard in particular waits on that
  // section's first Turbopack compile.
  expect: {
    timeout: 30_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "laptop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "tablet", use: { ...devices["Tablet Portrait"], viewport: { width: 768, height: 1024 } } },
    { name: "mobile", use: { ...devices["Mobile Chrome"], viewport: { width: 375, height: 667 } } },
  ],
  webServer: {
    command: process.env.CI ? "pnpm start" : "pnpm dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});