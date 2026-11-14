import type {
  AnimationRecord,
  ChangeKind,
  ComparisonConfig,
  ScrollMotionRecord,
} from "@motionpr/core";
import type { ChangeDraft } from "./severity.ts";

const POINTS = 33;
/** Minimum shared scroll range (px) for a meaningful comparison. */
const MIN_RANGE = 40;

function positionAt(scroll: ScrollMotionRecord, t: number): number {
  const s = scroll.samples;
  if (t <= s[0]!.time) return s[0]!.animatedScroll;
  for (let i = 1; i < s.length; i++) {
    if (t <= s[i]!.time) {
      const a = s[i - 1]!;
      const b = s[i]!;
      return b.time === a.time
        ? b.animatedScroll
        : a.animatedScroll +
            ((b.animatedScroll - a.animatedScroll) * (t - a.time)) / (b.time - a.time);
    }
  }
  return s[s.length - 1]!.animatedScroll;
}

/** (scroll position, progress) pairs, sorted by position. */
export function progressByPosition(
  r: AnimationRecord,
  scroll: ScrollMotionRecord,
): { pos: number; progress: number }[] {
  return r.progressTrace
    .map((p) => ({ pos: positionAt(scroll, p.time), progress: p.progress }))
    .sort((a, b) => a.pos - b.pos);
}

function progressAtPosition(
  points: readonly { pos: number; progress: number }[],
  pos: number,
): number {
  if (pos <= points[0]!.pos) return points[0]!.progress;
  for (let i = 1; i < points.length; i++) {
    if (pos <= points[i]!.pos) {
      const a = points[i - 1]!;
      const b = points[i]!;
      return b.pos === a.pos
        ? b.progress
        : a.progress + ((b.progress - a.progress) * (pos - a.pos)) / (b.pos - a.pos);
    }
  }
  return points[points.length - 1]!.progress;
}

function movingScroll(records: readonly ScrollMotionRecord[]): ScrollMotionRecord | null {
  return (
    records.find((r) =>
      r.samples.some(
        (s, i) => i > 0 && Math.abs(s.animatedScroll - r.samples[i - 1]!.animatedScroll) > 0.01,
      ),
    ) ?? null
  );
}

/**
 * Compares a scroll-linked animation (e.g. GSAP ScrollTrigger with scrub) by its progress at the
 * same scroll positions: a moved trigger point or a changed scrub range shows up here even
 * though the animation itself cannot be replayed. Returns null when there is not enough data.
 */
export function scrollLinkedChange(
  b: AnimationRecord,
  c: AnimationRecord,
  scrollB: readonly ScrollMotionRecord[],
  scrollC: readonly ScrollMotionRecord[],
  config: ComparisonConfig,
): ChangeDraft | null {
  if (b.progressTrace.length < 2 || c.progressTrace.length < 2) return null;
  const sb = movingScroll(scrollB);
  const sc = movingScroll(scrollC);
  if (!sb || !sc) return null;
  const pb = progressByPosition(b, sb);
  const pc = progressByPosition(c, sc);
  const lo = Math.max(pb[0]!.pos, pc[0]!.pos);
  const hi = Math.min(pb.at(-1)!.pos, pc.at(-1)!.pos);
  if (hi - lo < MIN_RANGE) return null;
  let max = 0;
  let at = lo;
  let before = 0;
  let after = 0;
  for (let k = 0; k < POINTS; k++) {
    const pos = lo + ((hi - lo) * k) / (POINTS - 1);
    const vb = progressAtPosition(pb, pos);
    const vc = progressAtPosition(pc, pos);
    if (Math.abs(vc - vb) > max) {
      max = Math.abs(vc - vb);
      at = pos;
      before = vb;
      after = vc;
    }
  }
  if (max <= config.scroll.curveTolerance) return null;
  const kind: ChangeKind = "scroll-progress";
  return {
    kind,
    rule: "scroll-curve",
    before: Math.round(before * 1000) / 1000,
    after: Math.round(after * 1000) / 1000,
    delta: Math.round(max * 1000) / 1000,
    measurement: "measured",
    severity: max >= config.scroll.warnCurveDeviation ? "warning" : "info",
    message: `Scroll-linked progress at the same scroll position differs by up to ${Math.round(max * 100)}% (at ${Math.round(at)}px: ${Math.round(before * 100)}% → ${Math.round(after * 100)}%)`,
  };
}
