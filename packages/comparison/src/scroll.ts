import type {
  ComparisonConfig,
  ScrollComparison,
  ScrollMetrics,
  ScrollMotionRecord,
  ScrollSample,
  Severity,
} from "@motionpr/core";
import { finalizeChanges, magnitudeSeverity, type ChangeDraft } from "./severity.ts";

/**
 * Scroll motion is compared through metrics derived from the rendered position over time, not
 * through animation rules: a scroller has no declared duration or easing, only a path. Times are
 * normalized to the movement itself, so a scroll that starts one frame later (browser scheduling)
 * does not register as a change; curves are compared in normalized progress (0..1 of distance).
 */
export const CURVE_POINTS = 33;
const MOVE_EPSILON = 0.01;
/** Position changes below this (px) are not direction changes; filters sub-pixel jitter. */
const DIRECTION_EPSILON = 0.5;

const round = (n: number, digits = 3) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

/**
 * Shortest interval (ms) a velocity is derived over. Scroll engines move once per frame, and
 * Firefox and WebKit report time in whole milliseconds, so two samples can be 1 ms apart with a
 * whole frame's movement between them: their quotient is noise, not speed (WebKit showed
 * "78 px/ms"). Each velocity spans at least three quarters of a 60 Hz frame.
 */
export const MIN_VELOCITY_INTERVAL_MS = 12;

function velocities(samples: readonly ScrollSample[]): { t: number; v: number }[] {
  const out: { t: number; v: number }[] = [];
  let j = 0;
  for (let i = 1; i < samples.length; i++) {
    const t = samples[i]!.time;
    // The latest earlier sample at least MIN_VELOCITY_INTERVAL_MS before this one.
    while (j + 1 < i && t - samples[j + 1]!.time >= MIN_VELOCITY_INTERVAL_MS) j++;
    const dt = t - samples[j]!.time;
    if (dt < MIN_VELOCITY_INTERVAL_MS) continue;
    out.push({
      t: (t + samples[j]!.time) / 2,
      v: (samples[i]!.animatedScroll - samples[j]!.animatedScroll) / dt,
    });
  }
  return out;
}

function interpolate(points: readonly { t: number; y: number }[], t: number): number {
  if (!points.length) return 0;
  if (t <= points[0]!.t) return points[0]!.y;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (t <= b.t) return b.t === a.t ? b.y : a.y + ((b.y - a.y) * (t - a.t)) / (b.t - a.t);
  }
  return points[points.length - 1]!.y;
}

