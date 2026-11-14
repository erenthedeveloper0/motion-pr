/**
 * `@erenthedeveloper0/motionpr/lenis`: browser-side Lenis scroll-motion observer. Safe to ship in production
 * bundles: without a capturing MotionPR agent in the page, `attach()` returns an inactive
 * handle and adds no listener. Does not import or bundle Lenis, never calls `lenis.raf()`,
 * never changes Lenis options and never destroys the instance.
 *
 * @example
 * import Lenis from "lenis";
 * import { motionprLenis } from "@erenthedeveloper0/motionpr/lenis";
 *
 * const lenis = new Lenis({ autoRaf: true });
 * motionprLenis.attach(lenis);
 */
export {
  motionprLenis,
  motionprLenis as default,
  readState,
  SUPPORTED_LENIS_RANGE,
} from "@motionpr/lenis";
export type { AttachOptions, LenisHandle, LenisLike } from "@motionpr/lenis";
