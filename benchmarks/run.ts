/**
 * Performance measurements for the parts of MotionPR that scale with project size: comparison,
 * scroll metrics and report-model building. Prints wall-clock medians of several runs on this
 * machine; no numbers are hard-coded anywhere else. Run: pnpm bench
 */
import { performance } from "node:perf_hooks";
import { resolveConfig, type ScrollMotionRecord } from "@motionpr/core";
import { compareCaptures, scrollMetrics } from "@motionpr/comparison";
import { buildModel } from "../packages/report/src/viewer/model.ts";
import { anim, bundle, checkpoint, scenario } from "../packages/comparison/tests/helpers.ts";

const config = resolveConfig({ baseURL: "http://x", scenarios: [{ id: "x" }] }).comparison;
const comparisonConfig = { ...config, visual: { ...config.visual, enabled: false } };

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

async function time(
  label: string,
  runs: number,
  fn: () => unknown | Promise<unknown>,
): Promise<number> {
  const out: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    await fn();
    out.push(performance.now() - t);
  }
  const m = median(out);
  console.log(`${label.padEnd(62)} ${m.toFixed(1).padStart(8)} ms (median of ${runs})`);
  return m;
}

function project(
  scenarios: number,
  checkpoints: number,
  animations: number,
  samples: number,
  shift = 0,
) {
  return bundle(
    Array.from({ length: scenarios }, (_, s) =>
      scenario(
        `s${s}`,
        Array.from({ length: checkpoints }, (_, c) =>
          checkpoint(
            `c${c}`,
            Array.from({ length: animations }, (_, a) =>
              anim({
                key: `test-id:el-${a}`,
                duration: 300 + (a % 7) * 40 + (a % 5 === 0 ? shift : 0),
                samples,
                start: a * 10,
              }),
            ),
          ),
        ),
      ),
    ),
  );
}

function scroll(samples: number): ScrollMotionRecord {
  let pos = 0;
  return {
    id: "lenis:window:vertical",
    source: "lenis",
    sessionId: "main",
    axis: "vertical",
    wrapper: null,
    config: {},
    samples: Array.from({ length: samples }, (_, i) => {
      pos += (5000 - pos) * 0.01;
      return {
        time: i * 16.667,
        actualScroll: Math.round(pos),
        animatedScroll: pos,
        targetScroll: 5000,
        progress: pos / 5000,
        velocity: 0,
        direction: 1,
        isScrolling: "smooth" as const,
        isStopped: false,
        limit: 8000,
      };
    }),
    events: samples,
    prefersReducedMotion: false,
    completeness: { status: "complete", reasons: [] },
    meta: {},
  };
}

console.log(
  `MotionPR benchmarks · Node ${process.version} · ${process.platform}-${process.arch}\n`,
);
for (const [s, c, a] of [
  [10, 2, 20],
  [50, 3, 40],
  [100, 4, 60],
] as const) {
  const b = project(s, c, a, 24);
  const k = project(s, c, a, 24, 120);
  const total = s * c * a;
  const json = JSON.stringify(b);
  console.log(
    `${total} animations (${s} scenarios × ${c} checkpoints × ${a}), capture JSON ${(json.length / 1024 / 1024).toFixed(1)} MB`,
  );
  await time(`  compareCaptures (visual off)`, 5, () =>
    compareCaptures({
      baseline: { bundle: b, dir: "" },
      candidate: { bundle: k, dir: "" },
      config: comparisonConfig,
    }),
  );
  const result = await compareCaptures({
    baseline: { bundle: b, dir: "" },
    candidate: { bundle: k, dir: "" },
    config: comparisonConfig,
  });
  await time(`  buildModel (report viewer data model)`, 5, () =>
    buildModel({
      kind: "motionpr-report",
      schemaVersion: 1,
      motionprVersion: "bench",
      generatedAt: "",
      project: "bench",
      mode: "comparison",
      baseline: b,
      candidate: k,
      comparison: result,
      notes: [],
    }),
  );
  await time(`  JSON.parse of the capture`, 5, () => JSON.parse(json));
  console.log();
}
for (const n of [600, 3000]) {
  const r = scroll(n);
  await time(`scrollMetrics, ${n} samples × 100 records`, 5, () => {
    for (let i = 0; i < 100; i++) scrollMetrics(r, config);
  });
}
