import { z } from "zod";
import { ASSET_FILE_PATTERN, ASSET_ID_PATTERN, diagnosticSchema } from "./capture.ts";

export const COMPARISON_SCHEMA_VERSION = 2;

export const severitySchema = z.enum(["critical", "warning", "info", "uncertain"]);
export type Severity = z.infer<typeof severitySchema>;

/**
 * How a value was obtained:
 * - `measured`: read directly from both captures (declared timing, sampled computed styles).
 * - `estimated`: derived with interpolation or tolerance (e.g. frame-quantized start times).
 * - `unsupported`: the comparison cannot be made for this animation type.
 * - `incomplete`: at least one side has partial capture data.
 */
export const measurementSchema = z.enum(["measured", "estimated", "unsupported", "incomplete"]);
export type Measurement = z.infer<typeof measurementSchema>;

export const changeKindSchema = z.enum([
  "duration",
  "delay",
  "end-delay",
  "start",
  "easing",
  "iterations",
  "direction",
  "playback-rate",
  "fill",
  "property-added",
  "property-removed",
  "keyframes",
  "trajectory",
  "opacity",
  "size",
  "type",
  "element-match",
  "completeness",
  // Scroll motion (see ScrollComparison)
  "scroll-start",
  "scroll-end",
  "scroll-target",
  "scroll-duration",
  "scroll-settle",
  "scroll-curve",
  "scroll-velocity",
  "scroll-overshoot",
  "scroll-direction",
  "scroll-lag",
  "scroll-config",
  /** Progress of a scroll-linked animation at the same scroll position. */
  "scroll-progress",
  // Timelines
  "timeline-duration",
  "timeline-iterations",
  "timeline-labels",
  "timeline-children",
  "timeline-playback-rate",
]);
export type ChangeKind = z.infer<typeof changeKindSchema>;

const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const changeSchema = z.object({
  kind: changeKindSchema,
  property: z.string().optional(),
  before: scalar,
  after: scalar,
  /** Numeric difference (after - before) when both sides are numeric. */
  delta: z.number().optional(),
  unit: z.string().optional(),
  measurement: measurementSchema,
  severity: severitySchema,
  message: z.string(),
  /** Which configured rule produced the severity, for traceability. */
  rule: z.string(),
});
export type Change = z.infer<typeof changeSchema>;

export const matchSchema = z.object({
  method: z.enum(["exact", "element", "fuzzy"]),
  confidence: z.enum(["high", "medium", "low"]),
  notes: z.array(z.string()),
});

export const animationComparisonSchema = z.object({
  key: z.string(),
  status: z.enum(["unchanged", "changed", "added", "removed"]),
  baselineId: z.string().nullable(),
  candidateId: z.string().nullable(),
  match: matchSchema.nullable(),
  changes: z.array(changeSchema),
  severity: severitySchema.nullable(),
  /** Easing curve analysis when both sides have comparable curves. */
  easing: z
    .object({
      baseline: z.string(),
      candidate: z.string(),
      maxDeviation: z.number(),
      maxDeviationAt: z.number(),
      meanDeviation: z.number(),
    })
    .nullable(),
});
export type AnimationComparison = z.infer<typeof animationComparisonSchema>;

export const visualComparisonSchema = z.object({
  status: z.enum(["identical", "within-threshold", "changed", "not-comparable", "skipped"]),
  mismatchPixels: z.number().int(),
  totalPixels: z.number().int(),
  mismatchRatio: z.number(),
  /** Per-pixel color threshold handed to pixelmatch (0..1). */
  pixelThreshold: z.number(),
  /** Ratio above which the checkpoint is reported as visually changed. */
  maxDiffRatio: z.number(),
  /** Asset id of the diff image (in the comparison asset table). */
  diffAsset: z.string().nullable(),
  ignoredRegions: z.number().int(),
  reason: z.string().optional(),
});
export type VisualComparison = z.infer<typeof visualComparisonSchema>;

export const frameDivergenceSchema = z.object({
  time: z.number(),
  ratio: z.number().nullable(),
});

