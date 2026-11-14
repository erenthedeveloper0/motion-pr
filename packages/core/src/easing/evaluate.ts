import { parseCssEasing } from "./parse.ts";
import type {
  CssEasing,
  CubicBezierEasing,
  EasingFn,
  LinearFunctionEasing,
  StepsEasing,
} from "./types.ts";

/**
 * Cubic-bezier evaluation using the same approach as browser engines: solve x(t) = x with
 * Newton-Raphson, fall back to bisection, then return y(t).
 */
function cubicBezierFn({ x1, y1, x2, y2 }: CubicBezierEasing): EasingFn {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const sampleDX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  const solveT = (x: number): number => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-7) return t;
      const d = sampleDX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 64 && hi - lo > 1e-9; i++) {
      const v = sampleX(t);
      if (Math.abs(v - x) < 1e-7) return t;
      if (x > v) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };

  return (x: number) => {
    // Outside [0, 1] browsers extrapolate along the endpoint tangents.
    if (x <= 0) {
      const slope = x1 > 0 ? y1 / x1 : y1 === 0 && x2 > 0 ? y2 / x2 : 0;
      return slope * x;
    }
    if (x >= 1) {
      const slope = x2 < 1 ? (y2 - 1) / (x2 - 1) : x2 === 1 && x1 < 1 ? (y1 - 1) / (x1 - 1) : 0;
      return 1 + slope * (x - 1);
    }
    return sampleY(solveT(x));
  };
}

/** steps() per CSS Easing Level 1, ignoring the "before flag" (irrelevant for sampling). */
function stepsFn({ steps, position }: StepsEasing): EasingFn {
  const jumps = position === "jump-none" ? steps - 1 : position === "jump-both" ? steps + 1 : steps;
  return (x: number) => {
    let current = Math.floor(x * steps);
    if (position === "jump-start" || position === "jump-both") current += 1;
    if (x >= 0 && current < 0) current = 0;
    if (x <= 1 && current > jumps) current = jumps;
    return current / jumps;
  };
}

function linearFunctionFn({ points }: LinearFunctionEasing): EasingFn {
  return (x: number) => {
    const first = points[0]!;
    const last = points[points.length - 1]!;
    if (x <= first.input) {
      const second = points[1]!;
      if (second.input === first.input) return first.output;
      return (
        first.output +
        ((x - first.input) * (second.output - first.output)) / (second.input - first.input)
      );
    }
    if (x >= last.input) {
      const prev = points[points.length - 2]!;
      if (last.input === prev.input) return last.output;
      return (
        last.output + ((x - last.input) * (last.output - prev.output)) / (last.input - prev.input)
      );
    }
    // Choose the last segment whose start input is <= x (spec behaviour for equal inputs).
    let index = 0;
    for (let i = 0; i < points.length - 1; i++) if (points[i]!.input <= x) index = i;
    const a = points[index]!;
    const b = points[index + 1]!;
    if (b.input === a.input) return b.output;
    return a.output + ((x - a.input) * (b.output - a.output)) / (b.input - a.input);
  };
}

/** Builds an evaluator for a parsed easing. */
export function easingFunction(easing: CssEasing): EasingFn {
  switch (easing.type) {
    case "linear":
      return (x) => x;
    case "cubic-bezier":
      return cubicBezierFn(easing);
    case "steps":
      return stepsFn(easing);
    case "linear-function":
      return linearFunctionFn(easing);
  }
}

/** Evaluates a CSS easing string at input progress `x`. */
export function evaluateCssEasing(input: string | CssEasing, x: number): number {
  return easingFunction(typeof input === "string" ? parseCssEasing(input) : input)(x);
}

/**
 * Samples an easing at `count` evenly spaced inputs from 0 to 1 inclusive.
 * The returned array has `count` entries; index i corresponds to input i / (count - 1).
 */
export function sampleEasing(input: string | CssEasing | EasingFn, count = 65): number[] {
  const fn =
    typeof input === "function"
      ? input
      : easingFunction(typeof input === "string" ? parseCssEasing(input) : input);
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(round6(fn(i / (count - 1))));
  return out;
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
