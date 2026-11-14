/**
 * `@erenthedeveloper0/motionpr/gsap`: browser-side GSAP adapter. Safe to ship in production bundles: without a
 * capturing MotionPR agent in the page, `register()` returns false and changes nothing.
 *
 * @example
 * import gsap from "gsap";
 * import { motionprGsap } from "@erenthedeveloper0/motionpr/gsap";
 * motionprGsap.register(gsap);
 */
export {
  motionprGsap,
  motionprGsap as default,
  gsapProperties,
  SUPPORTED_GSAP_RANGE,
} from "@motionpr/gsap";
export type {
  GsapAnimationLike,
  GsapLike,
  GsapTimelineLike,
  RegisterOptions,
} from "@motionpr/gsap";