/** Derives comparable metrics from one scroll record. */
export function scrollMetrics(record: ScrollMotionRecord, config: ComparisonConfig): ScrollMetrics {
  const s = record.samples;
  const empty: ScrollMetrics = {
    samples: s.length,
    axis: record.axis,
    start: s[0]?.animatedScroll ?? 0,
    end: s.at(-1)?.animatedScroll ?? 0,
    target: s.at(-1)?.targetScroll ?? 0,
    distance: 0,
    movementStart: null,
    duration: null,
    unsettled: false,
    peakVelocity: 0,
    peakVelocityAt: null,
    overshoot: 0,
    directionChanges: 0,
    meanLag: 0,
    maxLag: 0,
    curve: null,
    velocityCurve: null,
  };
  let first = -1;
  let last = -1;
  for (let i = 1; i < s.length; i++) {
    if (Math.abs(s[i]!.animatedScroll - s[i - 1]!.animatedScroll) > MOVE_EPSILON) {
      if (first === -1) first = i - 1;
      last = i;
    }
  }
  if (first === -1) return empty;

  const start = s[first]!.animatedScroll;
  const end = s.at(-1)!.animatedScroll;
  const t0 = s[first]!.time;
  const t1 = s[last]!.time;
  const duration = Math.max(0, t1 - t0);
  const moving = s.slice(first, last + 1);
  const v = velocities(moving);
  let peak = 0;
  let peakAt: number | null = null;
  for (const p of v) {
    if (Math.abs(p.v) > peak) {
      peak = Math.abs(p.v);
      peakAt = duration > 0 ? (p.t - t0) / duration : 0;
    }
  }
  const direction = Math.sign(end - start);
  let overshoot = 0;
  for (const p of moving) overshoot = Math.max(overshoot, direction * (p.animatedScroll - end));
  let directionChanges = 0;
  let lastSign = 0;
  let anchor = moving[0]!.animatedScroll;
  for (const p of moving) {
    const d = p.animatedScroll - anchor;
    if (Math.abs(d) < DIRECTION_EPSILON) continue;
    const sign = Math.sign(d);
    if (lastSign !== 0 && sign !== lastSign) directionChanges++;
    lastSign = sign;
    anchor = p.animatedScroll;
  }
  let lagSum = 0;
  let maxLag = 0;
  for (const p of moving) {
    const lag = Math.abs(p.animatedScroll - p.actualScroll);
    lagSum += lag;
    maxLag = Math.max(maxLag, lag);
  }
  const lastV = v.at(-1)?.v ?? 0;
  const final = s.at(-1)!;
  const unsettled =
    last === s.length - 1 &&
    (Math.abs(lastV) > config.scroll.settleVelocity ||
      Math.abs(final.targetScroll - final.animatedScroll) > config.scroll.positionTolerancePx);

  const distance = end - start;
  let curve: number[] | null = null;
  let velocityCurve: number[] | null = null;
  if (Math.abs(distance) > config.scroll.positionTolerancePx && duration > 0) {
    const pos = moving.map((p) => ({ t: (p.time - t0) / duration, y: p.animatedScroll }));
    const vel = v.map((p) => ({
      t: (p.t - t0) / duration,
      y: peak > 0 ? Math.abs(p.v) / peak : 0,
    }));
    curve = [];
    velocityCurve = [];
    for (let k = 0; k < CURVE_POINTS; k++) {
      const x = k / (CURVE_POINTS - 1);
      curve.push(round((interpolate(pos, x) - start) / distance, 4));
      velocityCurve.push(round(interpolate(vel, x), 4));
    }
  }
  return {
    samples: s.length,
    axis: record.axis,
    start: round(start),
    end: round(end),
    target: round(final.targetScroll),
    distance: round(distance),
    movementStart: round(t0),
    duration: round(duration),
    unsettled,
    peakVelocity: round(peak, 4),
    peakVelocityAt: peakAt === null ? null : round(peakAt, 4),
    overshoot: round(Math.max(0, overshoot)),
    directionChanges,
    meanLag: round(lagSum / moving.length),
    maxLag: round(maxLag),
    curve,
    velocityCurve,
  };
}

function curveDeviation(
  a: readonly number[],
  b: readonly number[],
): { maxDeviation: number; maxDeviationAt: number; meanDeviation: number } {
  let max = 0;
  let at = 0;
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = Math.abs(a[i]! - b[i]!);
    sum += d;
    if (d > max) {
      max = d;
      at = i / (n - 1);
    }
  }
  return {
    maxDeviation: round(max, 4),
    maxDeviationAt: round(at, 4),
    meanDeviation: round(sum / n, 4),
  };
}

const px = (n: number) => `${round(n, 1)}px`;
const ms = (n: number) => `${Math.round(n)}ms`;

