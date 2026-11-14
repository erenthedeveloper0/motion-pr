import type {
  AnimationComparison,
  AnimationRecord,
  Asset,
  CaptureBundle,
  Checkpoint,
  CheckpointComparison,
  Difference,
  FilmstripFrame,
  MotionCorrelation,
  ReportData,
  ScenarioComparison,
  ScenarioResult,
  ScrollComparison,
  ScrollMotionRecord,
  Severity,
  TimelineComparison,
  TimelineRecord,
} from "@motionpr/core";
import { animationInterval, interpolateSamples } from "@motionpr/core/timeline";

export type Side = "baseline" | "candidate";
export type TrackStatus = "unchanged" | "changed" | "added" | "removed" | "captured";
export type ScenarioStatus = ScenarioComparison["status"] | "passed" | "captured";
export type Completeness = AnimationRecord["completeness"]["status"];

/**
 * Engines a record can come from. Used for labels and the engine filter; derived from the
 * record's `source` and `driver`, never guessed from property names.
 */
export type EngineKey = "css" | "waapi" | "gsap" | "animejs" | "lenis" | "native-scroll" | "custom";

export const ENGINE_LABEL: Record<EngineKey, string> = {
  css: "Native CSS",
  waapi: "WAAPI",
  gsap: "GSAP",
  animejs: "Anime.js",
  lenis: "Lenis",
  "native-scroll": "Native scroll",
  custom: "Custom adapter",
};

export function engineOf(r: Pick<AnimationRecord, "source" | "driver" | "type">): EngineKey {
  if (r.source === "gsap") return "gsap";
  if (r.source === "animejs") return "animejs";
  if (r.source === "native") return r.driver === "css" ? "css" : "waapi";
  return "custom";
}

export function scrollEngineOf(r: Pick<ScrollMotionRecord, "source">): EngineKey {
  return r.source === "lenis" ? "lenis" : "native-scroll";
}

/** Maps a difference's `source` to an engine (scroll differences carry `scrollKey`). */
export function differenceEngine(d: Difference): EngineKey | null {
  if (d.scrollKey) return d.source === "lenis" ? "lenis" : "native-scroll";
  if (d.source === "gsap" || d.source === "animejs") return d.source;
  if (d.source === "native") return null; // css vs waapi is decided by the record
  return d.source ? "custom" : null;
}

export interface TrackView {
  key: string;
  label: string;
  detail: string;
  engine: EngineKey;
  baseline: AnimationRecord | null;
  candidate: AnimationRecord | null;
  comparison: AnimationComparison | null;
  status: TrackStatus;
  severity: Severity | null;
  completeness: Completeness;
  lowConfidence: boolean;
}

export interface ScrollTrackView {
  /** `scroll:<record id>`; shares the selection state with animation tracks. */
  key: string;
  id: string;
  label: string;
  detail: string;
  engine: EngineKey;
  baseline: ScrollMotionRecord | null;
  candidate: ScrollMotionRecord | null;
  comparison: ScrollComparison | null;
  status: TrackStatus;
  severity: Severity | null;
}

export interface TimelineView {
  key: string;
  label: string;
  engine: EngineKey;
  baseline: TimelineRecord | null;
  candidate: TimelineRecord | null;
  comparison: TimelineComparison | null;
  status: TrackStatus;
  severity: Severity | null;
}

export const SCROLL_PREFIX = "scroll:";

export interface CheckpointView {
  id: string;
  label: string;
  status: TrackStatus | "added" | "removed";
  severity: Severity | null;
  baseline: Checkpoint | null;
  candidate: Checkpoint | null;
  comparison: CheckpointComparison | null;
  /** Longest motion window of both sides, in ms. */
  duration: number;
  tracks: TrackView[];
  scroll: ScrollTrackView[];
  timelines: TimelineView[];
  /** Animation ids (either side) that ran while a scroller moved, keyed by scroll record id. */
  correlations: MotionCorrelation[];
}

