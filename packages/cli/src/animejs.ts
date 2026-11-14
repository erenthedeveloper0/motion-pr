/**
 * `@erenthedeveloper0/motionpr/animejs`: browser-side Anime.js v4 instrumentation. Safe to ship in production
 * bundles: without a capturing MotionPR agent in the page, every wrapper returns the original
 * function and nothing is patched. Does not import or bundle Anime.js.
 *
 * @example
 * import { animate, createTimeline, waapi, eases } from "animejs";
 * import { createAnimeInstrumentation } from "@erenthedeveloper0/motionpr/animejs";
 *
 * const motion = createAnimeInstrumentation({ eases });
 * export const track = motion.wrapAnimate(animate);
 * export const timeline = motion.wrapTimeline(createTimeline);
 * export const waapiAnimate = motion.wrapWaapi(waapi.animate);
 */
export {
  createAnimeInstrumentation,
  createAnimeInstrumentation as default,
  resolveEaseName,
  sampleEase,
  SUPPORTED_ANIMEJS_RANGE,
} from "@motionpr/animejs";
export type {
  AnimateLike,
  AnimeAnimationLike,
  AnimeEngineLike,
  AnimeInstrumentation,
  AnimeInstrumentationOptions,
  AnimeTickableLike,
  AnimeTimelineLike,
  AnimeWaapiAnimationLike,
  CreateTimelineLike,
  EasesLike,
  EasingFunction,
  WaapiAnimateLike,
} from "@motionpr/animejs";
