const ENGINES = ["chromium", "firefox", "webkit"] as const;
export type DemoBrowser = (typeof ENGINES)[number];

/** Engines the demo app is captured in: MOTIONPR_E2E_BROWSERS (comma list or `all`), default Chromium. */
export function demoBrowsers(): DemoBrowser[] {
  const raw = (process.env.MOTIONPR_E2E_BROWSERS ?? "chromium")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const names = raw.includes("all") ? [...ENGINES] : raw;
  for (const n of names)
    if (!(ENGINES as readonly string[]).includes(n))
      throw new Error(`MOTIONPR_E2E_BROWSERS: unknown browser "${n}"`);
  return [...new Set(names)] as DemoBrowser[];
}

/** Where an engine's demo report (and comparison.json) is written. */
export function demoReportDir(browser: DemoBrowser): string {
  return browser === "chromium" ? ".tmp/e2e/report" : `.tmp/e2e/${browser}/report`;
}