export interface ScenarioView {
  key: string;
  name: string;
  viewport: string;
  status: ScenarioStatus;
  severity: Severity | null;
  animationCount: number;
  changeCount: number;
  completeness: Completeness;
  baseline: ScenarioResult | null;
  candidate: ScenarioResult | null;
  comparison: ScenarioComparison | null;
  checkpoints: CheckpointView[];
  error: string | null;
}

export interface ReportModel {
  mode: ReportData["mode"];
  project: string;
  data: ReportData;
  scenarios: ScenarioView[];
  differences: Difference[];
  /** Resolves an asset id from either capture (or the comparison) to a URL. */
  assetUrl(id: string | null | undefined): string | null;
  asset(
    id: string | null | undefined,
  ): Asset | { file: string; width: number; height: number } | null;
}

const SAFE_ASSET = /^assets\/[A-Za-z0-9_-]+\.(png|jpg|jpeg)$/;

/** Validates the embedded data just enough to render safely; the generator validated it fully. */
export function assertReportData(value: unknown): ReportData {
  const v = value as Partial<ReportData> | null;
  if (
    !v ||
    v.kind !== "motionpr-report" ||
    v.schemaVersion !== 1 ||
    !v.candidate ||
    !Array.isArray(v.candidate.scenarios)
  ) {
    throw new Error(
      "This file does not contain MotionPR report data (expected kind motionpr-report, schema v1).",
    );
  }
  return v as ReportData;
}

function completenessOf(records: (AnimationRecord | null)[]): Completeness {
  let worst: Completeness = "complete";
  for (const r of records) {
    if (!r) continue;
    if (r.completeness.status === "metadata-only") return "metadata-only";
    if (r.completeness.status === "partial") worst = "partial";
  }
  return worst;
}

export const TYPE_LABEL: Record<string, string> = {
  "css-transition": "CSS transition",
  "css-animation": "CSS animation",
  "web-animation": "WAAPI",
  gsap: "GSAP",
  animejs: "Anime.js",
  custom: "custom adapter",
};

/** Engine-aware label: an Anime.js-created Web Animation reads "Anime.js · WAAPI". */
export function kindLabel(r: AnimationRecord): string {
  if (r.source === "animejs") return r.driver === "waapi" ? "Anime.js · WAAPI" : "Anime.js";
  if (r.source !== "native" && r.source !== "gsap" && r.type === "web-animation")
    return `${r.source} · WAAPI`;
  return TYPE_LABEL[r.type] ?? r.type;
}

function trackLabel(r: AnimationRecord): { label: string; detail: string } {
  const e = r.element;
  const explicit = e.method === "motionpr-id" || e.method === "test-id" || e.method === "dom-id";
  const who = explicit
    ? e.key.slice(e.key.indexOf(":") + 1)
    : (e.label ?? e.key.replace(/^(aria|path):/, ""));
  const what = r.name ?? "unnamed";
  return { label: who, detail: `${what} · ${kindLabel(r)}` };
}

function startOf(r: AnimationRecord | null): number {
  if (!r) return Number.POSITIVE_INFINITY;
  return animationInterval(r)?.windowStart ?? Number.POSITIVE_INFINITY;
}

function checkpointDuration(...cps: (Checkpoint | null)[]): number {
  return Math.max(0, ...cps.map((c) => c?.window.end ?? 0));
}

function captureTracks(cp: Checkpoint): TrackView[] {
  return cp.animations.map((r) => ({
    key: r.id,
    ...trackLabel(r),
    baseline: null,
    candidate: r,
    comparison: null,
    engine: engineOf(r),
    status: "captured" as const,
    severity: null,
    completeness: r.completeness.status,
    lowConfidence: r.element.confidence === "low",
  }));
}

