/**
 * Extracts the data the website's visualizations use from a REAL capture of the bundled demo app:
 * the baseline and candidate captures and their comparison, as written by
 * `pnpm demo:capture` (scripts/generate-demo.ts → .tmp/demo-capture/{baseline,candidate,comparison}).
 *
 *   pnpm --filter @motionpr/docs data [--from <dir>]      (default: ../../.tmp/demo-capture)
 *
 * Output: apps/docs/data/site-data.json (committed, so building the site needs no browser).
 * Nothing in it is invented: records are trimmed and rounded, never edited.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readCaptureBundle,
  readComparisonResult,
  resolveConfig,
  type AnimationRecord,
  type CaptureBundle,
  type Checkpoint,
} from "@motionpr/core";
import { DEMO_SCENARIOS } from "../../../packages/cli/src/demo/config.ts";

const here = fileURLToPath(new URL(".", import.meta.url));
const root = resolve(here, "../../..");
const args = process.argv.slice(2);
const fromArg = args.indexOf("--from");
const from = resolve(fromArg >= 0 ? args[fromArg + 1]! : join(root, ".tmp/demo-capture"));
const out = resolve(here, "../data/site-data.json");

const baseline = await readCaptureBundle(join(from, "baseline"));
const candidate = await readCaptureBundle(join(from, "candidate"));
const comparison = await readComparisonResult(join(from, "comparison"));
const defaults = resolveConfig({
  baseURL: "http://localhost/",
  scenarios: [{ id: "x", steps: [{ type: "capture", label: "x" }] }],
}).comparison;

const r4 = (n: number | null | undefined) =>
  n === null || n === undefined ? null : Math.round(n * 1e4) / 1e4;
const r2 = (n: number | null | undefined) =>
  n === null || n === undefined ? null : Math.round(n * 100) / 100;

/** Numeric channels that actually vary across an animation's samples. */
const CHANNELS = ["translateX", "translateY", "scaleX", "scaleY", "rotate", "opacity"] as const;
function channelsOf(records: (AnimationRecord | undefined)[]): string[] {
  const out = new Set<string>();
  for (const r of records) {
    if (!r) continue;
    for (const ch of CHANNELS) {
      const values = r.samples
        .map((s) => s.numeric[ch])
        .filter((v): v is number => typeof v === "number");
      if (values.length && Math.max(...values) - Math.min(...values) > 1e-3) out.add(ch);
    }
  }
  return [...out];
}

function side(r: AnimationRecord | undefined, channels: string[]) {
  if (!r) return null;
  const t = r.timing;
  return {
    id: r.id,
    start: r2(r.startTime),
    duration: r2(t.duration),
    delay: r2(t.delay),
    iterations: t.iterations,
    direction: t.direction,
    playbackRate: t.playbackRate,
    easing: {
      value: t.effectiveEasing.value,
      kind: t.effectiveEasing.kind,
      samples: (t.effectiveEasing.samples ?? []).map((v) => r4(v)),
    },
    properties: r.properties.map((p) => ({ property: p.property, from: p.from, to: p.to })),
    samples: r.samples.map((s) => [
      r2(s.windowTime),
      r4(s.progress),
      ...channels.map((ch) => r4((s.numeric as Record<string, number | undefined>)[ch] ?? null)),
    ]),
    completeness: r.completeness.status,
  };
}

function shortLabel(r: AnimationRecord): string {
  const el = r.element.key.replace(/^(motionpr-id|test-id|id|aria):/, "");
  const element = el.startsWith("path:") ? "glow (no id)" : el;
  return r.name && r.type !== "css-transition"
    ? `${element} · ${r.name}`
    : `${element} · ${r.properties.map((p) => p.property).join(", ")}`;
}

function checkpoint(
  bundle: CaptureBundle,
  scenarioKey: string,
  label: string,
): Checkpoint | undefined {
  return bundle.scenarios
    .find((s) => s.key === scenarioKey)
    ?.checkpoints.find((c) => c.label === label);
}

