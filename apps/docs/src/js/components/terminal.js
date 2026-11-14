// Terminal output appears line by line at roughly the pace the CLI prints it.
import { gsap, reducedMotion } from "../lib/motion.js";
import { watchVisibility } from "../lib/dom.js";

export function mount(el, ctx) {
  if (reducedMotion()) return;
  const code = el.querySelector("code");
  if (!code) return;
  // Wrap each line so it can be revealed without changing the text.
  const lines = code.innerHTML.split("\n");
  code.innerHTML = lines.map((l) => `<span class="t-line">${l || " "}</span>`).join("\n");
  const spans = [...code.querySelectorAll(".t-line")];
  gsap.set(spans, { opacity: 0 });
  const stop = watchVisibility(
    el,
    (visible) => {
      if (!visible) return;
      stop();
      ctx.gsap(() => {
        const tl = gsap.timeline({ delay: 0.2 });
        spans.forEach((span, i) => {
          const pause = /✔|Baseline|Result/.test(span.textContent) ? 0.32 : 0.07;
          tl.to(span, { opacity: 1, duration: 0.18, ease: "none" }, i === 0 ? 0 : `+=${pause}`);
        });
      });
    },
    "-10% 0px",
  );
  ctx.track(stop);
}