function comparisonTracks(
  cmp: CheckpointComparison,
  b: Checkpoint | null,
  c: Checkpoint | null,
): TrackView[] {
  const bById = new Map((b?.animations ?? []).map((r) => [r.id, r]));
  const cById = new Map((c?.animations ?? []).map((r) => [r.id, r]));
  const tracks = cmp.animations.map((a): TrackView => {
    const baseline = a.baselineId ? (bById.get(a.baselineId) ?? null) : null;
    const candidate = a.candidateId ? (cById.get(a.candidateId) ?? null) : null;
    const ref = candidate ?? baseline!;
    return {
      key: a.key,
      ...trackLabel(ref),
      engine: engineOf(ref),
      baseline,
      candidate,
      comparison: a,
      status: a.status,
      severity: a.severity,
      completeness: completenessOf([baseline, candidate]),
      lowConfidence: [baseline, candidate].some((r) => r?.element.confidence === "low"),
    };
  });
  return tracks.sort(
    (x, y) =>
      Math.min(startOf(x.candidate), startOf(x.baseline)) -
        Math.min(startOf(y.candidate), startOf(y.baseline)) || x.key.localeCompare(y.key),
  );
}

function scrollLabel(r: ScrollMotionRecord): { label: string; detail: string } {
  const where = r.wrapper ? (r.wrapper.label ?? r.wrapper.key) : "page";
  return {
    label: `${r.source === "lenis" ? "Lenis" : "Native scroll"} · ${where}`,
    detail: `${r.axis} · ${r.sessionId}`,
  };
}

function scrollViews(
  b: Checkpoint | null,
  c: Checkpoint | null,
  cmp: CheckpointComparison | null,
): ScrollTrackView[] {
  const bById = new Map((b?.scrollMotion ?? []).map((r) => [r.id, r]));
  const cById = new Map((c?.scrollMotion ?? []).map((r) => [r.id, r]));
  if (cmp) {
    return cmp.scroll.map((sc) => {
      // Matched across engines keeps the baseline id as the key.
      const baseline = bById.get(sc.key) ?? null;
      const candidate =
        cById.get(sc.key) ??
        (sc.status === "removed"
          ? null
          : ([...cById.values()].find((r) => !bById.has(r.id) && r.axis === baseline?.axis) ??
            null));
      const ref = candidate ?? baseline!;
      return {
        key: `${SCROLL_PREFIX}${sc.key}`,
        id: sc.key,
        ...scrollLabel(ref),
        engine: scrollEngineOf(ref),
        baseline,
        candidate,
        comparison: sc,
        status: sc.status,
        severity: sc.severity,
      };
    });
  }
  const only = c ?? b;
  return (only?.scrollMotion ?? []).map((r) => ({
    key: `${SCROLL_PREFIX}${r.id}`,
    id: r.id,
    ...scrollLabel(r),
    engine: scrollEngineOf(r),
    baseline: c ? null : r,
    candidate: c ? r : null,
    comparison: null,
    status: c ? ("captured" as const) : ("removed" as const),
    severity: null,
  }));
}

function timelineViews(
  b: Checkpoint | null,
  c: Checkpoint | null,
  cmp: CheckpointComparison | null,
): TimelineView[] {
  const bById = new Map((b?.timelines ?? []).map((r) => [r.id, r]));
  const cById = new Map((c?.timelines ?? []).map((r) => [r.id, r]));
  const engine = (r: TimelineRecord): EngineKey =>
    r.source === "gsap" ? "gsap" : r.source === "animejs" ? "animejs" : "custom";
  if (cmp) {
    return cmp.timelines.map((tc) => {
      const baseline = bById.get(tc.key) ?? null;
      const candidate = cById.get(tc.key) ?? null;
      const ref = candidate ?? baseline!;
      return {
        key: `timeline:${tc.key}`,
        label: ref.name ?? tc.key,
        engine: engine(ref),
        baseline,
        candidate,
        comparison: tc,
        status: tc.status,
        severity: tc.severity,
      };
    });
  }
  const only = c ?? b;
  return (only?.timelines ?? []).map((r) => ({
    key: `timeline:${r.id}`,
    label: r.name ?? r.id,
    engine: engine(r),
    baseline: c ? null : r,
    candidate: c ? r : null,
    comparison: null,
    status: c ? ("captured" as const) : ("removed" as const),
    severity: null,
  }));
}

