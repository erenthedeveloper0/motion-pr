/**
 * Programmatic API. Everything the CLI does is available here so MotionPR can be scripted
 * (custom CI steps, test-runner integration) without spawning the CLI.
 */
import { join, relative, sep } from "node:path";
import {
  browserPaths,
  captureBrowser,
  generateCaptureId,
  isBrowserName,
  pruneCaptures,
  readCaptureBundle,
  setLatestCapture,
  webServers,
  type BrowserName,
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
  /**
   * Engine to capture with (default: the config's `browser.name`). The capture is written to
   * `.motionpr/captures/<browser>/<id>` and becomes that engine's `latest`.
   */
  browserName?: BrowserName;
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

/**
 * Starts the configured web servers (or reuses running ones, per config) once, for one or more
 * captures. Returns null when none are configured or `enabled` is false.
 */
export async function startProjectServers(
  loaded: LoadedConfig,
  options: Pick<CaptureProjectOptions, "serverLogger" | "signal" | "onServers"> & {
    enabled?: boolean;
  } = {},
): Promise<{ stop(): Promise<void> } | null> {
  const servers =
    options.enabled === false || webServers(loaded.config).length === 0
      ? null
      : await startWebServers(webServers(loaded.config), {
          cwd: loaded.rootDir,
          ...(options.serverLogger ? { logger: options.serverLogger } : {}),
          ...(options.signal ? { signal: options.signal } : {}),
        });
  if (servers) options.onServers?.(servers.stop);
  return servers;
}

/** Starts web servers if configured, captures every scenario, and records the capture as latest. */
export async function captureProject(
  loaded: LoadedConfig,
  options: CaptureProjectOptions = {},
): Promise<ProjectCapture> {
  const { config, rootDir, paths } = loaded;
  const browserName = options.browserName ?? config.browser.name;
  const captures = browserPaths(paths, browserName).captures;
  const id = generateCaptureId();
  const dir = options.outputDir ?? join(captures, id);
  const servers = await startProjectServers(loaded, {
    enabled: options.webServer !== false,
    ...(options.serverLogger ? { serverLogger: options.serverLogger } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.onServers ? { onServers: options.onServers } : {}),
  });
  try {
    const outcome = await runCapture({
      config,
      rootDir,
      outputDir: dir,
      id,
      browserName,
      ...(options.scenarios ? { scenarios: options.scenarios } : {}),
      ...(options.viewports ? { viewports: options.viewports } : {}),
      ...(options.headless !== undefined ? { headless: options.headless } : {}),
      ...(options.debug ? { debug: true } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.onEvent ? { onEvent: options.onEvent } : {}),
    });
    const insideCaptures =
      !relative(captures, dir).startsWith("..") && relative(captures, dir).split(sep).length === 1;
    if (insideCaptures) {
      await setLatestCapture(captures, id);
      await pruneCaptures(captures, config.output.keep);
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
  /** Allow captures of different engines (see `compareCaptures`). Default false. */
  allowCrossBrowser?: boolean;
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
    ...(options.allowCrossBrowser ? { allowCrossBrowser: true } : {}),
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

/**
 * Name of the directory a comparison's output goes to: the engine (`firefox`), or
 * `<baseline>-vs-<candidate>` for a cross-browser comparison.
 */
export function comparisonKey(baseline: CaptureBundle, candidate: CaptureBundle): string {
  const b = captureBrowser(baseline);
  const c = captureBrowser(candidate);
  const safe = (n: string) => (isBrowserName(n) ? n : "other");
  return b === c ? safe(c) : `${safe(b)}-vs-${safe(c)}`;
}

/** Directory for one engine's comparison output (diff images + comparison.json). */
export function comparisonDir(paths: MotionprPaths, key: string = "chromium"): string {
  return join(paths.data, "comparison", key);
}

/** Directory for one engine's HTML report. */
export function reportDir(paths: MotionprPaths, key: string = "chromium"): string {
  return join(paths.report, key);
}

export function failOnOverride(
  config: ResolvedConfig,
  threshold: string | undefined,
): ComparisonConfig {
  if (!threshold) return config.comparison;
  return { ...config.comparison, failOn: threshold as ComparisonConfig["failOn"] };
}
