import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  COMPARISON_SCHEMA_VERSION,
  MOTIONPR_VERSION,
  contentId,
  maxSeverity,
  severityRank,
  writeComparisonResult,
  type AnimationComparison,
  type AnimationRecord,
  type CaptureBundle,
  type Change,
  type Checkpoint,
  type CheckpointComparison,
  type ComparisonConfig,
  type ComparisonResult,
  type Diagnostic,
  type Difference,
  type DifferenceCategory,
  type ScenarioComparison,
  type ScenarioResult,
  type Severity,
} from "@motionpr/core";
import { compareMatchedAnimation } from "./diff-animation.ts";
import { matchAnimations } from "./match.ts";
import { applyOverride, capSeverity, finalizeChanges, timingSeverity } from "./severity.ts";
import { compareScrollRecords } from "./scroll.ts";
import { scrollLinkedChange } from "./scroll-linked.ts";
import { compareStagger } from "./stagger.ts";
import { compareTimelineRecords } from "./timelines.ts";
import { PngCache, compareScreenshots, frameDivergence, type ImageSource } from "./visual.ts";

export interface CompareOptions {
  baseline: ImageSource;
  candidate: ImageSource;
  config: ComparisonConfig;
  /** Directory for comparison output (comparison.json + assets/ with diff images). */
  outputDir?: string;
}

const CATEGORY: Record<Change["kind"], DifferenceCategory> = {
  duration: "timing",
  delay: "timing",
  "end-delay": "timing",
  start: "timing",
  iterations: "timing",
  direction: "timing",
  "playback-rate": "timing",
  fill: "timing",
  easing: "easing",
  "property-added": "property",
  "property-removed": "property",
  keyframes: "property",
  trajectory: "property",
  opacity: "property",
  size: "property",
  type: "structure",
  "element-match": "uncertain",
  completeness: "uncertain",
  "scroll-start": "scroll",
  "scroll-end": "scroll",
  "scroll-target": "scroll",
  "scroll-duration": "scroll",
  "scroll-settle": "scroll",
  "scroll-curve": "scroll",
  "scroll-velocity": "scroll",
  "scroll-overshoot": "scroll",
  "scroll-direction": "scroll",
  "scroll-lag": "scroll",
  "scroll-config": "scroll",
  "scroll-progress": "scroll",
  "timeline-duration": "timing",
  "timeline-iterations": "timing",
  "timeline-labels": "timing",
  "timeline-children": "structure",
  "timeline-playback-rate": "timing",
};

const SOURCE_LABEL: Record<string, string> = {
  native: "native",
  gsap: "GSAP",
  animejs: "Anime.js",
  lenis: "Lenis",
};

/** Prefers explicit ids (what developers search for) over visible text. */
export function elementName(r: AnimationRecord): string {
  const e = r.element;
  if (e.method === "motionpr-id" || e.method === "test-id" || e.method === "dom-id")
    return e.key.slice(e.key.indexOf(":") + 1);
  return e.label ? `“${e.label}”` : e.key;
}

function describeElement(r: AnimationRecord): string {
  return `${r.type} ${r.name ? `“${r.name}” ` : ""}on ${elementName(r)}`;
}

function animationSummary(r: AnimationRecord): string {
  const t = r.timing;
  return `${t.duration ?? "?"}ms, delay ${t.delay}ms, ${t.effectiveEasing.value}, ${r.properties.map((p) => p.property).join(", ")}`;
}

type DifferenceInput = Omit<Difference, "id" | "scrollKey" | "source"> &
  Partial<Pick<Difference, "scrollKey" | "source">>;

class DifferenceList {
  readonly items: Difference[] = [];
  readonly #ids = new Map<string, number>();

