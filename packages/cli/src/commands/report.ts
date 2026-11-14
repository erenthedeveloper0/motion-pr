import { join } from "node:path";
import {
  CAPTURE_FILE,
  COMPARISON_FILE,
  MotionprError,
  latestCaptureDir,
  pathExists,
  readCaptureBundle,
  readComparisonResult,
} from "@motionpr/core";
import { comparisonDir, writeReport } from "../api.ts";
import { loadConfig } from "../config/load.ts";
import { openInBrowser } from "../runtime/open.ts";
import { banner, cwdOf, makeTerminal, printJson, type GlobalOptions } from "./shared.ts";

export interface ReportCommandOptions extends GlobalOptions {
  open?: boolean;
  regenerate?: boolean;
}

/** Opens (and if needed regenerates) the most recent report. */
export async function reportCommand(options: ReportCommandOptions): Promise<number> {
  const t = makeTerminal(options);
  banner(t, "report");
  const { paths } = await loadConfig({
    cwd: cwdOf(options),
    ...(options.config ? { config: options.config } : {}),
  });
  const index = join(paths.report, "index.html");

  if (options.regenerate || !(await pathExists(index))) {
    const latest = await latestCaptureDir(paths.captures);
    if (!latest) {
      throw new MotionprError("REPORT_NOT_FOUND", "No report or capture found.", {
        hint: "Run `npx motionpr run` first.",
      });
    }
    const candidate = await readCaptureBundle(latest);
    const cmpDir = comparisonDir(paths);
    const hasBaseline = await pathExists(join(paths.baseline, CAPTURE_FILE));
    const comparison = (await pathExists(join(cmpDir, COMPARISON_FILE)))
      ? await readComparisonResult(cmpDir)
      : null;
    const matches = comparison && comparison.candidate.id === candidate.id && hasBaseline;
    const baseline = matches ? await readCaptureBundle(paths.baseline) : null;
    await writeReport({
      outputDir: paths.report,
      candidate: { dir: latest, bundle: candidate },
      baseline: baseline ? { dir: paths.baseline, bundle: baseline } : null,
      comparison: matches && comparison ? { dir: cmpDir, result: comparison } : null,
    });
    t.success(
      `Report generated from capture ${candidate.id}${matches ? " and its comparison" : ""}`,
    );
  }

  if (options.json) printJson({ report: index });
  t.write(`  ${t.c.bold("Report")}  ${t.tech(index)}`);
  const shouldOpen = options.open ?? (t.interactive && !t.ci);
  if (shouldOpen) {
    const opened = await openInBrowser(index);
    if (opened) t.success("Opened in your browser");
    else t.warn("Could not open a browser automatically; open the file above.");
  }
  return 0;
}
