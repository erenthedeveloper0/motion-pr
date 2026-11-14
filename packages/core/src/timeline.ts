import type { AnimationRecord } from "./schema/capture.ts";

export interface AnimationInterval {
  /** Local time zero (before delay), window time in ms. */
  start: number;
  /** Earliest window time the animation occupies (start, or active end when reversed). */
  windowStart: number;
  /** Latest window time the animation occupies. */
  windowEnd: number;
  /** Visible activity begins (after delay). */
  activeStart: number;
  /** Activity ends (for infinite animations: after one iteration). */
  activeEnd: number;
  /** True when the active end is an iteration boundary of an infinite animation. */
  infinite: boolean;
}

/**
 * Window-relative interval of an animation, accounting for delay, iterations and negative
 * playback rates. Returns null when the start time or duration is unknown.
 */
export function animationInterval(
  record: Pick<AnimationRecord, "startTime" | "timing">,
): AnimationInterval | null {
  const { startTime, timing } = record;
  if (startTime === null || timing.duration === null) return null;
  const rate = timing.playbackRate || 1;
  const infinite = timing.iterations === "infinite";
  const active = timing.activeDuration ?? (infinite ? timing.duration : 0);
  const a = startTime + timing.delay / rate;
  const b = startTime + (timing.delay + active) / rate;
  return {
    start: startTime,
    windowStart: Math.min(startTime, a, b),
    windowEnd: Math.max(startTime, a, b),
    activeStart: Math.min(a, b),
    activeEnd: Math.max(a, b),
    infinite,
  };
}

/** Linear interpolation of a numeric channel across samples at window time `t` (null outside). */
export function interpolateSamples(
  samples: readonly { windowTime: number }[],
  t: number,
  pick: (index: number) => number | undefined,
): number | undefined {
  if (!samples.length) return undefined;
  if (t <= samples[0]!.windowTime) return pick(0);
  const last = samples.length - 1;
  if (t >= samples[last]!.windowTime) return pick(last);
  for (let i = 0; i < last; i++) {
    const a = samples[i]!.windowTime;
    const b = samples[i + 1]!.windowTime;
    if (t >= a && t <= b) {
      const va = pick(i);
      const vb = pick(i + 1);
      if (va === undefined || vb === undefined) return va ?? vb;
      return b === a ? va : va + ((vb - va) * (t - a)) / (b - a);
    }
  }
  return undefined;
}
