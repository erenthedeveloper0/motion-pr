import { join, resolve } from "node:path";
import { BROWSER_LABELS, type BrowserName } from "@motionpr/core";
import { captureProject, startProjectServers } from "../api.ts";
import { loadConfig } from "../config/load.ts";
import { printCaptureSummary } from "../output/format.ts";
import { abortSignal, onCleanup } from "../runtime/signals.ts";
import {
  assertBrowsersInstalled,
  banner,
  browserList,
  captureProgress,
  cwdOf,
  makeTerminal,
  printJson,
  selectBrowsers,
  type GlobalOptions,
} from "./shared.ts";

export interface CaptureCommandOptions extends GlobalOptions {
  output?: string;
  scenario?: string[];
  viewport?: string[];
  project?: string[];
  /** `--browser`: engine names, comma lists or `all` (repeatable). */
  browser?: string[];
  headed?: boolean;
  debug?: boolean;
  webServer?: boolean;
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
  banner(t, "capture");
  selectBrowsers(options.browser, "chromium"); // usage errors before anything else
  const loaded = await loadConfig({
    cwd: cwdOf(options),
    ...(options.config ? { config: options.config } : {}),
    ...(options.env ? { env: options.env } : {}),
  });
  t.debug(`Config ${loaded.file}`);
  const browsers = selectBrowsers(options.browser, loaded.config.browser.name);
  const headless = options.headed || options.debug ? false : loaded.config.browser.headless;
  assertBrowsersInstalled(browsers, loaded.config, headless);
  const multi = browsers.length > 1;
  if (multi) t.step(`Capturing with ${browserList(browsers)}`);
  const viewports = viewportFilter(options);
  const servers = await startProjectServers(loaded, {
    enabled: options.webServer !== false,
    signal: abortSignal,
    serverLogger: { info: (m) => t.step(m), output: (l) => t.debug(l) },
    onServers: (stop) => onCleanup(stop),
  });
  const results: { browser: BrowserName; id: string; dir: string; failed: number }[] = [];
  const json: unknown[] = [];
  try {
    for (const browserName of browsers) {
      if (multi) {
        t.write();
        t.write(`  ${t.c.bold(BROWSER_LABELS[browserName])}`);
      }
      const { bundle, dir } = await captureProject(loaded, {
        browserName,
        ...(options.scenario?.length ? { scenarios: options.scenario } : {}),
        ...(viewports ? { viewports } : {}),
        ...(options.headed || options.debug ? { headless: false } : {}),
        ...(options.debug ? { debug: true } : {}),
        ...(options.output
          ? {
              outputDir: multi
                ? join(resolve(cwdOf(options), options.output), browserName)
                : resolve(cwdOf(options), options.output),
            }
          : {}),
        webServer: false,
        signal: abortSignal,
        onEvent: captureProgress(t),
      });
      const failed = bundle.scenarios.filter((s) => s.status === "failed").length;
      results.push({ browser: browserName, id: bundle.id, dir, failed });
      json.push({
        id: bundle.id,
        dir,
        browser: { name: browserName, version: bundle.environment.browser.version },
        scenarios: bundle.scenarios.map((s) => ({
          key: s.key,
          status: s.status,
          checkpoints: s.checkpoints.length,
          error: s.error?.message,
        })),
      });
      if (!options.json) printCaptureSummary(t, bundle, dir);
    }
  } finally {
    await servers?.stop();
  }
  if (options.json) printJson(multi ? { captures: json } : json[0]);
  const failed = results.filter((r) => r.failed > 0);
  if (failed.length) {
    t.write();
    for (const r of failed)
      t.fail(
        `${multi ? `${BROWSER_LABELS[r.browser]}: ` : ""}${r.failed} scenario${r.failed === 1 ? "" : "s"} failed during capture.`,
      );
    return 2;
  }
  const flag = multi
    ? ` --browser ${browsers.length === 3 ? "all" : browsers.join(",")}`
    : browsers[0] !== loaded.config.browser.name
      ? ` --browser ${browsers[0]}`
      : "";
  if (!options.json)
    t.next([
      `npx motionpr compare${flag}`,
      `npx motionpr baseline accept${flag}   # approve this capture`,
    ]);
  return 0;
}
