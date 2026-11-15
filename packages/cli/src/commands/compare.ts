import { resolve } from "node:path";
import {
  BROWSER_LABELS,
  MotionprError,
  captureBrowser,
  comparisonConfigSchema,
  isBrowserName,
  readCaptureBundle,
  resolveCaptureRef,
  resolvePaths,
  type BrowserName,
  type ComparisonResult,
  type ResolvedConfig,
} from "@motionpr/core";
import { exitCodeFor } from "@motionpr/comparison";
import { writeBrowserIndex, writeBrowserReportSummary } from "@motionpr/report";
import { compareDirs, comparisonDir, comparisonKey, reportDir, writeReport } from "../api.ts";
import { loadConfig, type LoadedConfig } from "../config/load.ts";
import { comparisonMarkdown, printComparison } from "../output/format.ts";
import { openInBrowser } from "../runtime/open.ts";
import {
  banner,
  combineExitCodes,
  cwdOf,
  makeTerminal,
  printJson,
  selectBrowsers,
  type GlobalOptions,
} from "./shared.ts";

export interface CompareCommandOptions extends GlobalOptions {
  baseline?: string;
  current?: string;
  output?: string;
  threshold?: string;
  format?: string;
  report?: boolean;
  open?: boolean;
  /** `--browser`: engine(s) whose captures are compared (repeatable, comma lists, `all`). */
  browser?: string[];
  /** `--against <browser>`: compare with another engine's baseline (a cross-browser comparison). */
  against?: string;
  /** `--cross-browser`: allow explicit `--baseline`/`--current` captures of different engines. */
  crossBrowser?: boolean;
}

export const THRESHOLDS = ["critical", "warning", "info", "never"] as const;

export function parseThreshold(value: string | undefined): (typeof THRESHOLDS)[number] | undefined {
  if (value === undefined) return undefined;
  if (!(THRESHOLDS as readonly string[]).includes(value)) {
    throw new MotionprError("CONFIG_INVALID", `Invalid --threshold "${value}".`, {
      hint: `Use one of: ${THRESHOLDS.join(", ")}.`,
    });
  }
  return value as (typeof THRESHOLDS)[number];
}

type OptionalConfig = Pick<LoadedConfig, "paths"> & {
  config: Pick<ResolvedConfig, "comparison" | "project"> & {
    browser: Pick<ResolvedConfig["browser"], "name">;
  };
};

/** compare works without a config file (defaults) when both captures are given explicitly. */
async function loadOptionalConfig(options: CompareCommandOptions): Promise<OptionalConfig> {
  try {
    return await loadConfig({
      cwd: cwdOf(options),
      ...(options.config ? { config: options.config } : {}),
      ...(options.env ? { env: options.env } : {}),
    });
  } catch (error) {
    if (
      error instanceof MotionprError &&
      error.code === "CONFIG_NOT_FOUND" &&
      !options.config &&
      options.baseline &&
      options.current
    ) {
      const defaults = {
        output: {
          directory: ".motionpr",
          baseline: "baseline",
          captures: "captures",
          report: "report",
          keep: 5,
        },
      };
      return {
        paths: resolvePaths(defaults, cwdOf(options)),
        config: {
          comparison: comparisonConfigSchema.parse({}),
          project: {},
          browser: { name: "chromium" },
        },
      };
    }
    throw error;
  }
}

function parseAgainst(value: string | undefined): BrowserName | undefined {
  if (value === undefined) return undefined;
  const v = value.trim().toLowerCase();
  if (!isBrowserName(v))
    throw new MotionprError("CONFIG_INVALID", `Unknown browser "${value}" for --against.`, {
      hint: "Use chromium, firefox or webkit.",
    });
  return v;
}

interface Pair {
  browser: BrowserName | null;
  baselineDir: string;
  candidateDir: string;
}

