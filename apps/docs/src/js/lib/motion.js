// Motion tokens and GSAP setup. Every animation on the site takes its timing from here, so the
// whole experience shares one rhythm. The curves are the brand's (brand/README.md, Motion):
// intro cubic-bezier(.16, 1, .3, 1) and loop cubic-bezier(.65, 0, .35, 1).
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { CustomEase } from "gsap/CustomEase";
import { Flip } from "gsap/Flip";

gsap.registerPlugin(ScrollTrigger, CustomEase, Flip);
CustomEase.create("mp.out", "0.16, 1, 0.3, 1");
CustomEase.create("mp.inOut", "0.65, 0, 0.35, 1");
CustomEase.create("mp.in", "0.7, 0, 0.84, 0");

/** Durations in seconds (GSAP); the CSS tokens in tokens.css carry the same values in ms. */
export const DUR = { instant: 0.09, quick: 0.16, base: 0.24, slow: 0.42, story: 0.8, intro: 1.6 };
export const EASE = { out: "mp.out", inOut: "mp.inOut", in: "mp.in", linear: "none" };
export const STAGGER = { tight: 0.018, base: 0.04, loose: 0.08 };

const query =
  typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
export const reducedMotion = () =>
  Boolean(query?.matches) || document.documentElement.dataset.motion === "reduce";
export function onReducedMotionChange(fn) {
  query?.addEventListener("change", fn);
  return () => query?.removeEventListener("change", fn);
}

gsap.defaults({ ease: EASE.out, duration: DUR.base });
// Keep GSAP from jumping after a long frame (tab switch) instead of catching up.
gsap.ticker.lagSmoothing(500, 33);

export { gsap, ScrollTrigger, Flip, CustomEase };
