// Scroll laboratory: a real Lenis instance on a scroll container. Each movement is recorded from
// Lenis's public state (the same fields MotionPR's Lenis adapter reads) and measured with
// MotionPR's scrollMetrics(). The last two movements are shown side by side, like a comparison.
import Lenis from "lenis";
import { reducedMotion } from "../lib/motion.js";
import { loadSiteData } from "../lib/data.js";
import { scrollMetrics } from "../lib/engine.js";
import { h, pathFrom, s } from "../lib/dom.js";

export async function mount(el, ctx) {
  const data = await loadSiteData();
  if (!ctx.isMounted()) return;
  const config = data.comparisonConfig;
  el.textContent = "";
  el.classList.add("scrolllab", "panel");
  const content = h(
    "div",
    { class: "scrolllab__content" },
    ...Array.from({ length: 24 }, (_, i) =>
      h(
        "p",
        {},
        h("span", { class: "label" }, `section ${String(i + 1).padStart(2, "0")}`),
        h("i"),
      ),
    ),
  );
  const wrapper = h(
    "div",
    { class: "scrolllab__wrapper", tabindex: "0", "aria-label": "Scrollable area driven by Lenis" },
    content,
  );
  const lerp = h("input", {
    type: "range",
    class: "range",
    min: 0.02,
    max: 0.3,
    step: 0.01,
    value: 0.1,
    "aria-label": "Lenis lerp",
  });
  const lerpOut = h("output", { class: "mono" }, "0.10");
  const jump = h(
    "button",
    { type: "button", class: "button button--ghost button--small" },
    "scrollTo next section",
  );
  const svg = s("svg", {
    class: "scrolllab__chart",
    viewBox: "0 0 400 160",
    role: "img",
    "aria-label": "Recorded scroll movements",
  });
  const table = h("table", { class: "scrollviz__table" });
  const note = h(
    "p",
    { class: "label scrolllab__note" },
    reducedMotion()
      ? "Reduced motion is on: Lenis is created with lerp 1 (no smoothing)."
      : "Scroll inside the frame, or press the button.",
  );
  el.append(
    h(
      "div",
      { class: "scrolllab__body" },
      h("div", { class: "scrolllab__frame" }, wrapper),
      h(
        "div",
        { class: "scrolllab__side" },
        h(
          "label",
          { class: "field" },
          h("span", {}, "lerp"),
          h("div", { class: "scrolllab__row" }, lerp, lerpOut),
        ),
        jump,
        svg,
        table,
        note,
      ),
    ),
  );

  let lenis = null;
  const create = () => {
    lenis?.destroy();
    lenis = new Lenis({
      wrapper,
      content,
      lerp: reducedMotion() ? 1 : Number(lerp.value),
      autoRaf: true,
      smoothWheel: true,
    });
    lenis.on("scroll", onScroll);
  };
  ctx.track(() => lenis?.destroy());

  const runs = [];
  let current = null;
  let t0 = 0;
  let settleTimer = 0;
  function onScroll(l) {
    const now = performance.now();
    if (!current) {
      t0 = now;
      current = {
        id: `lenis:lab:vertical`,
        source: "lenis",
        axis: "vertical",
        config: { lerp: l.options.lerp },
        samples: [],
      };
    }
    current.samples.push({
      time: now - t0,
      actualScroll: l.actualScroll,
      animatedScroll: l.animatedScroll,
      targetScroll: l.targetScroll,
      progress: l.progress,
      velocity: l.velocity,
      direction: l.direction,
      isScrolling: l.isScrolling,
      isStopped: l.isStopped,
      limit: l.limit,
    });
    clearTimeout(settleTimer);
    settleTimer = setTimeout(finish, 180);
  }
  function finish() {
    if (!current || current.samples.length < 3) {
      current = null;
      return;
    }
    runs.push({ record: current, metrics: scrollMetrics(current, config) });
    if (runs.length > 2) runs.shift();
    current = null;
    draw();
  }
  ctx.track(() => clearTimeout(settleTimer));

  function draw() {
    svg.textContent = "";
    const colors = ["#839CF6", "#ECA67A"];
    const maxT = Math.max(...runs.map((r) => r.record.samples.at(-1).time), 1);
    runs.forEach((run, i) => {
      const smp = run.record.samples;
      const a = smp[0].animatedScroll;
      const b = smp.at(-1).animatedScroll;
      const span = Math.abs(b - a) || 1;
      const pts = smp.map((p) => [
        10 + (p.time / maxT) * 380,
        150 - (Math.abs(p.animatedScroll - a) / span) * 135,
      ]);
      svg.append(
        s("path", {
          d: pathFrom(pts),
          fill: "none",
          stroke: colors[runs.length === 1 ? 0 : i],
          "stroke-width": 2,
        }),
      );
    });
    table.innerHTML = "";
    const head = h(
      "tr",
      {},
      h("th", {}, "scrollMetrics()"),
      ...runs.map((r, i) =>
        h(
          "th",
          { class: runs.length === 1 || i === 0 ? "baseline-text" : "candidate-text" },
          `lerp ${r.record.config.lerp}`,
        ),
      ),
    );
    const rows = [
      ["Distance", (m) => `${Math.round(m.distance)} px`],
      ["Settle time", (m) => (m.duration === null ? "—" : `${Math.round(m.duration)} ms`)],
      ["Peak velocity", (m) => `${m.peakVelocity.toFixed(2)} px/ms`],
      ["Overshoot", (m) => `${m.overshoot.toFixed(1)} px`],
      ["Samples", (m) => String(m.samples)],
    ];
    table.append(
      h("thead", {}, head),
      h(
        "tbody",
        {},
        ...rows.map(([k, f]) =>
          h(
            "tr",
            {},
            h("th", { scope: "row" }, k),
            ...runs.map((r) => h("td", { class: "mono" }, f(r.metrics))),
          ),
        ),
      ),
    );
  }

  lerp.addEventListener(
    "input",
    () => {
      lerpOut.textContent = Number(lerp.value).toFixed(2);
    },
    { signal: ctx.signal },
  );
  lerp.addEventListener("change", create, { signal: ctx.signal });
  jump.addEventListener(
    "click",
    () => {
      const sections = [...content.children];
      const next = sections.find((p) => p.offsetTop > wrapper.scrollTop + 10) ?? sections[0];
      lenis?.scrollTo(next, { offset: 0 });
    },
    { signal: ctx.signal },
  );
  create();
}
