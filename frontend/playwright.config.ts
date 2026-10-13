import { defineConfig } from "@playwright/test";
import { E2E_BASE_URL, E2E_PORT } from "./tests/e2e/support/constants";

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results",
  forbidOnly: true,
  reporter: [["list"]],
  use: {
    baseURL: E2E_BASE_URL,
    // German is the product default; the browser locale drives the first-visit language.
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    // next start warns that standalone output prefers server.js; it serves the same build.
    command: `pnpm exec next start -p ${E2E_PORT}`,
    url: E2E_BASE_URL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
