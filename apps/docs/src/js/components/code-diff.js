// The one-line change: the removed line is struck through, the added line slides in after it.
import { DUR, EASE, gsap, reducedMotion } from "../lib/motion.js";
import { watchVisibility } from "../lib/dom.js";

export function mount(el, ctx) {
  if (reducedMotion()) return;
  const del = el.querySelector('[data-diff="del"]');
  const add = el.querySelector('[data-diff="add"]');
  if (!del || !add) return;
  gsap.set(add, { opacity: 0, x: 24 });
  gsap.set(del, { "--strike": 0 });
  const stop = watchVisibility(
    el,
    (visible) => {
      if (!visible) return;
      stop();
      ctx.gsap(() => {
        gsap
          .timeline({ delay: 0.2 })
          .to(del, { "--strike": 1, duration: DUR.story, ease: EASE.inOut })
          .to(del, { opacity: 0.55, duration: DUR.slow }, "<0.3")
          .to(add, { opacity: 1, x: 0, duration: DUR.story, ease: EASE.out }, "<0.1");
      });
    },
    "-15% 0px",
  );
  ctx.track(stop);
}
