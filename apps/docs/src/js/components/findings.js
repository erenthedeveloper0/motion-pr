// The real findings for one recorded animation, revealed one by one as they come into view.
import { DUR, EASE, gsap, reducedMotion } from "../lib/motion.js";
import { dataset } from "../lib/data.js";
import { h, watchVisibility } from "../lib/dom.js";

const RULE_LABEL = {
  duration: "Duration",
  easing: "Easing",
  trajectory: "Trajectory",
  delay: "Delay",
  opacity: "Opacity",
  size: "Size",
};

export async function mount(el, ctx) {
  const { set } = await dataset(el.dataset.dataset);
  if (!ctx.isMounted()) return;
  const track = set.tracks.find((t) => t.key === el.dataset.track);
  if (!track) return;
  el.textContent = "";
  for (const ch of track.changes) {
    el.append(
      h(
        "li",
        { class: "finding-row" },
        h("span", { class: `sev sev--${ch.severity}` }, ch.severity),
        h("span", { class: "finding-row__rule label" }, RULE_LABEL[ch.rule] ?? ch.rule),
        h("span", { class: "finding-row__msg" }, ch.message),
        h("span", { class: "finding-row__how label" }, ch.measurement),
      ),
    );
  }
  if (reducedMotion()) return;
  const rows = [...el.children];
  gsap.set(rows, { opacity: 0, x: 18 });
  const stop = watchVisibility(
    el,
    (visible) => {
      if (!visible) return;
      stop();
      ctx.gsap(() =>
        gsap.to(rows, {
          opacity: 1,
          x: 0,
          duration: DUR.story,
          ease: EASE.out,
          stagger: 0.14,
          delay: 0.35,
        }),
      );
    },
    "-10% 0px",
  );
  ctx.track(stop);
}
