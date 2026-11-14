import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { resolveConfig, type CaptureBundle } from "@motionpr/core";
import { launchBrowser, runCapture } from "@motionpr/capture";
import { compareCaptures, exitCodeFor } from "@motionpr/comparison";
import { writeReport } from "../api.ts";
import { demoAppDir } from "../assets.ts";
import { demoConfig } from "../demo/config.ts";
import { serveDemo } from "../demo/server.ts";
import { printComparison } from "../output/format.ts";
import { openInBrowser } from "../runtime/open.ts";
import { abortSignal, onCleanup } from "../runtime/signals.ts";
import {
  banner,
  captureProgress,
  cwdOf,
  makeTerminal,
  printJson,
  type GlobalOptions,
} from "./shared.ts";

export interface DemoOptions extends GlobalOptions {
  output?: string;
  open?: boolean;
  scenario?: string[];
}

/**
 * Captures the bundled demo app twice (baseline and candidate variants) with the real engine,
 * compares them and opens the report. No project or configuration is needed.
 */
export async function demoCommand(options: DemoOptions): Promise<number> {
  const t = makeTerminal(options);
  banner(t, "demo");
  const out = options.output
    ? resolve(cwdOf(options), options.output)
    : join(tmpdir(), "motionpr-demo");
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });

  const server = await serveDemo(await demoAppDir());
  onCleanup(() => server.close());
  t.step(`Serving the demo app at ${t.tech(server.url)} (baseline and candidate variants)`);
  const baseConfig = resolveConfig(demoConfig(`${server.url}/baseline/`));
  const browser = await launchBrowser(baseConfig);
  onCleanup(() => browser.close());
  const captures: Record<"baseline" | "candidate", { dir: string; bundle: CaptureBundle }> =
    {} as never;
  try {
    for (const variant of ["baseline", "candidate"] as const) {
      t.write();
      t.write(`  ${t.c.bold(variant === "baseline" ? "Baseline variant" : "Candidate variant")}`);
      const config = resolveConfig(demoConfig(`${server.url}/${variant}/`));
      const dir = join(out, variant);
      const outcome = await runCapture({
        config,
        rootDir: out,
        outputDir: dir,
        browser,
        signal: abortSignal,
        onEvent: captureProgress(t),
        ...(options.scenario?.length ? { scenarios: options.scenario } : {}),
      });
      captures[variant] = { dir, bundle: outcome.bundle };
    }
  } finally {
    await browser.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }

  const comparisonDir = join(out, "comparison");
  const result = await compareCaptures({
    baseline: captures.baseline,
    candidate: captures.candidate,
    config: baseConfig.comparison,
    outputDir: comparisonDir,
  });
  const report = await writeReport({
    outputDir: join(out, "report"),
    candidate: captures.candidate,
    baseline: captures.baseline,
    comparison: { dir: comparisonDir, result },
    project: "MotionPR demo · Halcyon Studio",
    notes: [
      "Demonstration: both captures come from the bundled demo app; the candidate variant contains intentional motion changes.",
    ],
  });
  if (options.json)
    printJson({ report: report.indexPath, summary: result.summary, exitCode: exitCodeFor(result) });
  else {
    t.write();
    printComparison(t, result, { reportPath: report.indexPath });
    t.write();
    if (result.summary.status === "failed")
      t.info(
        "The demo fails on purpose: the candidate removes an animation, which is critical by default.",
      );
  }
  const shouldOpen = options.open ?? (t.interactive && !t.ci);
  if (shouldOpen) await openInBrowser(report.indexPath);
  return 0;
}