export const staggerChangeSchema = z.object({
  group: z.string(),
  members: z.number().int(),
  baselineInterval: z.number(),
  candidateInterval: z.number(),
  delta: z.number(),
  severity: severitySchema,
});
export type StaggerChange = z.infer<typeof staggerChangeSchema>;

/** Metrics derived from one scroller's samples. Distances in px, times in ms. */
export const scrollMetricsSchema = z.object({
  samples: z.number().int(),
  axis: z.enum(["vertical", "horizontal"]),
  /** Rendered position when movement began and after it settled. */
  start: z.number(),
  end: z.number(),
  /** Final target position the engine was heading to. */
  target: z.number(),
  distance: z.number(),
  /** Window time of the first movement, and time from it until the scroller settled. */
  movementStart: z.number().nullable(),
  duration: z.number().nullable(),
  /** True when the scroller was still moving at the end of the window. */
  unsettled: z.boolean(),
  /** Highest absolute velocity derived from rendered positions, px per ms. */
  peakVelocity: z.number(),
  /** Time of the peak velocity relative to movement start (0..1 of duration). */
  peakVelocityAt: z.number().nullable(),
  /** Furthest travel past the final position in the direction of motion, px. */
  overshoot: z.number(),
  directionChanges: z.number().int(),
  /** Mean and max |animatedScroll − actualScroll| (smooth-scroll lag), px. */
  meanLag: z.number(),
  maxLag: z.number(),
  /** Normalized progress (0..1) at 33 evenly spaced points of the movement; null if no movement. */
  curve: z.array(z.number()).nullable(),
  /** Absolute velocity normalized to its peak at the same 33 points; null if no movement. */
  velocityCurve: z.array(z.number()).nullable(),
});
export type ScrollMetrics = z.infer<typeof scrollMetricsSchema>;

export const scrollComparisonSchema = z.object({
  key: z.string(),
  source: z.string(),
  status: z.enum(["unchanged", "changed", "added", "removed"]),
  baseline: scrollMetricsSchema.nullable(),
  candidate: scrollMetricsSchema.nullable(),
  /** Deviation between the normalized progress curves (0..1 of the distance). */
  curve: z
    .object({ maxDeviation: z.number(), maxDeviationAt: z.number(), meanDeviation: z.number() })
    .nullable(),
  changes: z.array(changeSchema),
  severity: severitySchema.nullable(),
});
export type ScrollComparison = z.infer<typeof scrollComparisonSchema>;

export const timelineComparisonSchema = z.object({
  key: z.string(),
  source: z.string(),
  status: z.enum(["unchanged", "changed", "added", "removed"]),
  changes: z.array(changeSchema),
  severity: severitySchema.nullable(),
});
export type TimelineComparison = z.infer<typeof timelineComparisonSchema>;

export const checkpointComparisonSchema = z.object({
  label: z.string(),
  status: z.enum(["unchanged", "changed", "added", "removed"]),
  baselineIndex: z.number().int().nullable(),
  candidateIndex: z.number().int().nullable(),
  animations: z.array(animationComparisonSchema),
  visual: visualComparisonSchema.nullable(),
  /** Pixel divergence between time-aligned filmstrip frames (null where not comparable). */
  frameDivergence: z.array(frameDivergenceSchema),
  stagger: z.array(staggerChangeSchema),
  /** Trigger-to-motion latency on both sides (ms), when both checkpoints were triggered. */
  latency: z.object({ baseline: z.number(), candidate: z.number(), delta: z.number() }).nullable(),
  scroll: z.array(scrollComparisonSchema),
  timelines: z.array(timelineComparisonSchema),
  severity: severitySchema.nullable(),
});
export type CheckpointComparison = z.infer<typeof checkpointComparisonSchema>;

export const scenarioComparisonSchema = z.object({
  key: z.string(),
  id: z.string(),
  name: z.string(),
  viewport: z.string(),
  status: z.enum(["unchanged", "changed", "added", "removed", "failed"]),
  baselineStatus: z.string().nullable(),
  candidateStatus: z.string().nullable(),
  checkpoints: z.array(checkpointComparisonSchema),
  severity: severitySchema.nullable(),
});
export type ScenarioComparison = z.infer<typeof scenarioComparisonSchema>;