  add(input: DifferenceInput): void {
    const d: Omit<Difference, "id"> = { scrollKey: null, source: null, ...input };
    const base = [
      d.scenarioKey,
      d.checkpoint ?? "",
      d.animationKey ?? "",
      d.category,
      d.title,
    ].join("|");
    const n = (this.#ids.get(base) ?? 0) + 1;
    this.#ids.set(base, n);
    this.items.push({
      id: `d${contentId(new TextEncoder().encode(`${base}#${n}`)).slice(0, 12)}`,
      ...d,
    });
  }
}

function lowConfidenceSeverity(
  r: AnimationRecord,
  computed: Severity,
  config: ComparisonConfig,
): Severity {
  return config.uncertainOnLowConfidence && r.element.confidence === "low" ? "uncertain" : computed;
}

async function compareCheckpoint(
  scenarioKey: string,
  b: Checkpoint,
  c: Checkpoint,
  ctx: {
    options: CompareOptions;
    cache: PngCache;
    diffs: DifferenceList;
    assets: ComparisonResult["assets"];
    scale: number;
  },
): Promise<CheckpointComparison> {
  const { config } = ctx.options;
  const { matches, removed, added } = matchAnimations(b.animations, c.animations);
  const animations: AnimationComparison[] = [];

  for (const m of matches) {
    const cmp = compareMatchedAnimation(m, config);
    const linked = scrollLinkedChange(
      m.baseline,
      m.candidate,
      b.scrollMotion,
      c.scrollMotion,
      config,
    );
    if (linked) {
      const [change] = finalizeChanges([linked], config, null);
      if (change) {
        cmp.changes.push(change);
        cmp.status = "changed";
        cmp.severity = maxSeverity([cmp.severity, change.severity]);
      }
    }
    animations.push(cmp);
    for (const ch of cmp.changes) {
      ctx.diffs.add({
        severity: ch.severity,
        category: CATEGORY[ch.kind],
        scenarioKey,
        checkpoint: b.label,
        animationKey: cmp.key,
        source: m.candidate.source,
        title: `${describeElement(m.candidate)}: ${ch.message}`,
        detail: ch.message,
        measurement: ch.measurement,
        before: ch.before,
        after: ch.after,
        ...(ch.delta !== undefined ? { delta: ch.delta } : {}),
        ...(ch.unit ? { unit: ch.unit } : {}),
      });
    }
  }
  for (const r of removed) {
    const severity = applyOverride(
      "animation-removed",
      lowConfidenceSeverity(r, "critical", config),
      config,
    );
    animations.push({
      key: r.id,
      status: "removed",
      baselineId: r.id,
      candidateId: null,
      match: null,
      changes: [],
      severity,
      easing: null,
    });
    if (severity) {
      ctx.diffs.add({
        severity,
        category: "removed",
        scenarioKey,
        checkpoint: b.label,
        animationKey: r.id,
        source: r.source,
        title: `Removed: ${describeElement(r)}`,
        detail: `This animation no longer runs (${animationSummary(r)}).${r.element.confidence === "low" ? " The element is identified by DOM position, so it may have moved rather than disappeared." : ""}`,
        measurement: "measured",
      });
    }
  }
  for (const r of added) {
    const severity = applyOverride(
      "animation-added",
      lowConfidenceSeverity(r, "warning", config),
      config,
    );
    animations.push({
      key: r.id,
      status: "added",
      baselineId: null,
      candidateId: r.id,
      match: null,
      changes: [],
      severity,
      easing: null,
    });
    if (severity) {
      ctx.diffs.add({
        severity,
        category: "added",
        scenarioKey,
        checkpoint: b.label,
        animationKey: r.id,
        source: r.source,
        title: `Added: ${describeElement(r)}`,
        detail: `New animation (${animationSummary(r)}).`,
        measurement: "measured",
      });
    }
  }

  // Visual comparison of the settled state and per-frame divergence.
  const { visual, diffPng } = await compareScreenshots(
    ctx.cache,
    ctx.options.baseline,
    ctx.options.candidate,
    b.screenshot,
    c.screenshot,
    config,
    ctx.scale,
  );
  if (diffPng && ctx.options.outputDir) {
    const id = `${contentId(diffPng)}.png`;
    const file = `assets/${id}`;
    await mkdir(join(ctx.options.outputDir, "assets"), { recursive: true });
    await writeFile(join(ctx.options.outputDir, file), diffPng);
    const asset = ctx.options.candidate.bundle.assets[c.screenshot!];
    ctx.assets[id] = { file, width: asset?.width ?? 0, height: asset?.height ?? 0 };
    visual.diffAsset = id;
  }
  if (visual.status === "changed") {
    const severity = applyOverride("visual", "warning", config);
    if (severity) {
      ctx.diffs.add({
        severity,
        category: "visual",
        scenarioKey,
        checkpoint: b.label,
        animationKey: null,
        title: `Settled frame differs by ${(visual.mismatchRatio * 100).toFixed(2)}% of pixels`,
        detail: `${visual.mismatchPixels.toLocaleString("en-US")} of ${visual.totalPixels.toLocaleString("en-US")} pixels differ (threshold ${(config.visual.maxDiffRatio * 100).toFixed(2)}%). Font rendering, browser versions and OS can contribute to pixel differences.`,
        measurement: "measured",
        before: 0,
        after: visual.mismatchRatio,
      });
    }
  }
  const divergence = await frameDivergence(
    ctx.cache,
    ctx.options.baseline,
    ctx.options.candidate,
    b.frames,
    c.frames,
    config,
  );

  const stagger = compareStagger(b.animations, c.animations, config);
  for (const s of stagger) {
    ctx.diffs.add({
      severity: s.severity,
      category: "timing",
      scenarioKey,
      checkpoint: b.label,
      animationKey: null,
      title: `Stagger interval ${s.baselineInterval}ms → ${s.candidateInterval}ms across ${s.members} elements`,
      detail: `Consecutive elements in this group now start ${Math.abs(s.delta)}ms ${s.delta > 0 ? "further apart" : "closer together"}.`,
      measurement: "measured",
      before: s.baselineInterval,
      after: s.candidateInterval,
      delta: s.delta,
      unit: "ms",
    });
  }

  // Scroll motion: compared by its own metrics, never by animation rules.
  const scroll = compareScrollRecords(b.scrollMotion, c.scrollMotion, config);
  for (const sc of scroll) {
    const engine = SOURCE_LABEL[sc.source] ?? sc.source;
    if (sc.status === "removed" || sc.status === "added") {
      const metrics = sc.baseline ?? sc.candidate;
      const moved = metrics?.duration !== null && metrics?.duration !== undefined;
      const rule = sc.status === "removed" ? "scroll-removed" : "scroll-added";
      const severity = applyOverride(
        rule,
        moved ? (sc.status === "removed" ? "critical" : "warning") : "info",
        config,
      );
      sc.severity = severity;
      if (severity)
        ctx.diffs.add({
          severity,
          category: "scroll",
          scenarioKey,
          checkpoint: b.label,
          animationKey: null,
          scrollKey: sc.key,
          source: sc.source,
          title:
            sc.status === "removed"
              ? `${engine} scroll motion no longer recorded (${sc.key})`
              : `New ${engine} scroll motion (${sc.key})`,
          detail:
            sc.status === "removed"
              ? `The baseline recorded this scroller${moved ? ` moving ${Math.round(Math.abs(metrics!.distance))}px` : ""}; the candidate did not.`
              : `The candidate recorded this scroller${moved ? ` moving ${Math.round(Math.abs(metrics!.distance))}px` : ""}; the baseline did not.`,
          measurement: "measured",
        });
      continue;
    }
    for (const ch of sc.changes) {
      ctx.diffs.add({
        severity: ch.severity,
        category: CATEGORY[ch.kind],
        scenarioKey,
        checkpoint: b.label,
        animationKey: null,
        scrollKey: sc.key,
        source: sc.source,
        title: `${engine} scroll: ${ch.message}`,
        detail: ch.message,
        measurement: ch.measurement,
        before: ch.before,
        after: ch.after,
        ...(ch.delta !== undefined ? { delta: ch.delta } : {}),
        ...(ch.unit ? { unit: ch.unit } : {}),
      });
    }
  }

  const timelines = compareTimelineRecords(b.timelines, c.timelines, config);
  for (const tl of timelines) {
    const engine = SOURCE_LABEL[tl.source] ?? tl.source;
    const shown = `“${tl.key.startsWith(`${tl.source}:`) ? tl.key.slice(tl.source.length + 1) : tl.key}”`;
    if (tl.status === "removed" || tl.status === "added") {
      const severity = applyOverride(
        "timeline",
        tl.status === "removed" ? "warning" : "info",
        config,
      );
      tl.severity = severity;
      if (severity)
        ctx.diffs.add({
          severity,
          category: tl.status,
          scenarioKey,
          checkpoint: b.label,
          animationKey: null,
          source: tl.source,
          title: `${tl.status === "removed" ? "Timeline removed" : "New timeline"}: ${engine} ${shown}`,
          detail:
            tl.status === "removed"
              ? "This timeline ran in the baseline but not in the candidate. Its animations are listed separately."
              : "This timeline ran in the candidate but not in the baseline.",
          measurement: "measured",
        });
      continue;
    }
    for (const ch of tl.changes)
      ctx.diffs.add({
        severity: ch.severity,
        category: CATEGORY[ch.kind],
        scenarioKey,
        checkpoint: b.label,
        animationKey: null,
        source: tl.source,
        title: `${engine} timeline ${shown}: ${ch.message}`,
        detail: ch.message,
        measurement: ch.measurement,
        before: ch.before,
        after: ch.after,
        ...(ch.delta !== undefined ? { delta: ch.delta } : {}),
        ...(ch.unit ? { unit: ch.unit } : {}),
      });
  }

  let latency: CheckpointComparison["latency"] = null;
  if (b.window.latency !== null && c.window.latency !== null) {
    const delta = Math.round((c.window.latency - b.window.latency) * 10) / 10;
    latency = { baseline: b.window.latency, candidate: c.window.latency, delta };
    const computed = timingSeverity(
      b.window.latency,
      c.window.latency,
      config,
      config.timing.startToleranceMs,
    );
    const severity = computed
      ? applyOverride("start", capSeverity(computed, "warning"), config)
      : null;
    if (severity) {
      ctx.diffs.add({
        severity,
        category: "timing",
        scenarioKey,
        checkpoint: b.label,
        animationKey: null,
        title: `Motion begins ${Math.abs(delta)}ms ${delta > 0 ? "later" : "sooner"} after the interaction`,
        detail: `Trigger-to-motion latency ${Math.round(b.window.latency)}ms → ${Math.round(c.window.latency)}ms (estimated; includes frame scheduling).`,
        measurement: "estimated",
        before: b.window.latency,
        after: c.window.latency,
        delta,
        unit: "ms",
      });
    }
  }

  const severities: (Severity | null)[] = [
    ...animations.map((a) => a.severity),
    ...stagger.map((s) => s.severity),
    ...scroll.map((s) => s.severity),
    ...timelines.map((t) => t.severity),
    visual.status === "changed" ? applyOverride("visual", "warning", config) : null,
  ];
  const severity = maxSeverity(severities);
  const changed =
    animations.some((a) => a.status !== "unchanged") ||
    scroll.some((s) => s.status !== "unchanged") ||
    timelines.some((t) => t.status !== "unchanged") ||
    stagger.length > 0 ||
    visual.status === "changed";
  return {
    label: b.label,
    status: changed ? "changed" : "unchanged",
    baselineIndex: b.index,
    candidateIndex: c.index,
    animations,
    visual,
    frameDivergence: divergence,
    stagger,
    latency,
    scroll,
    timelines,
    severity,
  };
}

function environmentDiagnostics(b: CaptureBundle, c: CaptureBundle): Diagnostic[] {
  const out: Diagnostic[] = [];
  const be = b.environment;
  const ce = c.environment;
  if (be.browser.version !== ce.browser.version) {
    out.push({
      level: "warning",
      code: "BROWSER_VERSION_DIFFERS",
      message: `Browser versions differ (${be.browser.version} vs ${ce.browser.version}).`,
      hint: "Pixel comparisons may include rendering differences; animation timing data is unaffected.",
    });
  }
  if (be.platform !== ce.platform) {
    out.push({
      level: "warning",
      code: "PLATFORM_DIFFERS",
      message: `Captures come from different platforms (${be.platform} vs ${ce.platform}).`,
      hint: "Fonts render differently across operating systems. Capture the baseline where CI runs.",
    });
  }
  if (b.configHash !== c.configHash) {
    out.push({
      level: "info",
      code: "CONFIG_DIFFERS",
      message: "The capture configuration changed between baseline and candidate.",
    });
  }
  if (b.settings.samples !== c.settings.samples) {
    out.push({
      level: "info",
      code: "SAMPLE_COUNT_DIFFERS",
      message: `Sample counts differ (${b.settings.samples} vs ${c.settings.samples}); path comparisons use endpoints only.`,
    });
  }
  return out;
}

/** Compares two capture bundles. Pure apart from writing diff images when `outputDir` is set. */
export async function compareCaptures(options: CompareOptions): Promise<ComparisonResult> {
  const { config } = options;
  const b = options.baseline.bundle;
  const c = options.candidate.bundle;
  const diffs = new DifferenceList();
  const cache = new PngCache();
  const assets: ComparisonResult["assets"] = {};
  const scenarios: ScenarioComparison[] = [];
  const cByKey = new Map(c.scenarios.map((s) => [s.key, s]));
  const bKeys = new Set(b.scenarios.map((s) => s.key));

  const structural = (
    scenarioKey: string,
    rule: Parameters<typeof applyOverride>[0],
    computed: Severity,
    title: string,
    detail: string,
    checkpoint: string | null = null,
  ) => {
    const severity = applyOverride(rule, computed, config);
    if (severity)
      diffs.add({
        severity,
        category: rule.endsWith("added")
          ? "added"
          : rule.endsWith("removed")
            ? "removed"
            : "structure",
        scenarioKey,
        checkpoint,
        animationKey: null,
        title,
        detail,
        measurement: "measured",
      });
    return severity;
  };

  for (const sb of b.scenarios) {
    const sc = cByKey.get(sb.key);
    if (!sc) {
      const severity = structural(
        sb.key,
        "scenario-removed",
        "critical",
        `Scenario removed: ${sb.name}`,
        "The scenario is in the baseline but was not captured.",
      );
      scenarios.push({
        key: sb.key,
        id: sb.id,
        name: sb.name,
        viewport: sb.viewport.name,
        status: "removed",
        baselineStatus: sb.status,
        candidateStatus: null,
        checkpoints: [],
        severity,
      });
      continue;
    }
    if (sc.status === "failed") {
      const severity = structural(
        sb.key,
        "scenario-failed",
        "critical",
        `Scenario failed: ${sc.name}`,
        sc.error?.message ?? "The scenario failed during capture.",
      );
      scenarios.push({
        key: sb.key,
        id: sb.id,
        name: sc.name,
        viewport: sc.viewport.name,
        status: "failed",
        baselineStatus: sb.status,
        candidateStatus: sc.status,
        checkpoints: [],
        severity,
      });
      continue;
    }
    const checkpoints = await compareScenarioCheckpoints(sb, sc, {
      options,
      cache,
      diffs,
      assets,
      structural,
    });
    const severity = maxSeverity(checkpoints.map((cp) => cp.severity));
    const changed = checkpoints.some((cp) => cp.status !== "unchanged");
    scenarios.push({
      key: sb.key,
      id: sb.id,
      name: sc.name,
      viewport: sc.viewport.name,
      status: changed ? "changed" : "unchanged",
      baselineStatus: sb.status,
      candidateStatus: sc.status,
      checkpoints,
      severity,
    });
  }
  for (const sc of c.scenarios) {
    if (bKeys.has(sc.key)) continue;
    const severity = structural(
      sc.key,
      "scenario-added",
      "info",
      `New scenario: ${sc.name}`,
      "Not present in the baseline; accept a new baseline to start tracking it.",
    );
    scenarios.push({
      key: sc.key,
      id: sc.id,
      name: sc.name,
      viewport: sc.viewport.name,
      status: "added",
      baselineStatus: null,
      candidateStatus: sc.status,
      checkpoints: [],
      severity,
    });
  }

  const counts = { critical: 0, warning: 0, info: 0, uncertain: 0 };
  for (const d of diffs.items) counts[d.severity]++;
  const highest = maxSeverity(diffs.items.map((d) => d.severity));
  const failRank =
    config.failOn === "never" ? Number.POSITIVE_INFINITY : severityRank(config.failOn);
  const failed =
    diffs.items.some((d) => severityRank(d.severity) >= failRank && d.severity !== "uncertain") ||
    (config.failOnUncertain && counts.uncertain > 0);
  const allAnimations = scenarios.flatMap((s) => s.checkpoints.flatMap((cp) => cp.animations));
  const ref = (bundle: CaptureBundle) => ({
    id: bundle.id,
    createdAt: bundle.createdAt,
    motionprVersion: bundle.motionprVersion,
    browser: `${bundle.environment.browser.name} ${bundle.environment.browser.version}`,
    platform: `${bundle.environment.platform}-${bundle.environment.arch}`,
    configHash: bundle.configHash,
  });

  const order: Record<Severity, number> = { critical: 0, warning: 1, uncertain: 2, info: 3 };
  const differences = [...diffs.items].sort((x, y) => order[x.severity] - order[y.severity]);
  const result: ComparisonResult = {
    schemaVersion: COMPARISON_SCHEMA_VERSION,
    kind: "motionpr-comparison",
    motionprVersion: MOTIONPR_VERSION,
    createdAt: new Date().toISOString(),
    baseline: ref(b),
    candidate: ref(c),
    failOn: config.failOn,
    failOnUncertain: config.failOnUncertain,
    summary: {
      status: failed ? "failed" : "passed",
      highestSeverity: highest,
      counts,
      scenarios: {
        total: scenarios.length,
        changed: scenarios.filter((s) => s.status === "changed").length,
        added: scenarios.filter((s) => s.status === "added").length,
        removed: scenarios.filter((s) => s.status === "removed").length,
        failed: scenarios.filter((s) => s.status === "failed").length,
      },
      animations: {
        matched: allAnimations.filter((a) => a.match !== null).length,
        changed: allAnimations.filter((a) => a.status === "changed").length,
        added: allAnimations.filter((a) => a.status === "added").length,
        removed: allAnimations.filter((a) => a.status === "removed").length,
        unchanged: allAnimations.filter((a) => a.status === "unchanged").length,
      },
    },
    scenarios,
    differences,
    assets,
    diagnostics: environmentDiagnostics(b, c),
  };
  if (options.outputDir) await writeComparisonResult(options.outputDir, result);
  return result;
}

async function compareScenarioCheckpoints(
  sb: ScenarioResult,
  sc: ScenarioResult,
  ctx: {
    options: CompareOptions;
    cache: PngCache;
    diffs: DifferenceList;
    assets: ComparisonResult["assets"];
    structural: (
      key: string,
      rule: "checkpoint-added" | "checkpoint-removed",
      computed: Severity,
      title: string,
      detail: string,
      checkpoint: string,
    ) => Severity | null;
  },
): Promise<CheckpointComparison[]> {
  const out: CheckpointComparison[] = [];
  const cByLabel = new Map(sc.checkpoints.map((cp) => [cp.label, cp]));
  const bLabels = new Set(sb.checkpoints.map((cp) => cp.label));
  for (const cb of sb.checkpoints) {
    const cc = cByLabel.get(cb.label);
    if (!cc) {
      const severity = ctx.structural(
        sb.key,
        "checkpoint-removed",
        "critical",
        `Checkpoint “${cb.label}” missing`,
        "The candidate run did not reach this checkpoint.",
        cb.label,
      );
      out.push({
        label: cb.label,
        status: "removed",
        baselineIndex: cb.index,
        candidateIndex: null,
        animations: [],
        visual: null,
        frameDivergence: [],
        stagger: [],
        latency: null,
        scroll: [],
        timelines: [],
        severity,
      });
      continue;
    }
    out.push(
      await compareCheckpoint(sb.key, cb, cc, { ...ctx, scale: sc.viewport.deviceScaleFactor }),
    );
  }
  for (const cc of sc.checkpoints) {
    if (bLabels.has(cc.label)) continue;
    const severity = ctx.structural(
      sb.key,
      "checkpoint-added",
      "warning",
      `New checkpoint “${cc.label}”`,
      "This checkpoint is not in the baseline.",
      cc.label,
    );
    out.push({
      label: cc.label,
      status: "added",
      baselineIndex: null,
      candidateIndex: cc.index,
      animations: [],
      visual: null,
      frameDivergence: [],
      stagger: [],
      latency: null,
      scroll: [],
      timelines: [],
      severity,
    });
  }
  return out;
}

/**
 * CLI exit code for a comparison: 0 within thresholds, 1 when a configured threshold was exceeded.
 * (Exit code 2 is reserved for configuration/execution errors and set by the CLI.)
 */
export function exitCodeFor(result: Pick<ComparisonResult, "summary">): 0 | 1 {
  return result.summary.status === "failed" ? 1 : 0;
}
