import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { demoBrowsers, demoReportDir } from "./browsers.ts";

/**
 * Captures the demo app (baseline + candidate) for real in every engine listed in
 * MOTIONPR_E2E_BROWSERS (default: chromium) and generates each engine's report. The Chromium
 * report also serves the report-viewer specs.
 */
export default function globalSetup(): void {
  for (const browser of demoBrowsers()) {
    const report = demoReportDir(browser);
    if (process.env.MOTIONPR_E2E_REUSE && existsSync(`${report}/index.html`)) continue;
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/generate-demo.ts",
        "--out",
        browser === "chromium" ? ".tmp/e2e/data" : `.tmp/e2e/${browser}/data`,
        "--html",
        report,
        "--browser",
        browser,
      ],
      { stdio: "inherit" },
    );
  }
}
