// The parts of @motionpr/core that MotionPR's comparison engine needs at runtime, imported from
// the real sources. build.mjs aliases "@motionpr/core" to this file for the browser bundle, so
// the playground and labs run the same code as the CLI (the rest of core needs Node).
export * from "../../../../../packages/core/src/easing/index.ts";
export {
  colorDistance,
  decomposeTransform,
  parseCssColor,
  parseCssNumeric,
} from "../../../../../packages/core/src/values.ts";