function scrollDrafts(
  b: ScrollMotionRecord,
  c: ScrollMotionRecord,
  mb: ScrollMetrics,
  mc: ScrollMetrics,
  config: ComparisonConfig,
): { drafts: ChangeDraft[]; curve: ScrollComparison["curve"] } {
  const sc = config.scroll;
  const drafts: ChangeDraft[] = [];
  const incomplete =
    b.completeness.status !== "complete" ||
    c.completeness.status !== "complete" ||
    mb.unsettled ||
    mc.unsettled;
  const measurement = incomplete ? "incomplete" : "measured";

  if (b.source !== c.source) {
    drafts.push({
      kind: "scroll-config",
      rule: "scroll-curve",
      before: b.source,
      after: c.source,
      measurement: "measured",
      severity: "warning",
      message: `Scroll engine ${b.source} → ${c.source}`,
    });
  }
  for (const key of new Set([...Object.keys(b.config), ...Object.keys(c.config)])) {
    const vb = b.config[key] ?? null;
    const vc = c.config[key] ?? null;
    if (vb === vc) continue;
    drafts.push({
      kind: "scroll-config",
      rule: "scroll-curve",
      property: key,
      before: vb,
      after: vc,
      measurement: "measured",
      severity: "info",
      message: `Scroll setting ${key}: ${String(vb)} → ${String(vc)}`,
    });
  }

  for (const [kind, label, before, after] of [
    ["scroll-start", "Scroll starts at", mb.start, mc.start],
    // Target before end: a different target explains a different end, reported once.
    ["scroll-target", "Scroll target", mb.target, mc.target],
    ["scroll-end", "Scroll ends at", mb.end, mc.end],
  ] as const) {
    const sev = magnitudeSeverity(
      Math.abs(after - before),
      sc.positionTolerancePx,
      sc.warnPositionPx,
    );
    if (!sev) continue;
    // A different target explains a different end; report the end once.
    if (kind === "scroll-end" && drafts.some((d) => d.kind === "scroll-target")) continue;
    drafts.push({
      kind,
      rule: "scroll-position",
      before,
      after,
      delta: round(after - before),
      unit: "px",
      measurement,
      severity: sev,
      message: `${label} ${px(before)} → ${px(after)} (${after - before > 0 ? "+" : ""}${px(after - before)})`,
    });
  }

  if (mb.duration !== null && mc.duration !== null) {
    const abs = Math.abs(mc.duration - mb.duration);
    if (abs > sc.durationToleranceMs) {
      const rel = mb.duration > 0 ? abs / mb.duration : Number.POSITIVE_INFINITY;
      drafts.push({
        kind: "scroll-duration",
        rule: "scroll-duration",
        before: mb.duration,
        after: mc.duration,
        delta: round(mc.duration - mb.duration),
        unit: "ms",
        measurement,
        severity: abs >= sc.warnDurationMs && rel >= sc.warnDurationRelative ? "warning" : "info",
        message: `Scroll takes ${ms(mb.duration)} → ${ms(mc.duration)} to settle (${mc.duration > mb.duration ? "+" : ""}${ms(mc.duration - mb.duration)})`,
      });
    }
  } else if ((mb.duration === null) !== (mc.duration === null)) {
    drafts.push({
      kind: "scroll-duration",
      rule: "scroll-duration",
      before: mb.duration,
      after: mc.duration,
      measurement,
      severity: "warning",
      message:
        mb.duration === null
          ? "Scroller now moves during this checkpoint"
          : "Scroller no longer moves during this checkpoint",
    });
  }

  let curve: ScrollComparison["curve"] = null;
  if (mb.curve && mc.curve) {
    curve = curveDeviation(mb.curve, mc.curve);
    if (curve.maxDeviation > sc.curveTolerance) {
      drafts.push({
        kind: "scroll-curve",
        rule: "scroll-curve",
        before: null,
        after: null,
        delta: curve.maxDeviation,
        measurement,
        severity: curve.maxDeviation >= sc.warnCurveDeviation ? "warning" : "info",
        message: `Scroll easing changed: progress deviates up to ${Math.round(curve.maxDeviation * 100)}% of the distance at ${Math.round(curve.maxDeviationAt * 100)}% of the movement`,
      });
    }
  }

  if (mb.peakVelocity > 0 && mc.peakVelocity > 0) {
    const rel = Math.abs(mc.peakVelocity - mb.peakVelocity) / mb.peakVelocity;
    if (rel > sc.velocityTolerance) {
      drafts.push({
        kind: "scroll-velocity",
        rule: "scroll-velocity",
        before: mb.peakVelocity,
        after: mc.peakVelocity,
        delta: round(mc.peakVelocity - mb.peakVelocity, 4),
        unit: "px/ms",
        measurement,
        severity: rel > sc.velocityTolerance * 2 ? "warning" : "info",
        message: `Peak scroll velocity ${round(mb.peakVelocity, 2)} → ${round(mc.peakVelocity, 2)} px/ms (${mc.peakVelocity > mb.peakVelocity ? "+" : "-"}${Math.round(rel * 100)}%)`,
      });
    }
  }

  const tol = sc.overshootTolerancePx;
  if (Math.abs(mc.overshoot - mb.overshoot) > tol) {
    const appeared = mb.overshoot <= tol && mc.overshoot > tol;
    const vanished = mb.overshoot > tol && mc.overshoot <= tol;
    drafts.push({
      kind: "scroll-overshoot",
      rule: "scroll-overshoot",
      before: mb.overshoot,
      after: mc.overshoot,
      delta: round(mc.overshoot - mb.overshoot),
      unit: "px",
      measurement,
      severity: appeared || vanished ? "warning" : "info",
      message: appeared
        ? `Scroll now overshoots by ${px(mc.overshoot)} before settling`
        : vanished
          ? "Scroll no longer overshoots"
          : `Overshoot ${px(mb.overshoot)} → ${px(mc.overshoot)}`,
    });
  }
  if (mb.directionChanges !== mc.directionChanges) {
    drafts.push({
      kind: "scroll-direction",
      rule: "scroll-curve",
      before: mb.directionChanges,
      after: mc.directionChanges,
      measurement,
      severity: "info",
      message: `Direction changes during the scroll ${mb.directionChanges} → ${mc.directionChanges}`,
    });
  }
  if (Math.abs(mc.meanLag - mb.meanLag) > sc.positionTolerancePx * 2) {
    drafts.push({
      kind: "scroll-lag",
      rule: "scroll-velocity",
      before: mb.meanLag,
      after: mc.meanLag,
      delta: round(mc.meanLag - mb.meanLag),
      unit: "px",
      measurement,
      severity: "info",
      message: `Smooth-scroll lag (rendered vs. native position) ${px(mb.meanLag)} → ${px(mc.meanLag)} on average`,
    });
  }
  if ((mb.unsettled || mc.unsettled) && drafts.length === 0) {
    drafts.push({
      kind: "scroll-duration",
      rule: "scroll-duration",
      before: mb.unsettled,
      after: mc.unsettled,
      measurement: "incomplete",
      severity: "uncertain",
      message:
        "Scroller had not settled when the checkpoint was captured; add a waitForScrollSettled step",
    });
  }
  return { drafts, curve };
}

