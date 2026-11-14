import { defineConfig } from "@playwright/test";

/**
 * End-to-end tests: the global setup captures the bundled demo app (baseline + candidate) with
 * the real engine and generates a real HTML report; the specs check the detected differences and
 * drive the report viewer like a user. Requires `pnpm build` and Chromium.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  fullyParallel: true,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    browserName: "chromium",
    viewport: { width: 1600, height: 1000 },
    trace: "retain-on-failure",
  },
});
