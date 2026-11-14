// Tabs of equivalent code blocks (npm / pnpm / yarn / bun). WAI-ARIA tabs pattern with a gliding
// indicator; the chosen tab is remembered per label across pages.
import { DUR, EASE, gsap, reducedMotion } from "../lib/motion.js";

const KEY = "motionpr:tab";

export function mount(el, ctx) {
  const list = el.querySelector('[role="tablist"]');
  const tabs = [...el.querySelectorAll('[role="tab"]')];
  const panels = tabs.map((t) => document.getElementById(t.getAttribute("aria-controls")));
  const indicator = el.querySelector(".code-tabs__indicator");
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "copy code-tabs__copy";
  copy.dataset.copyPanel = "true";
  copy.setAttribute("aria-label", "Copy the selected command");
  copy.innerHTML = '<span class="copy-label">Copy</span>';
  el.append(copy);

  const place = (tab, animate) => {
    const box = tab.getBoundingClientRect();
    const base = list.getBoundingClientRect();
    const to = { x: box.left - base.left + list.scrollLeft, width: box.width };
    if (animate && !reducedMotion())
      gsap.to(indicator, { ...to, duration: DUR.slow, ease: EASE.out });
    else gsap.set(indicator, to);
  };
  const select = (i, { focus = false, animate = true, remember = true } = {}) => {
    tabs.forEach((t, j) => {
      const on = i === j;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      panels[j].hidden = !on;
    });
    if (focus) tabs[i].focus();
    place(tabs[i], animate);
    if (animate && !reducedMotion())
      gsap.fromTo(panels[i], { opacity: 0.4 }, { opacity: 1, duration: DUR.base, ease: EASE.out });
    if (remember)
      try {
        localStorage.setItem(KEY, tabs[i].textContent);
      } catch {
        /* storage unavailable */
      }
  };
  tabs.forEach((t, i) => t.addEventListener("click", () => select(i), { signal: ctx.signal }));
  list.addEventListener(
    "keydown",
    (e) => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      const n = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (n === undefined) return;
      e.preventDefault();
      select((n + tabs.length) % tabs.length, { focus: true });
    },
    { signal: ctx.signal },
  );
  let initial = 0;
  try {
    const saved = localStorage.getItem(KEY);
    const idx = tabs.findIndex((t) => t.textContent === saved);
    if (idx >= 0) initial = idx;
  } catch {
    /* storage unavailable */
  }
  select(initial, { animate: false, remember: false });
  const ro = new ResizeObserver(() =>
    place(
      tabs.find((t) => t.getAttribute("aria-selected") === "true"),
      false,
    ),
  );
  ro.observe(list);
  ctx.track(ro);
  ctx.track(() => copy.remove());
}
