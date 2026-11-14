// MotionPR's own comparison and easing code, bundled for the browser (see core-browser.js).
export { compareMatchedAnimation } from "../../../../../packages/comparison/src/diff-animation.ts";
export { compareStagger } from "../../../../../packages/comparison/src/stagger.ts";
export { scrollMetrics } from "../../../../../packages/comparison/src/scroll.ts";
export {
  compareEasingSamples,
  describeEasingShape,
  evaluateCssEasing,
  formatCssEasing,
  parseCssEasing,
  sampleEasing,
  tryParseCssEasing,
  EASING_SAMPLE_COUNT,
} from "@motionpr/core";