function motionViews(b: Checkpoint | null, c: Checkpoint | null, cmp: CheckpointComparison | null) {
  return {
    scroll: scrollViews(b, c, cmp),
    timelines: timelineViews(b, c, cmp),
    correlations: [...(c?.correlations ?? []), ...(c ? [] : (b?.correlations ?? []))],
  };
}

export function buildModel(data: ReportData, assetBase = ""): ReportModel {
  const bundles: CaptureBundle[] = [data.candidate, ...(data.baseline ? [data.baseline] : [])];
  const assetTable = new Map<string, Asset | { file: string; width: number; height: number }>();
  for (const b of bundles) for (const [id, a] of Object.entries(b.assets)) assetTable.set(id, a);
  for (const [id, a] of Object.entries(data.comparison?.assets ?? {})) assetTable.set(id, a);
  const assetUrl = (id: string | null | undefined) => {
    if (!id) return null;
    const a = assetTable.get(id);
    if (!a || !SAFE_ASSET.test(a.file)) return null;
    return `${assetBase}${a.file}`;
  };
  const asset = (id: string | null | undefined) => (id ? (assetTable.get(id) ?? null) : null);

  let scenarios: ScenarioView[];
  if (data.mode === "comparison" && data.comparison && data.baseline) {
    const bByKey = new Map(data.baseline.scenarios.map((s) => [s.key, s]));
    const cByKey = new Map(data.candidate.scenarios.map((s) => [s.key, s]));
    scenarios = data.comparison.scenarios.map((sc) => {
      const baseline = bByKey.get(sc.key) ?? null;
      const candidate = cByKey.get(sc.key) ?? null;
      let checkpoints: CheckpointView[];
      if (sc.checkpoints.length) {
        checkpoints = sc.checkpoints.map((cmp) => {
          const b =
            cmp.baselineIndex !== null ? (baseline?.checkpoints[cmp.baselineIndex] ?? null) : null;
          const c =
            cmp.candidateIndex !== null
              ? (candidate?.checkpoints[cmp.candidateIndex] ?? null)
              : null;
          return {
            id: `${sc.key}/${cmp.label}`,
            label: cmp.label,
            status: cmp.status,
            severity: cmp.severity,
            baseline: b,
            candidate: c,
            comparison: cmp,
            duration: checkpointDuration(b, c),
            tracks: comparisonTracks(cmp, b, c),
            ...motionViews(b, c, cmp),
          };
        });
      } else {
        // added / removed / failed scenarios: show whatever side exists without a comparison.
        const only = candidate ?? baseline;
        checkpoints = (only?.checkpoints ?? []).map((cp) => ({
          id: `${sc.key}/${cp.label}`,
          label: cp.label,
          status: sc.status === "removed" ? "removed" : "added",
          severity: sc.severity,
          baseline: candidate ? null : cp,
          candidate: candidate ? cp : null,
          comparison: null,
          duration: cp.window.end,
          tracks: captureTracks(cp).map((t) =>
            candidate
              ? t
              : { ...t, baseline: t.candidate, candidate: null, status: "removed" as const },
          ),
          ...motionViews(candidate ? null : cp, candidate ? cp : null, null),
        }));
      }
      const changes = data.comparison!.differences.filter((d) => d.scenarioKey === sc.key).length;
      const all = checkpoints.flatMap((c) => c.tracks);
      return {
        key: sc.key,
        name: sc.name,
        viewport: sc.viewport,
        status: sc.status,
        severity: sc.severity,
        animationCount: all.length,
        changeCount: changes,
        completeness: completenessOf(all.flatMap((t) => [t.baseline, t.candidate])),
        baseline,
        candidate,
        comparison: sc,
        checkpoints,
        error: candidate?.error?.message ?? null,
      };
    });
  } else {
    scenarios = data.candidate.scenarios.map((s) => {
      const checkpoints = s.checkpoints.map((cp) => ({
        id: `${s.key}/${cp.label}`,
        label: cp.label,
        status: "captured" as const,
        severity: null,
        baseline: null,
        candidate: cp,
        comparison: null,
        duration: cp.window.end,
        tracks: captureTracks(cp),
        ...motionViews(null, cp, null),
      }));
      const all = checkpoints.flatMap((c) => c.tracks);
      return {
        key: s.key,
        name: s.name,
        viewport: s.viewport.name,
        status: s.status === "failed" ? "failed" : "captured",
        severity: null,
        animationCount: all.length,
        changeCount: 0,
        completeness: completenessOf(all.map((t) => t.candidate)),
        baseline: null,
        candidate: s,
        comparison: null,
        checkpoints,
        error: s.error?.message ?? null,
      };
    });
  }
  return {
    mode: data.mode,
    project: data.project,
    data,
    scenarios,
    differences: data.comparison?.differences ?? [],
    assetUrl,
    asset,
  };
}

