import { MOTIONPR_VERSION, type Diagnostic } from "@motionpr/core";
import type { CaptureEvent } from "@motionpr/capture";
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
        t.debug(`Chromium ${event.version}`);
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
