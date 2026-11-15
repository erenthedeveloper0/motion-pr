import {
  BROWSER_LABELS,
  MOTIONPR_VERSION,
  MotionprError,
  parseBrowserSelection,
  type BrowserName,
  type Diagnostic,
  type ResolvedConfig,
} from "@motionpr/core";
import { isBrowserInstalled, launchOptionsFor, type CaptureEvent } from "@motionpr/capture";
import { Terminal, formatDuration, isCI, type Spinner } from "../output/terminal.ts";

export interface GlobalOptions {
  config?: string;
  cwd?: string;
  env?: string;
  json?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  color?: boolean;
  ci?: boolean;
}

/**
 * Engines a command runs with: `--browser` (repeatable, comma lists, `all`), else the
 * MOTIONPR_BROWSER environment variable, else the config's `browser.name`. Unknown names are an
 * error; nothing falls back to Chromium.
 */
export function selectBrowsers(
  value: string | readonly string[] | undefined,
  fallback: BrowserName,
): BrowserName[] {
  const given = typeof value === "string" ? [value] : (value ?? []);
  const env = process.env.MOTIONPR_BROWSER?.trim();
  return parseBrowserSelection(given.length ? given : env ? [env] : [], fallback);
}

export function browserList(names: readonly BrowserName[]): string {
  const labels = names.map((n) => BROWSER_LABELS[n]);
  return labels.length <= 1
    ? (labels[0] ?? "")
    : `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

/**
 * Fails before anything runs when a selected engine's Playwright build is missing, naming every
 * missing engine and the command that installs them. Engines launched from a configured channel
 * or binary are checked when they launch instead.
 */
export function assertBrowsersInstalled(
  browsers: readonly BrowserName[],
  config: ResolvedConfig,
  headless = config.browser.headless,
): void {
  const missing = browsers.filter((b) => {
    const options = launchOptionsFor(config, b);
    if (options.executablePath || options.channel) return false;
    return !isBrowserInstalled(b, { headless });
  });
  if (!missing.length) return;
  throw new MotionprError(
    "BROWSER_NOT_INSTALLED",
    `${browserList(missing)} for MotionPR ${missing.length === 1 ? "is" : "are"} not installed.`,
    {
      hint: `Run \`npx motionpr install ${missing.join(" ")}\` (add --with-deps on Linux CI). Nothing was captured: MotionPR never substitutes another browser.`,
    },
  );
}

/** Exit code of several runs: any error (2) wins over a regression (1) over success (0). */
export function combineExitCodes(codes: readonly number[]): number {
  if (codes.some((c) => c === 2)) return 2;
  if (codes.some((c) => c === 1)) return 1;
  return codes.some((c) => c !== 0) ? 2 : 0;
}

export function makeTerminal(options: GlobalOptions): Terminal {
  return new Terminal({
    json: options.json ?? false,
    quiet: options.quiet ?? false,
    verbose: options.verbose ?? false,
    ...(options.color === false ? { color: false } : {}),
    ci: options.ci ?? isCI(),
  });
}

export function cwdOf(options: GlobalOptions): string {
  return options.cwd ?? process.cwd();
}

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function banner(t: Terminal, title: string): void {
  if (!t.json) t.header(title, MOTIONPR_VERSION);
}

/** Renders capture progress: one spinner per scenario, diagnostics in verbose mode. */
export function captureProgress(t: Terminal): (event: CaptureEvent) => void {
  let spinner: Spinner | null = null;
  let current = "";
  let checkpoints = 0;
  let animations = 0;
  return (event) => {
    switch (event.type) {
      case "browser":
        t.debug(`${BROWSER_LABELS[event.name]} ${event.version}`);
        break;
      case "scenario:start":
        current = `${event.key}`;
        checkpoints = 0;
        animations = 0;
        spinner = t.spinner(`${t.c.dim(`[${event.index + 1}/${event.total}]`)} ${current}`);
        break;
      case "step":
        spinner?.update(`${t.c.dim(`${current} ›`)} ${event.description}`);
        break;
      case "checkpoint":
        checkpoints++;
        animations += event.animations;
        break;
      case "scenario:end": {
        const detail = t.c.dim(
          `${checkpoints} checkpoint${checkpoints === 1 ? "" : "s"} · ${animations} animation${animations === 1 ? "" : "s"} · ${formatDuration(event.durationMs)}`,
        );
        if (event.status === "passed") spinner?.succeed(`${event.key}  ${detail}`);
        else {
          spinner?.fail(`${event.key}  ${t.c.red("failed")}`);
          if (event.error) t.hint(event.error);
        }
        spinner = null;
        break;
      }
      case "diagnostic":
        logDiagnostic(t, event.diagnostic);
        break;
      case "debug":
        t.debug(event.message);
        break;
    }
  };
}

function logDiagnostic(t: Terminal, d: Diagnostic): void {
  if (d.level === "error") t.debug(`error ${d.code}: ${d.message}`);
  else t.debug(`${d.level} ${d.code}: ${d.message}`);
}