/** The filmstrip frame shown at window time `t`: the last frame at or before `t`. */
export function frameAt(frames: readonly FilmstripFrame[], t: number): FilmstripFrame | null {
  if (!frames.length) return null;
  let lo = 0;
  let hi = frames.length - 1;
  if (t <= frames[0]!.time) return frames[0]!;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid]!.time <= t + 0.5) lo = mid;
    else hi = mid - 1;
  }
  return frames[lo]!;
}

/** Sorted union of frame times of both sides, used for frame stepping. */
export function frameTimes(view: CheckpointView): number[] {
  const set = new Set<number>();
  for (const f of view.baseline?.frames ?? []) set.add(f.time);
  for (const f of view.candidate?.frames ?? []) set.add(f.time);
  const out = [...set].sort((a, b) => a - b);
  return out.length ? out : [0];
}

export function stepTime(
  times: readonly number[],
  t: number,
  direction: 1 | -1,
  count = 1,
): number {
  let index = 0;
  for (let i = 0; i < times.length; i++) if (times[i]! <= t + 0.5) index = i;
  const next = Math.min(times.length - 1, Math.max(0, index + direction * count));
  return times[next]!;
}

export type Channel =
  | "translateX"
  | "translateY"
  | "scaleX"
  | "scaleY"
  | "rotate"
  | "opacity"
  | "x"
  | "y"
  | "width"
  | "height";

export const CHANNELS: { key: Channel; label: string; unit: string }[] = [
  { key: "translateX", label: "translate X", unit: "px" },
  { key: "translateY", label: "translate Y", unit: "px" },
  { key: "opacity", label: "opacity", unit: "" },
  { key: "scaleX", label: "scale X", unit: "×" },
  { key: "scaleY", label: "scale Y", unit: "×" },
  { key: "rotate", label: "rotate", unit: "°" },
  { key: "x", label: "box x", unit: "px" },
  { key: "y", label: "box y", unit: "px" },
  { key: "width", label: "box width", unit: "px" },
  { key: "height", label: "box height", unit: "px" },
];

export function channelValue(
  r: AnimationRecord,
  index: number,
  channel: Channel,
): number | undefined {
  const s = r.samples[index];
  if (!s) return undefined;
  if (channel === "x" || channel === "y" || channel === "width" || channel === "height")
    return s.box?.[channel];
  return s.numeric[channel];
}