export const differenceCategorySchema = z.enum([
  "added",
  "removed",
  "timing",
  "easing",
  "property",
  "visual",
  "scroll",
  "uncertain",
  "structure",
]);
export type DifferenceCategory = z.infer<typeof differenceCategorySchema>;

/** Flattened, report-friendly list entry; one per change worth reviewing. */
export const differenceSchema = z.object({
  id: z.string(),
  severity: severitySchema,
  category: differenceCategorySchema,
  scenarioKey: z.string(),
  checkpoint: z.string().nullable(),
  animationKey: z.string().nullable(),
  /** Scroll record key for scroll differences. */
  scrollKey: z.string().nullable().default(null),
  /** Engine that produced the compared records (`native`, `gsap`, `animejs`, `lenis`). */
  source: z.string().nullable().default(null),
  title: z.string(),
  detail: z.string(),
  measurement: measurementSchema,
  before: scalar.optional(),
  after: scalar.optional(),
  delta: z.number().optional(),
  unit: z.string().optional(),
});
export type Difference = z.infer<typeof differenceSchema>;

const captureRefSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  motionprVersion: z.string(),
  browser: z.string(),
  platform: z.string(),
  configHash: z.string(),
});

export const comparisonResultSchema = z.object({
  schemaVersion: z.literal(COMPARISON_SCHEMA_VERSION),
  kind: z.literal("motionpr-comparison"),
  motionprVersion: z.string(),
  createdAt: z.string(),
  baseline: captureRefSchema,
  candidate: captureRefSchema,
  failOn: z.enum(["critical", "warning", "info", "never"]),
  failOnUncertain: z.boolean(),
  summary: z.object({
    /** `failed` when a configured threshold was exceeded (CLI exit code 1). */
    status: z.enum(["passed", "failed"]),
    highestSeverity: severitySchema.nullable(),
    counts: z.object({
      critical: z.number().int(),
      warning: z.number().int(),
      info: z.number().int(),
      uncertain: z.number().int(),
    }),
    scenarios: z.object({
      total: z.number().int(),
      changed: z.number().int(),
      added: z.number().int(),
      removed: z.number().int(),
      failed: z.number().int(),
    }),
    animations: z.object({
      matched: z.number().int(),
      changed: z.number().int(),
      added: z.number().int(),
      removed: z.number().int(),
      unchanged: z.number().int(),
    }),
  }),
  scenarios: z.array(scenarioComparisonSchema),
  differences: z.array(differenceSchema),
  /** Assets produced by the comparison (diff images), relative to the comparison directory. */
  assets: z.record(
    z.string().regex(ASSET_ID_PATTERN, "invalid asset id"),
    z.object({
      file: z.string().regex(ASSET_FILE_PATTERN, "asset paths must be assets/<id>.(png|jpg)"),
      width: z.number(),
      height: z.number(),
    }),
  ),
  diagnostics: z.array(diagnosticSchema),
});
export type ComparisonResult = z.infer<typeof comparisonResultSchema>;

export const SEVERITY_ORDER: readonly Severity[] = ["critical", "warning", "info", "uncertain"];

/** Numeric rank used for thresholds: critical (3) > warning (2) > info (1). Uncertain ranks 0. */
export function severityRank(severity: Severity | null | undefined): number {
  switch (severity) {
    case "critical":
      return 3;
    case "warning":
      return 2;
    case "info":
      return 1;
    default:
      return 0;
  }
}

/** Returns the most severe of the given severities, preferring definite levels over `uncertain`. */
export function maxSeverity(values: Iterable<Severity | null | undefined>): Severity | null {
  let best: Severity | null = null;
  for (const v of values) {
    if (!v) continue;
    if (best === null || severityRank(v) > severityRank(best)) best = v;
  }
  return best;
}
