import { appendFile } from "node:fs/promises";
import { CAPTURE_FILE, pathExists, readCaptureBundle } from "@motionpr/core";
import { exitCodeFor } from "@motionpr/comparison";
import { join } from "node:path";
import { captureProject, compareDirs, comparisonDir, writeReport } from "../api.ts";
import { loadConfig } from "../config/load.ts";
import {
  captureMarkdown,
  comparisonMarkdown,
  printCaptureSummary,
  printComparison,
} from "../output/format.ts";
import { openInBrowser } from "../runtime/open.ts";
import { abortSignal, onCleanup } from "../runtime/signals.ts";
import { assertBrowser, viewportFilter } from "./capture.ts";
import { parseThreshold } from "./compare.ts";
import {
  banner,
  captureProgress,
  cwdOf,
  makeTerminal,
  printJson,
  type GlobalOptions,
} from "./shared.ts";

export interface RunCommandOptions extends GlobalOptions {
  scenario?: string[];
  viewport?: string[];
  project?: string[];
  browser?: string;
  headed?: boolean;
  debug?: boolean;
  threshold?: string;
  open?: boolean;
  webServer?: boolean;
  allowMissingBaseline?: boolean;
  summary?: boolean;
}

async function writeStepSummary(markdown: string, enabled: boolean): Promise<void> {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!enabled || !file) return;
  await appendFile(file, markdown);
}

export async function runCommand(options: RunCommandOptions): Promise<number> {
  const t = makeTerminal(options);
  assertBrowser(options.browser);
  banner(t, "run");
  const threshold = parseThreshold(options.threshold);
  const loaded = await loadConfig({
    cwd: cwdOf(options),
    ...(options.config ? { config: options.config } : {}),
    ...(options.env ? { env: options.env } : {}),
  });
  const { config, paths } = loaded;
  t.debug(`Config ${loaded.file}`);
  t.step(
    `${config.scenarios.length} scenario${config.scenarios.length === 1 ? "" : "s"} from ${t.c.dim(loaded.file.slice(loaded.rootDir.length + 1))}`,
  );
  const hasBaseline = await pathExists(join(paths.baseline, CAPTURE_FILE));
  const viewports = viewportFilter(options);

  // 1–5: start servers (if configured), wait for readiness, capture.
  const { bundle, dir } = await captureProject(loaded, {
    ...(options.scenario?.length ? { scenarios: options.scenario } : {}),
    ...(viewports ? { viewports } : {}),
    ...(options.headed || options.debug ? { headless: false } : {}),
    ...(options.debug ? { debug: true } : {}),
    webServer: options.webServer !== false,
    signal: abortSignal,
    onEvent: captureProgress(t),
    serverLogger: { info: (m) => t.step(m), output: (l) => t.debug(l) },
    onServers: (stop) => onCleanup(stop),
  });
  const summaryEnabled = options.summary !== false;
  const shouldOpen = options.open ?? false;

  // 6: no baseline yet → capture-only report.
  if (!hasBaseline) {
    const report = await writeReport({
      outputDir: paths.report,
      candidate: { dir, bundle },
      notes: ["No approved baseline yet: this report inspects the current capture only."],
    });
    if (options.json)
      printJson({
        status: "no-baseline",
        capture: { id: bundle.id, dir },
        report: report.indexPath,
      });
    else {
      printCaptureSummary(t, bundle, dir);
      t.write();
      t.warn("No approved baseline yet, so there is nothing to compare against.");
      t.hint(
        "Review the report, then approve this capture as the baseline and commit .motionpr/baseline.",
      );
      t.write(`  ${t.c.bold("Report")}  ${t.tech(report.indexPath)}`);
      t.next(["npx motionpr report --open", "npx motionpr baseline accept"]);
    }
    await writeStepSummary(
      captureMarkdown(
        bundle,
        "No approved baseline was found, so no comparison ran. Commit `.motionpr/baseline` to enable comparisons.",
      ),
      summaryEnabled,
    );
    if (shouldOpen) await openInBrowser(report.indexPath);
    if (t.ci && !options.allowMissingBaseline) {
      t.fail(
        "Failing because CI has no baseline to compare against (use --allow-missing-baseline to permit this).",
      );
      return 2;
    }
    return bundle.scenarios.some((s) => s.status === "failed") ? 2 : 0;
  }

  // 7–8: compare and generate the report.
  const baselineBundle = await readCaptureBundle(paths.baseline);
  const comparisonConfig = threshold
    ? { ...config.comparison, failOn: threshold }
    : config.comparison;
  const outDir = comparisonDir(paths);
  const { result } = await compareDirs({
    baselineDir: paths.baseline,
    candidateDir: dir,
    config: comparisonConfig,
    outputDir: outDir,
  });
  const report = await writeReport({
    outputDir: paths.report,
    candidate: { dir, bundle },
    baseline: { dir: paths.baseline, bundle: baselineBundle },
    comparison: { dir: outDir, result },
  });

  // 9: summary. 10: exit code.
  if (options.json)
    printJson({ ...result, capture: { id: bundle.id, dir }, report: report.indexPath });
  else {
    t.write();
    printComparison(t, result, { reportPath: report.indexPath });
    if (result.summary.status === "failed")
      t.next([
        "npx motionpr report --open",
        "npx motionpr baseline accept   # if the changes are intended",
      ]);
  }
  await writeStepSummary(
    comparisonMarkdown(result, { artifactName: "motionpr-report" }),
    summaryEnabled,
  );
  if (shouldOpen) await openInBrowser(report.indexPath);
  return exitCodeFor(result);
}
