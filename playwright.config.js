import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /rc1.*\.spec\.js/,
  // These legacy assertions assume the old five-tab shell and a Journey that
  // was visible on Today. Focused replacement specs preserve the same safety
  // coverage against the current four-tab IA and contextual reporting flow.
  grepInvert: /(?:patient shell stays stable, restores Report, and carries story theme|Recovery journey hierarchy stays finite across recurring UI syncs)/,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["line"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "npm run dev -- --mode e2e --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
