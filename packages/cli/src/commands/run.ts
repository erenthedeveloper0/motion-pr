import { appendFile } from "node:fs/promises";
import {
  BROWSER_LABELS,
  browserPaths,
  isMotionprError,
  readCaptureBundle,
  resolveBaselineDir,
  type BrowserName,
  type CaptureBundle,
  type ComparisonResult,
} from "@motionpr/core";
import { exitCodeFor } from "@motionpr/comparison";
import { writeBrowserIndex, writeBrowserReportSummary } from "@motionpr/report";
import {
  captureProject,
  compareDirs,
  comparisonDir,
  reportDir,
  startProjectServers,
  writeReport,
} from "../api.ts";
import { loadConfig, type LoadedConfig } from "../config/load.ts";
import {
  captureMarkdown,
  comparisonMarkdown,
  printCaptureSummary,
  printComparison,
} from "../output/format.ts";
import { openInBrowser } from "../runtime/open.ts";
import { abortSignal, onCleanup } from "../runtime/signals.ts";
import type { Terminal } from "../output/terminal.ts";
import { viewportFilter } from "./capture.ts";
import { parseThreshold } from "./compare.ts";
import {
  assertBrowsersInstalled,
  banner,
  browserList,
  captureProgress,
  combineExitCodes,
  cwdOf,
  makeTerminal,
  printJson,
  selectBrowsers,
  type GlobalOptions,
} from "./shared.ts";

