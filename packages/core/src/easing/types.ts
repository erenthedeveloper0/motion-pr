/**
 * Parsed representation of a CSS <easing-function>.
 *
 * Covers every easing function Chromium exposes through the Web Animations API:
 * `linear`, the cubic-bezier keywords, `cubic-bezier()`, `steps()` / `step-start` / `step-end`
 * and the CSS Easing Level 2 `linear()` function.
 */
export type StepPosition = "jump-start" | "jump-end" | "jump-none" | "jump-both";

export type CubicBezierKeyword = "ease" | "ease-in" | "ease-out" | "ease-in-out";

export interface LinearKeywordEasing {
  readonly type: "linear";
}

export interface CubicBezierEasing {
  readonly type: "cubic-bezier";
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  /** Set when the easing was written (or is equivalent to) a named keyword. */
  readonly keyword?: CubicBezierKeyword;
}

export interface StepsEasing {
  readonly type: "steps";
  readonly steps: number;
  readonly position: StepPosition;
}

export interface LinearPoint {
  readonly input: number;
  readonly output: number;
}

export interface LinearFunctionEasing {
  readonly type: "linear-function";
  /** Control points with every input resolved, in ascending input order. */
  readonly points: readonly LinearPoint[];
}

export type CssEasing =
  LinearKeywordEasing | CubicBezierEasing | StepsEasing | LinearFunctionEasing;

export type EasingFn = (x: number) => number;
