import { tryParseCssEasing, formatCssEasing } from "./parse.ts";
import { sampleEasing } from "./evaluate.ts";

export const EASING_SAMPLE_COUNT = 65;

export interface EasingCurveComparison {
  /** True when both curves are numerically identical (max deviation below 1e-4). */
  readonly equivalent: boolean;
  /** Largest absolute output difference between the curves over inputs in [0, 1]. */
  readonly maxDeviation: number;
  /** Input progress (0..1) at which the largest deviation occurs. */
  readonly maxDeviationAt: number;
  /** Mean absolute output difference (area between curves, approximated). */
  readonly meanDeviation: number;
  /** Signed difference in output at 25 / 50 / 75 % input (candidate minus baseline). */
  readonly checkpoints: { readonly at: number; readonly delta: number }[];
  readonly baselineOvershoot: boolean;
  readonly candidateOvershoot: boolean;
}

/**
 * Compares two sampled easing curves of equal length. Samples are outputs at evenly spaced inputs.
 * Throws when the sample arrays have different lengths; resample first.
 */
export function compareEasingSamples(
  baseline: readonly number[],
  candidate: readonly number[],
): EasingCurveComparison {
  if (baseline.length !== candidate.length || baseline.length < 2) {
    throw new RangeError("Easing sample arrays must have the same length (>= 2).");
  }
  let max = 0;
  let maxAt = 0;
  let sum = 0;
  const n = baseline.length;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(candidate[i]! - baseline[i]!);
    sum += d;
    if (d > max) {
      max = d;
      maxAt = i / (n - 1);
    }
  }
  const at = (p: number) => {
    const i = Math.round(p * (n - 1));
    return Math.round((candidate[i]! - baseline[i]!) * 1e4) / 1e4;
  };
  const overshoot = (s: readonly number[]) => s.some((v) => v > 1 + 1e-4 || v < -1e-4);
  return {
    equivalent: max < 1e-4,
    maxDeviation: Math.round(max * 1e4) / 1e4,
    maxDeviationAt: Math.round(maxAt * 1e4) / 1e4,
    meanDeviation: Math.round((sum / n) * 1e4) / 1e4,
    checkpoints: [0.25, 0.5, 0.75].map((p) => ({ at: p, delta: at(p) })),
    baselineOvershoot: overshoot(baseline),
    candidateOvershoot: overshoot(candidate),
  };
}

/** Resamples an evenly spaced sample array to a new length using linear interpolation. */
export function resampleEasing(samples: readonly number[], count: number): number[] {
  if (samples.length === count) return [...samples];
  const out: number[] = [];
  const last = samples.length - 1;
  for (let i = 0; i < count; i++) {
    const pos = (i / (count - 1)) * last;
    const lo = Math.floor(pos);
    const hi = Math.min(last, lo + 1);
    const t = pos - lo;
    out.push(samples[lo]! + (samples[hi]! - samples[lo]!) * t);
  }
  return out;
}

/**
 * Produces evenly spaced samples for an easing string when it is a valid CSS easing.
 * Returns null for non-CSS easings (e.g. GSAP ease names), which must carry their own samples.
 */
export function cssEasingSamples(value: string, count = EASING_SAMPLE_COUNT): number[] | null {
  const parsed = tryParseCssEasing(value);
  return parsed ? sampleEasing(parsed, count) : null;
}

/** Normalizes a CSS easing string to canonical form, leaving unknown strings untouched. */
export function canonicalEasing(value: string): string {
  const parsed = tryParseCssEasing(value);
  return parsed ? formatCssEasing(parsed) : value.trim();
}

/** Describes the overall character of a curve in plain words, derived only from its samples. */
export function describeEasingShape(samples: readonly number[]): string {
  const n = samples.length;
  if (n < 3) return "unknown";
  const distinct = new Set(samples.map((s) => Math.round(s * 1000))).size;
  if (distinct <= Math.max(2, Math.floor(n / 6)) && hasFlatRuns(samples)) return "stepped";
  const overshoot = samples.some((v) => v > 1.0001 || v < -0.0001);
  const mid = samples[Math.round((n - 1) / 2)]!;
  const q1 = samples[Math.round((n - 1) / 4)]!;
  const q3 = samples[Math.round(((n - 1) * 3) / 4)]!;
  let shape: string;
  if (Math.abs(mid - 0.5) < 0.02 && Math.abs(q1 - 0.25) < 0.02 && Math.abs(q3 - 0.75) < 0.02)
    shape = "linear";
  else if (q1 > 0.25 && q3 > 0.75) shape = "decelerating (ease-out)";
  else if (q1 < 0.25 && q3 < 0.75) shape = "accelerating (ease-in)";
  else shape = "accelerate then decelerate (ease-in-out)";
  return overshoot ? `${shape}, overshoots` : shape;
}

function hasFlatRuns(samples: readonly number[]): boolean {
  let flat = 0;
  for (let i = 1; i < samples.length; i++)
    if (Math.abs(samples[i]! - samples[i - 1]!) < 1e-9) flat++;
  return flat >= samples.length / 2;
}
