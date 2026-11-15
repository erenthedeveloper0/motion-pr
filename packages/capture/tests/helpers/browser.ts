import { BROWSER_NAMES, isBrowserName, type BrowserName } from "@motionpr/core";

/**
 * Engine the browser suites run against: `MOTIONPR_TEST_BROWSER=firefox pnpm test:integration`.
 * Defaults to Chromium. CI runs the integration suites once per engine.
 */
export const TEST_BROWSER: BrowserName = (() => {
  const value = process.env.MOTIONPR_TEST_BROWSER ?? "chromium";
  if (!isBrowserName(value))
    throw new Error(
      `MOTIONPR_TEST_BROWSER must be one of ${BROWSER_NAMES.join(", ")} (got "${value}").`,
    );
  return value;
})();

/** True when the suites run against the default engine (where multi-engine tests also run). */
export const DEFAULT_ENGINE_RUN = !process.env.MOTIONPR_TEST_BROWSER;