export async function compareCommand(options: CompareCommandOptions): Promise<number> {
  const format = options.format ?? (options.json ? "json" : "text");
  if (!["text", "json", "markdown"].includes(format)) {
    throw new MotionprError("CONFIG_INVALID", `Invalid --format "${format}".`, {
      hint: "Use text, json or markdown.",
    });
  }
  const t = makeTerminal({ ...options, json: format !== "text" });
  banner(t, "compare");
  selectBrowsers(options.browser, "chromium"); // usage errors before anything else
  const threshold = parseThreshold(options.threshold);
  const against = parseAgainst(options.against);
  const loaded = await loadOptionalConfig(options);
  const cwd = cwdOf(options);
  const explicitBrowser = Boolean(options.browser?.length || process.env.MOTIONPR_BROWSER);

  // Which captures to compare, per engine.
  const pairs: Pair[] = [];
  if (options.current && !explicitBrowser) {
    // An explicit candidate decides the engine: its own baseline is the default.
    const candidateDir = await resolveCaptureRef(options.current, loaded.paths, cwd);
    const engine = captureBrowser(await readCaptureBundle(candidateDir));
    const own = isBrowserName(engine) ? engine : null;
    const baselineDir = await resolveBaselineRef(options, loaded, cwd, against ?? own);
    pairs.push({ browser: own, baselineDir, candidateDir });
  } else {
    const browsers = selectBrowsers(options.browser, loaded.config.browser.name);
    if (browsers.length > 1 && (options.current || options.baseline || options.output)) {
      throw new MotionprError(
        "CONFIG_INVALID",
        "--current, --baseline and --output name one capture; they cannot be combined with several browsers.",
        { hint: "Pass one --browser, or leave out the explicit captures." },
      );
    }
    for (const browser of browsers) {
      const candidateDir = await resolveCaptureRef(
        options.current ?? "latest",
        loaded.paths,
        cwd,
        browser,
      );
      const baselineDir = await resolveBaselineRef(options, loaded, cwd, against ?? browser);
      pairs.push({ browser, baselineDir, candidateDir });
    }
  }

  const comparisonConfig = threshold
    ? { ...loaded.config.comparison, failOn: threshold }
    : loaded.config.comparison;
  const results: { result: ComparisonResult; report: string | null }[] = [];
  for (const pair of pairs) {
    const [baselineBundle, candidateBundle] = await Promise.all([
      readCaptureBundle(pair.baselineDir),
      readCaptureBundle(pair.candidateDir),
    ]);
    const key = comparisonKey(baselineBundle, candidateBundle);
    const crossBrowser = captureBrowser(baselineBundle) !== captureBrowser(candidateBundle);
    if (crossBrowser && !against && !options.crossBrowser) {
      throw new MotionprError(
        "BROWSER_MISMATCH",
        `The baseline (${pair.baselineDir}) was captured with ${label(captureBrowser(baselineBundle))}, the candidate with ${label(captureBrowser(candidateBundle))}.`,
        {
          hint: "Each browser has its own baseline. To compare engines on purpose, add --cross-browser: pixel, geometry and scheduling differences are then reported as uncertain.",
        },
      );
    }
    const outDir = options.output ? resolve(cwd, options.output) : comparisonDir(loaded.paths, key);
    const spinner = t.spinner(
      `Comparing ${crossBrowser ? `${label(captureBrowser(baselineBundle))} → ${label(captureBrowser(candidateBundle))}` : label(captureBrowser(candidateBundle))} captures`,
    );
    const { result, baseline, candidate } = await compareDirs({
      baselineDir: pair.baselineDir,
      candidateDir: pair.candidateDir,
      config: comparisonConfig,
      outputDir: outDir,
      allowCrossBrowser: crossBrowser,
    });
    spinner.succeed(
      `Compared ${result.summary.animations.matched + result.summary.animations.added + result.summary.animations.removed} animations across ${result.scenarios.length} scenarios`,
    );
    let reportPath: string | null = null;
    if (options.report !== false) {
      const out = reportDir(loaded.paths, key);
      const report = await writeReport({
        outputDir: out,
        candidate: { dir: pair.candidateDir, bundle: candidate },
        baseline: { dir: pair.baselineDir, bundle: baseline },
        comparison: { dir: outDir, result },
        ...(crossBrowser
          ? {
              notes: [
                `Cross-browser comparison: ${label(captureBrowser(baseline))} baseline, ${label(captureBrowser(candidate))} candidate. Pixel, geometry, start-offset and scroll differences are uncertain by design.`,
              ],
            }
          : {}),
      });
      await writeBrowserReportSummary(out, {
        key,
        browser: crossBrowser
          ? `${label(captureBrowser(baseline))} ${baseline.environment.browser.version} → ${label(captureBrowser(candidate))} ${candidate.environment.browser.version}`
          : `${label(captureBrowser(candidate))} ${candidate.environment.browser.version}`,
        status: result.summary.status,
        counts: result.summary.counts,
        scenarios: candidate.scenarios.length,
        captureId: candidate.id,
        generatedAt: new Date().toISOString(),
      });
      await writeBrowserIndex({
        reportRoot: loaded.paths.report,
        project: loaded.config.project.name ?? candidate.project.name,
      });
      reportPath = report.indexPath;
    }
    results.push({ result, report: reportPath });
    if (format === "text") {
      t.write();
      printComparison(t, result, reportPath ? { reportPath } : {});
    }
  }

  if (format === "json") {
    if (results.length === 1) printJson({ ...results[0]!.result, report: results[0]!.report });
    else
      printJson({
        kind: "motionpr-comparisons",
        comparisons: results.map((r) => ({ ...r.result, report: r.report })),
      });
  } else if (format === "markdown") {
    for (const r of results) {
      if (results.length > 1)
        process.stdout.write(`### ${label(r.result.candidate.browserName)}\n\n`);
      process.stdout.write(comparisonMarkdown(r.result));
    }
  }
  if (options.open && results[0]?.report) await openInBrowser(results[0].report);
  return combineExitCodes(results.map((r) => exitCodeFor(r.result)));
}

function label(name: string): string {
  return isBrowserName(name) ? BROWSER_LABELS[name] : name;
}

/** The baseline to compare with: an explicit capture, or the given engine's approved baseline. */
async function resolveBaselineRef(
  options: CompareCommandOptions,
  loaded: OptionalConfig,
  cwd: string,
  browser: BrowserName | null,
): Promise<string> {
  if (options.baseline && options.baseline !== "baseline")
    return resolveCaptureRef(options.baseline, loaded.paths, cwd, browser ?? undefined);
  try {
    return await resolveCaptureRef("baseline", loaded.paths, cwd, browser ?? undefined);
  } catch (error) {
    if (error instanceof MotionprError && error.code === "BASELINE_NOT_FOUND") throw error;
    throw new MotionprError("BASELINE_NOT_FOUND", "No approved baseline yet.", {
      hint: "Approve a capture with `npx motionpr baseline accept`, or pass --baseline <capture>.",
      cause: error,
    });
  }
}