/** Channels that actually vary in either record (so charts only show meaningful lines). */
export function varyingChannels(records: (AnimationRecord | null)[]): Channel[] {
  const out: Channel[] = [];
  for (const { key } of CHANNELS) {
    for (const r of records) {
      if (!r || r.samples.length < 2) continue;
      const values = r.samples
        .map((_, i) => channelValue(r, i, key))
        .filter((v): v is number => typeof v === "number");
      if (values.length && Math.max(...values) - Math.min(...values) > 1e-3) {
        out.push(key);
        break;
      }
    }
  }
  return out;
}

export function valueAt(
  r: AnimationRecord | null,
  t: number,
  channel: Channel,
): number | undefined {
  if (!r || !r.samples.length) return undefined;
  const ordered = [...r.samples].sort((a, b) => a.windowTime - b.windowTime);
  return interpolateSamples(ordered, t, (i) =>
    channelValue({ ...r, samples: ordered }, i, channel),
  );
}

/** Border box of an element at window time `t` (interpolated between samples). */
export function boxAt(
  r: AnimationRecord | null,
  t: number,
): { x: number; y: number; width: number; height: number } | null {
  if (!r || !r.samples.length || r.samples.every((s) => !s.box)) return null;
  const x = valueAt(r, t, "x");
  const y = valueAt(r, t, "y");
  const width = valueAt(r, t, "width");
  const height = valueAt(r, t, "height");
  if ([x, y, width, height].some((v) => v === undefined)) return null;
  return { x: x!, y: y!, width: width!, height: height! };
}

/** Local progress (0..1) of a record's active interval at window time t, or null outside. */
export function progressAt(r: AnimationRecord | null, t: number): number | null {
  if (!r) return null;
  const iv = animationInterval(r);
  if (!iv || iv.activeEnd <= iv.activeStart) return null;
  const rate = r.timing.playbackRate || 1;
  const p = (t - iv.activeStart) / (iv.activeEnd - iv.activeStart);
  if (p < 0 || p > 1) return null;
  return rate < 0 ? 1 - p : p;
}

export function findDifferenceTarget(
  model: ReportModel,
  d: Difference,
): {
  scenario: ScenarioView;
  checkpoint: CheckpointView | null;
  track: TrackView | null;
  scroll: ScrollTrackView | null;
} | null {
  const scenario = model.scenarios.find((s) => s.key === d.scenarioKey);
  if (!scenario) return null;
  const checkpoint = d.checkpoint
    ? (scenario.checkpoints.find((c) => c.label === d.checkpoint) ?? null)
    : (scenario.checkpoints[0] ?? null);
  const track =
    d.animationKey && checkpoint
      ? (checkpoint.tracks.find((t) => t.key === d.animationKey) ?? null)
      : null;
  const scroll =
    d.scrollKey && checkpoint
      ? (checkpoint.scroll.find((s) => s.id === d.scrollKey) ?? null)
      : null;
  return { scenario, checkpoint, track, scroll };
}

/** Scroll position (rendered) of a scroll record at window time `t`, linearly interpolated. */
export function scrollAt(
  r: ScrollMotionRecord | null,
  t: number,
  field: "animatedScroll" | "actualScroll" | "targetScroll" = "animatedScroll",
): number | undefined {
  if (!r || !r.samples.length) return undefined;
  return interpolateSamples(
    r.samples.map((s) => ({ windowTime: s.time })),
    t,
    (i) => r.samples[i]![field],
  );
}

/** Velocity in px/ms derived from rendered positions (engine velocity units vary). */
export function scrollVelocities(r: ScrollMotionRecord | null): { t: number; v: number }[] {
  if (!r) return [];
  const out: { t: number; v: number }[] = [];
  for (let i = 1; i < r.samples.length; i++) {
    const a = r.samples[i - 1]!;
    const b = r.samples[i]!;
    const dt = b.time - a.time;
    if (dt > 0)
      out.push({ t: (a.time + b.time) / 2, v: (b.animatedScroll - a.animatedScroll) / dt });
  }
  return out;
}