const datasets: Record<string, unknown> = {};
for (const sc of comparison.scenarios) {
  for (const cpc of sc.checkpoints) {
    const cb = checkpoint(baseline, sc.key, cpc.label);
    const cc = checkpoint(candidate, sc.key, cpc.label);
    if (!cb || !cc) continue;
    const byIdB = new Map(cb.animations.map((a) => [a.id, a]));
    const byIdC = new Map(cc.animations.map((a) => [a.id, a]));
    const tracks = cpc.animations.map((ac) => {
      const b = ac.baselineId ? byIdB.get(ac.baselineId) : undefined;
      const c = ac.candidateId ? byIdC.get(ac.candidateId) : undefined;
      const any = (b ?? c)!;
      const channels = channelsOf([b, c]);
      return {
        key: ac.key,
        label: shortLabel(any),
        type: any.type,
        source: any.source,
        element: any.element.key,
        confidence: any.element.confidence,
        status: ac.status,
        severity: ac.severity,
        match: ac.match?.method ?? null,
        channels,
        baseline: side(b, channels),
        candidate: side(c, channels),
        changes: ac.changes.map((ch) => ({
          kind: ch.kind,
          rule: ch.rule,
          severity: ch.severity,
          measurement: ch.measurement,
          message: ch.message,
        })),
        easing: ac.easing,
      };
    });
    const timeline = (cp: Checkpoint) =>
      cp.timelines.map((t) => ({
        id: t.id,
        name: t.name,
        start: r2(t.startTime),
        duration: r2(t.duration),
        labels: t.labels.map((l) => ({ name: l.name, time: r2(l.time) })),
        children: t.children,
      }));
    const scroll = (cp: Checkpoint) =>
      cp.scrollMotion.map((s) => ({
        id: s.id,
        source: s.source,
        axis: s.axis,
        config: s.config,
        prefersReducedMotion: s.prefersReducedMotion,
        events: s.events,
        completeness: s.completeness,
        // Full records (rounded) so the browser can run MotionPR's own scrollMetrics on them.
        samples: s.samples.map((x) => ({
          time: r2(x.time),
          actualScroll: r2(x.actualScroll),
          animatedScroll: r2(x.animatedScroll),
          targetScroll: r2(x.targetScroll),
          progress: r4(x.progress),
          velocity: r4(x.velocity),
          direction: x.direction,
          isScrolling: x.isScrolling,
          isStopped: x.isStopped,
          limit: r2(x.limit),
        })),
      }));
    const key = `${sc.id}/${cpc.label}`;
    datasets[key] = {
      scenario: sc.key,
      id: sc.id,
      name: sc.name,
      checkpoint: cpc.label,
      severity: cpc.severity,
      window: { baseline: r2(cb.window.end), candidate: r2(cc.window.end) },
      latency: { baseline: r2(cb.window.latency), candidate: r2(cc.window.latency) },
      tracks,
      stagger: cpc.stagger,
      timelines: {
        baseline: timeline(cb),
        candidate: timeline(cc),
        changes: cpc.timelines.flatMap((t) =>
          t.changes.map((ch) => ({ severity: ch.severity, message: ch.message })),
        ),
      },
      scroll: {
        baseline: scroll(cb),
        candidate: scroll(cc),
        comparisons: cpc.scroll.map((s) => ({
          key: s.key,
          source: s.source,
          status: s.status,
          severity: s.severity,
          curve: s.curve,
          changes: s.changes.map((ch) => ({
            kind: ch.kind,
            severity: ch.severity,
            message: ch.message,
          })),
        })),
      },
    };
  }
}

// One complete, untrimmed record: the template the playground modifies before handing pairs to
// MotionPR's comparison engine in the browser.
const navOpen = checkpoint(baseline, "navigation@default", "open")!;
const template = navOpen.animations.find((a) => a.element.key === "motionpr-id:nav-panel")!;

const data = {
  source: {
    description:
      "Real captures of the bundled demo app (fixtures/demo-app, baseline and candidate variants), compared by MotionPR.",
    motionprVersion: comparison.motionprVersion,
    createdAt: comparison.createdAt,
    browser: `${baseline.environment.browser.name} ${baseline.environment.browser.version}`,
    platform: `${baseline.environment.platform}-${baseline.environment.arch}`,
    regenerate: "pnpm build && pnpm demo:capture && pnpm --filter @motionpr/docs data",
  },
  comparisonConfig: defaults,
  summary: comparison.summary,
  scenarios: comparison.scenarios.map((s) => ({
    key: s.key,
    id: s.id,
    name: s.name,
    status: s.status,
    severity: s.severity,
    checkpoints: s.checkpoints.map((c) => c.label),
    // The scenario's real steps (packages/cli/src/demo/config.ts), replayed by the demo page.
    steps: DEMO_SCENARIOS.find((d) => d.id === s.id)?.steps ?? [],
  })),
  differences: comparison.differences.map((d) => ({
    id: d.id,
    severity: d.severity,
    category: d.category,
    scenario: d.scenarioKey,
    checkpoint: d.checkpoint,
    source: d.source,
    title: d.title,
    detail: d.detail,
    measurement: d.measurement,
    before: d.before ?? null,
    after: d.after ?? null,
    delta: d.delta ?? null,
    unit: d.unit ?? null,
  })),
  datasets,
  template,
};

await mkdir(resolve(here, "../data"), { recursive: true });
await writeFile(out, `${JSON.stringify(data)}\n`);
console.log(
  `site data: ${Object.keys(datasets).length} checkpoints, ${data.differences.length} differences, ${(JSON.stringify(data).length / 1024).toFixed(0)} kB → ${out}`,
);
