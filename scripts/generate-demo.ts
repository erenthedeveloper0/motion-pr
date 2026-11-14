/**
 * Captures the bundled demo app (baseline + candidate variants) with the real engine, compares
 * the captures and writes:
 *   <out>/baseline, <out>/candidate, <out>/comparison   raw capture & comparison output
 *   <out>/report-data/report-data.json + assets/         data for the docs demo and viewer dev
 *
 * Usage: pnpm demo:capture [--out <dir>]   (default: apps/docs/public/demo)
 * Requires: pnpm --filter @motionpr/demo-app build, Chromium (npx motionpr install).
 */
import { mkdir, rm, writeFile, cp } from "node:fs/promises";
import { join, resolve } from "node:path";
import { resolveConfig } from "@motionpr/core";
import { launchBrowser, runCapture } from "@motionpr/capture";
import { compareCaptures } from "@motionpr/comparison";
import { readFile } from "node:fs/promises";
import { generateReport, writeReportAssets } from "@motionpr/report";
import { demoConfig } from "../packages/cli/src/demo/config.ts";
import { serveDemo } from "../packages/cli/src/demo/server.ts";

const args = process.argv.slice(2);
const outArg = args.indexOf("--out");
const publicDir = resolve(outArg >= 0 ? args[outArg + 1]! : "apps/docs/public/demo");
const htmlArg = args.indexOf("--html");
const htmlDir = htmlArg >= 0 ? resolve(args[htmlArg + 1]!) : null;
const work = resolve(".tmp/demo-capture");
await rm(work, { recursive: true, force: true });
await mkdir(work, { recursive: true });

const server = await serveDemo(resolve("fixtures/demo-app/dist"));
const browser = await launchBrowser(resolveConfig(demoConfig(`${server.url}/baseline/`)));
const captures: Record<
  string,
  { dir: string; bundle: Awaited<ReturnType<typeof runCapture>>["bundle"] }
> = {};
try {
  for (const variant of ["baseline", "candidate"]) {
    const config = resolveConfig(demoConfig(`${server.url}/${variant}/`));
    const started = Date.now();
    const { bundle, dir } = await runCapture({
      config,
      rootDir: work,
      outputDir: join(work, variant),
      browser,
      onEvent: (e) => {
        if (e.type === "scenario:end")
          console.log(
            `  ${variant} ${e.key} ${e.status} ${e.durationMs}ms${e.error ? ` ${e.error}` : ""}`,
          );
        if (e.type === "diagnostic" && e.diagnostic.level !== "info")
          console.log(`    ! ${e.diagnostic.code}: ${e.diagnostic.message}`);
      },
    });
    captures[variant] = { dir, bundle };
    console.log(`${variant}: ${bundle.scenarios.length} scenarios in ${Date.now() - started}ms`);
  }
} finally {
  await browser.close();
  await server.close();
}
const comparisonDir = join(work, "comparison");
const result = await compareCaptures({
  baseline: captures.baseline!,
  candidate: captures.candidate!,
  config: resolveConfig(demoConfig("http://x/")).comparison,
  outputDir: comparisonDir,
});
console.log("summary", JSON.stringify(result.summary));
await rm(publicDir, { recursive: true, force: true });
const data = await writeReportAssets({
  outputDir: publicDir,
  candidate: { dir: captures.candidate!.dir, value: captures.candidate!.bundle },
  baseline: { dir: captures.baseline!.dir, value: captures.baseline!.bundle },
  comparison: { dir: comparisonDir, value: result },
  project: "MotionPR demo · Halcyon Studio",
  notes: [
    "Demonstration fixture: both captures come from the bundled demo app; the candidate variant contains intentional motion changes.",
  ],
});
await writeFile(join(publicDir, "report-data.json"), JSON.stringify(data));
await cp(work, join(resolve(".tmp"), "demo-last"), { recursive: true });
if (htmlDir) {
  const report = await generateReport({
    outputDir: htmlDir,
    template: await readFile(resolve("packages/report/dist/index.html"), "utf8"),
    candidate: { dir: captures.candidate!.dir, value: captures.candidate!.bundle },
    baseline: { dir: captures.baseline!.dir, value: captures.baseline!.bundle },
    comparison: { dir: comparisonDir, value: result },
    project: "MotionPR demo · Halcyon Studio",
  });
  await writeFile(join(htmlDir, "comparison.json"), JSON.stringify(result));
  console.log(`wrote ${report.indexPath}`);
}
console.log(`wrote ${publicDir}`);
