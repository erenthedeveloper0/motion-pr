// The brand mark at display size, drawn from brand/source/motionpr-logo.mjs. It follows the
// brand's loop spec (offset breathing between 100% and 30%, cubic-bezier(.65,0,.35,1), 1800 ms,
// alternate) while it is on screen, and holds the final pose with reduced motion.
import {
  markGeometry,
  MARK_OFFSET,
  GRADIENT_STOPS,
} from "../../../../../brand/source/motionpr-logo.mjs";
import { EASE, gsap, reducedMotion } from "../lib/motion.js";
import { s, watchVisibility } from "../lib/dom.js";

let n = 0;
export function mount(el, ctx) {
  const size = 512;
  const id = `mk-${++n}`;
  const grad = s(
    "linearGradient",
    { id, gradientUnits: "userSpaceOnUse", x1: 0, y1: size, x2: size, y2: 0 },
    ...GRADIENT_STOPS.map(([o, c]) => s("stop", { offset: o, "stop-color": c })),
  );
  const path = s("path", { fill: `url(#${id})`, d: markGeometry({ size }).path });
  el.append(
    s("svg", { viewBox: `0 0 ${size} ${size}`, "aria-hidden": "true" }, s("defs", {}, grad), path),
  );
  if (reducedMotion()) return;
  const state = { offset: MARK_OFFSET };
  const draw = () => path.setAttribute("d", markGeometry({ size, offset: state.offset }).path);
  let tween = null;
  ctx.track(
    watchVisibility(el, (visible) => {
      if (visible && !tween) {
        ctx.gsap(() => {
          tween = gsap.to(state, {
            offset: MARK_OFFSET * 0.3,
            duration: 1.8,
            ease: EASE.inOut,
            repeat: -1,
            yoyo: true,
            onUpdate: draw,
          });
        });
      } else if (!visible && tween) {
        tween.kill();
        tween = null;
      }
    }),
  );
  ctx.track(() => tween?.kill());
}