export interface RunCommandOptions extends GlobalOptions {
  scenario?: string[];
  viewport?: string[];
  project?: string[];
  /** `--browser`: engine names, comma lists or `all` (repeatable). */
  browser?: string[];
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

/** What one engine's part of a run produced. */
export interface BrowserRunOutcome {
  browser: BrowserName;
  /** `passed`/`failed` (compared), `no-baseline` (capture only), `error` (could not run). */
  status: "passed" | "failed" | "no-baseline" | "error";
  exitCode: number;
  capture: { id: string; dir: string; version: string } | null;
  report: string | null;
  result: ComparisonResult | null;
  error: { code: string; message: string; hint?: string } | null;
  /** True when the baseline was read from the 0.1 single-browser layout. */
  legacyBaseline: boolean;
}

interface RunContext {
  t: Terminal;
  loaded: LoadedConfig;
  options: RunCommandOptions;
  multi: boolean;
}

async function runOne(ctx: RunContext, browserName: BrowserName): Promise<BrowserRunOutcome> {
  const { t, loaded, options, multi } = ctx;
  const { config, paths } = loaded;
  const label = BROWSER_LABELS[browserName];
  const own = browserPaths(paths, browserName);
  const viewports = viewportFilter(options);
  const threshold = parseThreshold(options.threshold);
  const summaryEnabled = options.summary !== false;
  const baselineAt = await resolveBaselineDir(paths, browserName);

  // 1–5: capture (servers are already running).
  const { bundle, dir } = await captureProject(loaded, {
    browserName,
    ...(options.scenario?.length ? { scenarios: options.scenario } : {}),
    ...(viewports ? { viewports } : {}),
    ...(options.headed || options.debug ? { headless: false } : {}),
    ...(options.debug ? { debug: true } : {}),
    webServer: false,
    signal: abortSignal,
    onEvent: captureProgress(t),
  });
  const capture = { id: bundle.id, dir, version: bundle.environment.browser.version };
  const heading = multi ? `### ${label}\n\n` : "";

  // 6: no baseline for this engine → capture-only report.
  if (!baselineAt) {
    const out = reportDir(paths, browserName);
    const report = await writeReport({
      outputDir: out,
      candidate: { dir, bundle },
      notes: [
        `No approved ${label} baseline yet: this report inspects the current ${label} capture only.`,
      ],
    });
    await writeBrowserReportSummary(out, summaryOf(browserName, bundle, null));
    if (!options.json) {
      printCaptureSummary(t, bundle, dir);
      t.write();
      t.warn(`No approved ${label} baseline yet, so there is nothing to compare against.`);
      t.hint(
        `Baselines are per browser. Review the report, then approve this capture and commit ${relativeTo(loaded.rootDir, own.baseline)}.`,
      );
      t.write(`  ${t.c.bold("Report")}  ${t.tech(report.indexPath)}`);
    }
    await writeStepSummary(
      heading +
        captureMarkdown(
          bundle,
          `No approved ${label} baseline was found, so no comparison ran. Commit \`${relativeTo(loaded.rootDir, own.baseline)}\` to enable comparisons.`,
        ),
      summaryEnabled,
    );
    const failedScenarios = bundle.scenarios.some((s) => s.status === "failed");
    const ciFailure = t.ci && !options.allowMissingBaseline;
    return {
      browser: browserName,
      status: "no-baseline",
      exitCode: ciFailure || failedScenarios ? 2 : 0,
      capture,
      report: report.indexPath,
      result: null,
      error: null,
      legacyBaseline: false,
    };
  }

  // 7–8: compare with this engine's baseline and generate its report.
  const baselineBundle = await readCaptureBundle(baselineAt.dir);
  const comparisonConfig = threshold
    ? { ...config.comparison, failOn: threshold }
    : config.comparison;
  const outDir = comparisonDir(paths, browserName);
  const { result } = await compareDirs({
    baselineDir: baselineAt.dir,
    candidateDir: dir,
    config: comparisonConfig,
    outputDir: outDir,
  });
  const out = reportDir(paths, browserName);
  const report = await writeReport({
    outputDir: out,
    candidate: { dir, bundle },
    baseline: { dir: baselineAt.dir, bundle: baselineBundle },
    comparison: { dir: outDir, result },
  });
  await writeBrowserReportSummary(out, summaryOf(browserName, bundle, result));
  if (!options.json) {
    t.write();
    printComparison(t, result, { reportPath: report.indexPath });
    if (baselineAt.legacy)
      t.hint(
        `The ${label} baseline is in the 0.1 layout (${relativeTo(loaded.rootDir, baselineAt.dir)}). \`npx motionpr baseline migrate\` moves it to ${relativeTo(loaded.rootDir, own.baseline)}.`,
      );
  }
  await writeStepSummary(
    heading + comparisonMarkdown(result, { artifactName: "motionpr-report" }),
    summaryEnabled,
  );
  return {
    browser: browserName,
    status: result.summary.status,
    exitCode: exitCodeFor(result),
    capture,
    report: report.indexPath,
    result,
    error: null,
    legacyBaseline: baselineAt.legacy,
  };
}

function summaryOf(browser: BrowserName, bundle: CaptureBundle, result: ComparisonResult | null) {
  return {
    key: browser,
    browser: `${BROWSER_LABELS[browser]} ${bundle.environment.browser.version}`,
    status: result ? result.summary.status : ("capture-only" as const),
    counts: result ? result.summary.counts : null,
    scenarios: bundle.scenarios.length,
    captureId: bundle.id,
    generatedAt: new Date().toISOString(),
  };
}

function relativeTo(root: string, path: string): string {
  return path.startsWith(`${root}/`) || path.startsWith(`${root}\\`)
    ? path.slice(root.length + 1)
    : path;
}

export async function runCommand(options: RunCommandOptions): Promise<number> {
  const t = makeTerminal(options);
  banner(t, "run");
  selectBrowsers(options.browser, "chromium"); // usage errors before anything else
  parseThreshold(options.threshold);
  const loaded = await loadConfig({
    cwd: cwdOf(options),
    ...(options.config ? { config: options.config } : {}),
    ...(options.env ? { env: options.env } : {}),
  });
  const { config, paths } = loaded;
  const browsers = selectBrowsers(options.browser, config.browser.name);
  const headless = options.headed || options.debug ? false : config.browser.headless;
  assertBrowsersInstalled(browsers, config, headless);
  const multi = browsers.length > 1;
  t.debug(`Config ${loaded.file}`);
  t.step(
    `${config.scenarios.length} scenario${config.scenarios.length === 1 ? "" : "s"} from ${t.c.dim(loaded.file.slice(loaded.rootDir.length + 1))}${multi ? ` in ${browserList(browsers)}` : browsers[0] !== "chromium" ? ` in ${BROWSER_LABELS[browsers[0]!]}` : ""}`,
  );

  const servers = await startProjectServers(loaded, {
    enabled: options.webServer !== false,
    signal: abortSignal,
    serverLogger: { info: (m) => t.step(m), output: (l) => t.debug(l) },
    onServers: (stop) => onCleanup(stop),
  });
  const outcomes: BrowserRunOutcome[] = [];
  try {
    for (const browserName of browsers) {
      if (multi) {
        t.write();
        t.write(`  ${t.c.bold(BROWSER_LABELS[browserName])}`);
      }
      try {
        outcomes.push(await runOne({ t, loaded, options, multi }, browserName));
      } catch (error) {
        // One engine failing to launch must not hide the others' results, but it always fails
        // the run: a requested browser that did not run is never silently skipped.
        if (!multi || !isMotionprError(error) || error.code === "ABORTED") throw error;
        t.fail(`${BROWSER_LABELS[browserName]}: ${error.message}`);
        if (error.hint) t.hint(error.hint);
        outcomes.push({
          browser: browserName,
          status: "error",
          exitCode: 2,
          capture: null,
          report: null,
          result: null,
          error: {
            code: error.code,
            message: error.message,
            ...(error.hint ? { hint: error.hint } : {}),
          },
          legacyBaseline: false,
        });
      }
    }
  } finally {
    await servers?.stop();
  }

  const index = await writeBrowserIndex({
    reportRoot: paths.report,
    project: config.project.name ?? loaded.rootDir.split(/[\\/]/).pop() ?? "MotionPR",
  });
  const exitCode = combineExitCodes(outcomes.map((o) => o.exitCode));

  if (options.json) {
    if (!multi) {
      const o = outcomes[0]!;
      printJson(
        o.result
          ? {
              ...o.result,
              browser: o.browser,
              capture: { id: o.capture!.id, dir: o.capture!.dir },
              report: o.report,
            }
          : {
              status: "no-baseline",
              browser: o.browser,
              capture: { id: o.capture!.id, dir: o.capture!.dir },
              report: o.report,
            },
      );
    } else {
      printJson({
        kind: "motionpr-run",
        exitCode,
        reportIndex: index.indexPath,
        browsers: outcomes.map((o) => ({
          browser: o.browser,
          status: o.status,
          exitCode: o.exitCode,
          capture: o.capture,
          report: o.report,
          summary: o.result?.summary ?? null,
          differences: o.result?.differences ?? [],
          error: o.error,
        })),
      });
    }
  } else {
    if (multi) {
      t.write();
      t.write(`  ${t.c.bold("Browsers")}`);
      for (const o of outcomes) {
        const state =
          o.status === "passed"
            ? t.c.green("passed")
            : o.status === "failed"
              ? t.c.red("regression")
              : o.status === "no-baseline"
                ? t.c.yellow("no baseline")
                : t.c.red("did not run");
        t.write(
          `    ${BROWSER_LABELS[o.browser].padEnd(9)} ${state}${o.capture ? t.c.dim(`  ${o.capture.version} · ${o.capture.id}`) : ""}`,
        );
      }
      t.write(`  ${t.c.bold("Reports")} ${t.tech(index.indexPath)}`);
    }
    const flag = multi
      ? ` --browser ${browsers.length === 3 ? "all" : browsers.join(",")}`
      : browsers[0] !== config.browser.name
        ? ` --browser ${browsers[0]}`
        : "";
    if (outcomes.some((o) => o.status === "no-baseline"))
      t.next([
        "npx motionpr report --open",
        `npx motionpr baseline accept${
          outcomes.length > 1
            ? ` --browser ${outcomes
                .filter((o) => o.status === "no-baseline")
                .map((o) => o.browser)
                .join(",")}`
            : flag
        }`,
      ]);
    else if (outcomes.some((o) => o.status === "failed"))
      t.next([
        "npx motionpr report --open",
        `npx motionpr baseline accept${flag}   # if the changes are intended`,
      ]);
    if (t.ci && !options.allowMissingBaseline && outcomes.some((o) => o.status === "no-baseline"))
      t.fail(
        "Failing because CI has no baseline to compare against (use --allow-missing-baseline to permit this).",
      );
  }
  if (options.open) {
    const target = multi ? index.indexPath : outcomes[0]?.report;
    if (target) await openInBrowser(target);
  }
  return exitCode;
}
