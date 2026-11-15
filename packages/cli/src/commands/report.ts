import { join } from "node:path";
import {
  BROWSER_LABELS,
  COMPARISON_FILE,
  MotionprError,
  browserPaths,
  latestCaptureDir,
  pathExists,
  readCaptureBundle,
  readComparisonResult,
  resolveBaselineDir,
} from "@motionpr/core";
import {
  readBrowserReportSummaries,
  writeBrowserIndex,
  writeBrowserReportSummary,
} from "@motionpr/report";
import { comparisonDir, reportDir, writeReport } from "../api.ts";
import { loadConfig } from "../config/load.ts";
import { openInBrowser } from "../runtime/open.ts";
import {
  banner,
  cwdOf,
  makeTerminal,
  printJson,
  selectBrowsers,
  type GlobalOptions,
} from "./shared.ts";

export interface ReportCommandOptions extends GlobalOptions {
  open?: boolean;
  regenerate?: boolean;
  /** `--browser`: one engine's report (default: the index of every engine's report). */
  browser?: string[];
}

/** Opens (and if needed regenerates) the most recent report of one engine, or the index. */
export async function reportCommand(options: ReportCommandOptions): Promise<number> {
  const t = makeTerminal(options);
  banner(t, "report");
  selectBrowsers(options.browser, "chromium"); // usage errors before anything else
  const loaded = await loadConfig({
    cwd: cwdOf(options),
    ...(options.config ? { config: options.config } : {}),
  });
  const { paths, config } = loaded;
  const explicit = Boolean(options.browser?.length || process.env.MOTIONPR_BROWSER);
  const browsers = selectBrowsers(options.browser, config.browser.name);
  if (browsers.length > 1)
    throw new MotionprError("CONFIG_INVALID", "report opens one browser's report at a time.", {
      hint: "Pass one --browser, or none for the index of every browser's report.",
    });
  const browser = browsers[0]!;
  const label = BROWSER_LABELS[browser];
  const index = join(reportDir(paths, browser), "index.html");
  const overview = join(paths.report, "index.html");

  if (options.regenerate || !(await pathExists(index))) {
    const latest = await latestCaptureDir(browserPaths(paths, browser).captures);
    if (!latest) {
      throw new MotionprError("REPORT_NOT_FOUND", `No ${label} report or capture found.`, {
        hint: `Run \`npx motionpr run${browser === config.browser.name ? "" : ` --browser ${browser}`}\` first.`,
      });
    }
    const candidate = await readCaptureBundle(latest);
    const cmpDir = comparisonDir(paths, browser);
    const baselineAt = await resolveBaselineDir(paths, browser);
    const comparison = (await pathExists(join(cmpDir, COMPARISON_FILE)))
      ? await readComparisonResult(cmpDir)
      : null;
    const matches = comparison && comparison.candidate.id === candidate.id && baselineAt;
    const baseline = matches ? await readCaptureBundle(baselineAt.dir) : null;
    await writeReport({
      outputDir: reportDir(paths, browser),
      candidate: { dir: latest, bundle: candidate },
      baseline: baseline && baselineAt ? { dir: baselineAt.dir, bundle: baseline } : null,
      comparison: matches && comparison ? { dir: cmpDir, result: comparison } : null,
    });
    await writeBrowserReportSummary(reportDir(paths, browser), {
      key: browser,
      browser: `${label} ${candidate.environment.browser.version}`,
      status: matches && comparison ? comparison.summary.status : "capture-only",
      counts: matches && comparison ? comparison.summary.counts : null,
      scenarios: candidate.scenarios.length,
      captureId: candidate.id,
      generatedAt: new Date().toISOString(),
    });
    await writeBrowserIndex({
      reportRoot: paths.report,
      project: config.project.name ?? candidate.project.name,
    });
    t.success(
      `${label} report generated from capture ${candidate.id}${matches ? " and its comparison" : ""}`,
    );
  }

  // Without --browser, open the index of every engine's report when there is more than one.
  const target =
    !explicit &&
    (await pathExists(overview)) &&
    (await readBrowserReportSummaries(paths.report)).length > 1
      ? overview
      : index;
  if (options.json) printJson({ report: target, browser: target === overview ? null : browser });
  t.write(`  ${t.c.bold("Report")}  ${t.tech(target)}`);
  const shouldOpen = options.open ?? (t.interactive && !t.ci);
  if (shouldOpen) {
    const opened = await openInBrowser(target);
    if (opened) t.success("Opened in your browser");
    else t.warn("Could not open a browser automatically; open the file above.");
  }
  return 0;
}
