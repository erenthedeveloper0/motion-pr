import { resolve } from "node:path";
import {
  MotionprError,
  comparisonConfigSchema,
  resolvePaths,
  resolveCaptureRef,
  type ResolvedConfig,
} from "@motionpr/core";
import { exitCodeFor } from "@motionpr/comparison";
import { compareDirs, comparisonDir, writeReport } from "../api.ts";
import { loadConfig, type LoadedConfig } from "../config/load.ts";
import { comparisonMarkdown, printComparison } from "../output/format.ts";
import { openInBrowser } from "../runtime/open.ts";
import { banner, cwdOf, makeTerminal, printJson, type GlobalOptions } from "./shared.ts";

export interface CompareCommandOptions extends GlobalOptions {
  baseline?: string;
  current?: string;
  output?: string;
  threshold?: string;
  format?: string;
  report?: boolean;
  open?: boolean;
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

/** compare works without a config file (defaults) when both captures are given explicitly. */
async function loadOptionalConfig(
  options: CompareCommandOptions,
): Promise<
  Pick<LoadedConfig, "paths"> & { config: Pick<ResolvedConfig, "comparison" | "project"> }
> {
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
        config: { comparison: comparisonConfigSchema.parse({}), project: {} },
      };
    }
    throw error;
  }
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
  const threshold = parseThreshold(options.threshold);
  const loaded = await loadOptionalConfig(options);
  const cwd = cwdOf(options);
  const baselineDir = await resolveCaptureRef(
    options.baseline ?? "baseline",
    loaded.paths,
    cwd,
  ).catch((error: unknown) => {
    if (!options.baseline) {
      throw new MotionprError("BASELINE_NOT_FOUND", "No approved baseline yet.", {
        hint: "Approve a capture with `npx motionpr baseline accept`, or pass --baseline <capture>.",
        cause: error,
      });
    }
    throw error;
  });
  const candidateDir = await resolveCaptureRef(options.current ?? "latest", loaded.paths, cwd);
  const outDir = options.output ? resolve(cwd, options.output) : comparisonDir(loaded.paths);
  const comparisonConfig = threshold
    ? { ...loaded.config.comparison, failOn: threshold }
    : loaded.config.comparison;
  const spinner = t.spinner("Comparing captures");
  const { result, baseline, candidate } = await compareDirs({
    baselineDir,
    candidateDir,
    config: comparisonConfig,
    outputDir: outDir,
  });
  spinner.succeed(
    `Compared ${result.summary.animations.matched + result.summary.animations.added + result.summary.animations.removed} animations across ${result.scenarios.length} scenarios`,
  );

  let reportPath: string | undefined;
  if (options.report !== false) {
    const report = await writeReport({
      outputDir: loaded.paths.report,
      candidate: { dir: candidateDir, bundle: candidate },
      baseline: { dir: baselineDir, bundle: baseline },
      comparison: { dir: outDir, result },
    });
    reportPath = report.indexPath;
  }
  if (format === "json") printJson({ ...result, report: reportPath ?? null });
  else if (format === "markdown") process.stdout.write(comparisonMarkdown(result));
  else {
    t.write();
    printComparison(t, result, reportPath ? { reportPath } : {});
  }
  if (options.open && reportPath) await openInBrowser(reportPath);
  return exitCodeFor(result);
}