/** Pairs scroll records: same id, then same wrapper + axis with a different engine. */
export function matchScroll(
  baseline: readonly ScrollMotionRecord[],
  candidate: readonly ScrollMotionRecord[],
): {
  matches: [ScrollMotionRecord, ScrollMotionRecord][];
  removed: ScrollMotionRecord[];
  added: ScrollMotionRecord[];
} {
  const restB = [...baseline];
  const restC = [...candidate];
  const matches: [ScrollMotionRecord, ScrollMotionRecord][] = [];
  const take = (pred: (b: ScrollMotionRecord, c: ScrollMotionRecord) => boolean) => {
    for (const b of [...restB]) {
      const c = restC.find((x) => pred(b, x));
      if (!c) continue;
      matches.push([b, c]);
      restB.splice(restB.indexOf(b), 1);
      restC.splice(restC.indexOf(c), 1);
    }
  };
  take((b, c) => b.id === c.id);
  const where = (r: ScrollMotionRecord) => `${r.wrapper?.key ?? "window"}|${r.axis}`;
  take((b, c) => where(b) === where(c));
  return { matches, removed: restB, added: restC };
}

export function compareScrollRecords(
  baseline: readonly ScrollMotionRecord[],
  candidate: readonly ScrollMotionRecord[],
  config: ComparisonConfig,
): ScrollComparison[] {
  const { matches, removed, added } = matchScroll(baseline, candidate);
  const out: ScrollComparison[] = [];
  const rank = { critical: 3, warning: 2, info: 1, uncertain: 0 } as const;
  for (const [b, c] of matches) {
    const mb = scrollMetrics(b, config);
    const mc = scrollMetrics(c, config);
    const { drafts, curve } = scrollDrafts(b, c, mb, mc, config);
    const changes = finalizeChanges(drafts, config, null);
    const severity = changes.reduce<Severity | null>(
      (acc, ch) => (acc === null || rank[ch.severity] > rank[acc] ? ch.severity : acc),
      null,
    );
    out.push({
      key: b.id,
      source: c.source,
      status: changes.length ? "changed" : "unchanged",
      baseline: mb,
      candidate: mc,
      curve,
      changes,
      severity,
    });
  }
  for (const b of removed)
    out.push({
      key: b.id,
      source: b.source,
      status: "removed",
      baseline: scrollMetrics(b, config),
      candidate: null,
      curve: null,
      changes: [],
      severity: null,
    });
  for (const c of added)
    out.push({
      key: c.id,
      source: c.source,
      status: "added",
      baseline: null,
      candidate: scrollMetrics(c, config),
      curve: null,
      changes: [],
      severity: null,
    });
  return out;
}
