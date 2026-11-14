/**
 * Programmatic API. Everything the CLI does is available here so MotionPR can be scripted
 * (custom CI steps, test-runner integration) without spawning the CLI.
 */
import { join, relative, sep } from "node:path";
import {
  generateCaptureId,
  pruneCaptures,
  readCaptureBundle,
  setLatestCapture,
  webServers,
  type CaptureBundle,
  type ComparisonConfig,
  type ComparisonResult,
  type MotionprPaths,
  type ResolvedConfig,
} from "@motionpr/core";
import {
  runCapture,
  startWebServers,
  type CaptureEvent,
  type WebServerLogger,
} from "@motionpr/capture";
import { compareCaptures } from "@motionpr/comparison";
import { generateReport, type GeneratedReport } from "@motionpr/report";
import { readViewerTemplate } from "./assets.ts";
import type { LoadedConfig } from "./config/load.ts";

export interface CaptureProjectOptions {
  scenarios?: string[];
  viewports?: string[];
  headless?: boolean;
  debug?: boolean;
  /** Write the capture here instead of `<captures>/<id>`. */
  outputDir?: string;
  /** Start configured web servers (default true). */
  webServer?: boolean;
  signal?: AbortSignal;
  onEvent?: (event: CaptureEvent) => void;
  serverLogger?: WebServerLogger;
  /** Called with a stop function so callers can register cleanup (e.g. on Ctrl+C). */
  onServers?: (stop: () => Promise<void>) => void;
}

export interface ProjectCapture {
  bundle: CaptureBundle;
  dir: string;
}

/** Starts web servers if configured, captures every scenario, and records the capture as latest. */
export async function captureProject(
  loaded: LoadedConfig,
  options: CaptureProjectOptions = {},
): Promise<ProjectCapture> {
  const { config, rootDir, paths } = loaded;
  const id = generateCaptureId();
  const dir = options.outputDir ?? join(paths.captures, id);
  const servers =
    options.webServer === false || webServers(config).length === 0
      ? null
      : await startWebServers(webServers(config), {
          cwd: rootDir,
          ...(options.serverLogger ? { logger: options.serverLogger } : {}),
          ...(options.signal ? { signal: options.signal } : {}),
        });
  if (servers) options.onServers?.(servers.stop);
  try {
    const outcome = await runCapture({
      config,
      rootDir,
      outputDir: dir,
      id,
      ...(options.scenarios ? { scenarios: options.scenarios } : {}),
      ...(options.viewports ? { viewports: options.viewports } : {}),
      ...(options.headless !== undefined ? { headless: options.headless } : {}),
      ...(options.debug ? { debug: true } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.onEvent ? { onEvent: options.onEvent } : {}),
    });
    const insideCaptures =
      !relative(paths.captures, dir).startsWith("..") &&
      relative(paths.captures, dir).split(sep).length === 1;
    if (insideCaptures) {
      await setLatestCapture(paths.captures, id);
      await pruneCaptures(paths.captures, config.output.keep);
    }
    return outcome;
  } finally {
    await servers?.stop();
  }
}

export interface CompareDirsOptions {
  baselineDir: string;
  candidateDir: string;
  config: ComparisonConfig;
  /** Where comparison.json and diff images go. */
  outputDir: string;
}

export interface DirComparison {
  result: ComparisonResult;
  baseline: CaptureBundle;
  candidate: CaptureBundle;
}

export async function compareDirs(options: CompareDirsOptions): Promise<DirComparison> {
  const [baseline, candidate] = await Promise.all([
    readCaptureBundle(options.baselineDir),
    readCaptureBundle(options.candidateDir),
  ]);
  const result = await compareCaptures({
    baseline: { dir: options.baselineDir, bundle: baseline },
    candidate: { dir: options.candidateDir, bundle: candidate },
    config: options.config,
    outputDir: options.outputDir,
  });
  return { result, baseline, candidate };
}

export interface WriteReportOptions {
  outputDir: string;
  candidate: { dir: string; bundle: CaptureBundle };
  baseline?: { dir: string; bundle: CaptureBundle } | null;
  comparison?: { dir: string; result: ComparisonResult } | null;
  project?: string;
  notes?: string[];
}

export async function writeReport(options: WriteReportOptions): Promise<GeneratedReport> {
  return generateReport({
    outputDir: options.outputDir,
    template: await readViewerTemplate(),
    candidate: { dir: options.candidate.dir, value: options.candidate.bundle },
    baseline: options.baseline
      ? { dir: options.baseline.dir, value: options.baseline.bundle }
      : null,
    comparison: options.comparison
      ? { dir: options.comparison.dir, value: options.comparison.result }
      : null,
    ...(options.project ? { project: options.project } : {}),
    ...(options.notes ? { notes: options.notes } : {}),
  });
}

/** Default directory for comparison output (diff images + comparison.json). */
export function comparisonDir(paths: MotionprPaths): string {
  return join(paths.data, "comparison");
}

export function failOnOverride(
  config: ResolvedConfig,
  threshold: string | undefined,
): ComparisonConfig {
  if (!threshold) return config.comparison;
  return { ...config.comparison, failOn: threshold as ComparisonConfig["failOn"] };
}
