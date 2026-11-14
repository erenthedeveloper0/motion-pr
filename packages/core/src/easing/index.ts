export type * from "./types.ts";
export {
  EasingParseError,
  cssEasingsEquivalent,
  formatCssEasing,
  matchBezierKeyword,
  parseCssEasing,
  tryParseCssEasing,
} from "./parse.ts";
export { easingFunction, evaluateCssEasing, sampleEasing } from "./evaluate.ts";
export {
  EASING_SAMPLE_COUNT,
  canonicalEasing,
  compareEasingSamples,
  cssEasingSamples,
  describeEasingShape,
  resampleEasing,
  type EasingCurveComparison,
} from "./compare.ts";
