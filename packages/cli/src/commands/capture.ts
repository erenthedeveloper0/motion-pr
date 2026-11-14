import { resolve } from "node:path";
import { MotionprError } from "@motionpr/core";
import { captureProject } from "../api.ts";
import { loadConfig } from "../config/load.ts";
import { printCaptureSummary } from "../output/format.ts";
import { abortSignal, onCleanup } from "../runtime/signals.ts";
import {
  banner,
  captureProgress,
  cwdOf,
  makeTerminal,
  printJson,
  type GlobalOptions,
} from "./shared.ts";

export interface CaptureCommandOptions extends GlobalOptions {
  output?: string;
  scenario?: string[];
  viewport?: string[];
  project?: string[];
  browser?: string;
  headed?: boolean;
  debug?: boolean;
  webServer?: boolean;
}

export function assertBrowser(name: string | undefined): void {
  if (name && name !== "chromium") {
    throw new MotionprError("CONFIG_INVALID", `Browser "${name}" is not supported yet.`, {
      hint: "This release captures with Chromium only (--browser chromium). See docs/advanced/support-matrix.md.",
    });
  }
}

export function viewportFilter(options: {
  viewport?: string[];
  project?: string[];
}): string[] | undefined {
  const all = [...(options.viewport ?? []), ...(options.project ?? [])]
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
  return all.length ? all : undefined;
}

export async function captureCommand(options: CaptureCommandOptions): Promise<number> {
  const t = makeTerminal(options);
  assertBrowser(options.browser);
  banner(t, "capture");
  const loaded = await loadConfig({
    cwd: cwdOf(options),
    ...(options.config ? { config: options.config } : {}),
    ...(options.env ? { env: options.env } : {}),
  });
  t.debug(`Config ${loaded.file}`);
  const viewports = viewportFilter(options);
  const { bundle, dir } = await captureProject(loaded, {
    ...(options.scenario?.length ? { scenarios: options.scenario } : {}),
    ...(viewports ? { viewports } : {}),
    ...(options.headed || options.debug ? { headless: false } : {}),
    ...(options.debug ? { debug: true } : {}),
    ...(options.output ? { outputDir: resolve(cwdOf(options), options.output) } : {}),
    webServer: options.webServer !== false,
    signal: abortSignal,
    onEvent: captureProgress(t),
    serverLogger: { info: (m) => t.step(m), output: (l) => t.debug(l) },
    onServers: (stop) => onCleanup(stop),
  });
  const failed = bundle.scenarios.filter((s) => s.status === "failed");
  if (options.json)
    printJson({
      id: bundle.id,
      dir,
      scenarios: bundle.scenarios.map((s) => ({
        key: s.key,
        status: s.status,
        checkpoints: s.checkpoints.length,
        error: s.error?.message,
      })),
    });
  else printCaptureSummary(t, bundle, dir);
  if (failed.length) {
    t.write();
    t.fail(`${failed.length} scenario${failed.length === 1 ? "" : "s"} failed during capture.`);
    return 2;
  }
  if (!options.json)
    t.next(["npx motionpr compare", "npx motionpr baseline accept   # approve this capture"]);
  return 0;
}
