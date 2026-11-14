// Scroll motion, as recorded: the demo app's Lenis scroll (lenis-journal) in both variants. The
// position and velocity curves are the recorded samples; the metrics are computed in the browser
// with MotionPR's own scrollMetrics(); the changes are the real comparison's.
import { DUR, EASE, gsap, reducedMotion } from "../lib/motion.js";
import { createClock } from "../lib/clock.js";
import { dataset } from "../lib/data.js";
import { scrollMetrics } from "../lib/engine.js";
import { h, pathFrom, s, watchVisibility } from "../lib/dom.js";
import { transport } from "./timeline.js";

const BLUE = "#839CF6";
const PEACH = "#ECA67A";

function positionAt(samples, t) {
  if (t <= samples[0].time) return samples[0].animatedScroll;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].time >= t) {
      const a = samples[i - 1];
      const b = samples[i];
      const k = (t - a.time) / (b.time - a.time || 1);
      return a.animatedScroll + (b.animatedScroll - a.animatedScroll) * k;
    }
  }
  return samples.at(-1).animatedScroll;
}

export async function mount(el, ctx) {
  const { data, set } = await dataset(el.dataset.dataset || "lenis-journal/scrolled");
  if (!ctx.isMounted()) return;
  const rb = set.scroll.baseline[0];
  const rc = set.scroll.candidate[0];
  const config = data.comparisonConfig;
  const mb = scrollMetrics(rb, config);
  const mc = scrollMetrics(rc, config);
  const comparison = set.scroll.comparisons[0];
  const tEnd = Math.ceil(Math.max(rb.samples.at(-1).time, rc.samples.at(-1).time) / 100) * 100;
  const lo = Math.min(mb.start, mc.start);
  const hi = Math.max(mb.end, mc.end, mb.target, mc.target);

  const W = 640;
  const Hp = 200;
  const Hv = 90;
  const L = 52;
  const R = 12;
  const x = (t) => L + (t / tEnd) * (W - L - R);
  const yPos = (v) => 12 + (1 - (v - lo) / (hi - lo || 1)) * (Hp - 30);
  const maxV = Math.max(mb.peakVelocity, mc.peakVelocity) * 1.1;
  const yVel = (v) => Hp + 20 + (1 - Math.abs(v) / maxV) * (Hv - 10);

  el.textContent = "";
  el.classList.add("scrollviz", "panel");
  const svg = s("svg", {
    class: "scrollviz__chart",
    viewBox: `0 0 ${W} ${Hp + Hv + 34}`,
    role: "img",
    "aria-label": "Scroll position and velocity over time, baseline and candidate",
  });
  for (let t = 0; t <= tEnd; t += 500) {
    svg.append(s("line", { x1: x(t), x2: x(t), y1: 8, y2: Hp + Hv + 12, class: "tl-grid" }));
    svg.append(
      s(
        "text",
        { x: x(t), y: Hp + Hv + 28, class: "tl-tick", "text-anchor": "middle" },
        document.createTextNode(`${t} ms`),
      ),
    );
  }
  svg.append(s("text", { x: 4, y: 20, class: "tl-tick" }, document.createTextNode("position")));
  svg.append(
    s("text", { x: 4, y: Hp + 34, class: "tl-tick" }, document.createTextNode("velocity")),
  );
  const lines = [];
  for (const [rec, met, color] of [
    [rb, mb, BLUE],
    [rc, mc, PEACH],
  ]) {
    const pos = s("path", {
      d: pathFrom(rec.samples.map((p) => [x(p.time), yPos(p.animatedScroll)])),
      class: "scrollviz__pos",
      stroke: color,
    });
    // Velocity derived from positions (px/ms), as MotionPR derives it.
    const vel = [];
    for (let i = 1; i < rec.samples.length; i++) {
      const a = rec.samples[i - 1];
      const b = rec.samples[i];
      const dt = b.time - a.time;
      if (dt > 0) vel.push([x(b.time), yVel((b.animatedScroll - a.animatedScroll) / dt)]);
    }
    const v = s("path", { d: pathFrom(vel), class: "scrollviz__vel", stroke: color });
    svg.append(pos, v);
    lines.push(pos, v);
    if (met.movementStart !== null && met.duration !== null) {
      const settle = met.movementStart + met.duration;
      svg.append(
        s("line", {
          x1: x(settle),
          x2: x(settle),
          y1: 8,
          y2: Hp + Hv + 12,
          stroke: color,
          "stroke-dasharray": "3 4",
          "stroke-opacity": 0.7,
        }),
      );
      svg.append(
        s(
          "text",
          { x: x(settle) + 4, y: color === BLUE ? 26 : 40, class: "tl-mark", fill: color },
          document.createTextNode(`settled ${Math.round(met.duration)} ms`),
        ),
      );
    }
  }
  const ph = s("line", { y1: 8, y2: Hp + Hv + 12, class: "tl-playhead" });
  svg.append(ph);

  // Two tiny viewports scroll through a page by the recorded positions.
  const vp = (label, color) => {
    const page = h(
      "div",
      { class: "scrollviz__page" },
      ...Array.from({ length: 14 }, (_, i) => h("i", { class: i === 10 ? "is-target" : "" })),
    );
    return {
      page,
      node: h(
        "div",
        { class: "scrollviz__vp" },
        h("span", { class: "label", style: `color:${color}` }, label),
        h("div", { class: "scrollviz__window" }, page),
      ),
    };
  };
  const vb = vp(`lerp ${rb.config.lerp}`, BLUE);
  const vc = vp(`lerp ${rc.config.lerp}`, PEACH);
  const metricRows = [
    ["Distance", `${Math.round(mb.distance)} px`, `${Math.round(mc.distance)} px`],
    ["Settle time", `${Math.round(mb.duration)} ms`, `${Math.round(mc.duration)} ms`],
    ["Peak velocity", `${mb.peakVelocity.toFixed(2)} px/ms`, `${mc.peakVelocity.toFixed(2)} px/ms`],
    ["Overshoot", `${mb.overshoot.toFixed(1)} px`, `${mc.overshoot.toFixed(1)} px`],
    ["Mean lag", `${mb.meanLag.toFixed(1)} px`, `${mc.meanLag.toFixed(1)} px`],
    ["Samples", String(mb.samples), String(mc.samples)],
  ];
  const table = h(
    "table",
    { class: "scrollviz__table" },
    h(
      "thead",
      {},
      h(
        "tr",
        {},
        h("th", {}, "scrollMetrics()"),
        h("th", { class: "baseline-text" }, "Baseline"),
        h("th", { class: "candidate-text" }, "Candidate"),
      ),
    ),
    h(
      "tbody",
      {},
      ...metricRows.map(([k, a, b]) =>
        h(
          "tr",
          {},
          h("th", { scope: "row" }, k),
          h("td", { class: "mono" }, a),
          h("td", { class: "mono" }, b),
        ),
      ),
    ),
  );
  const changes = h(
    "ul",
    { class: "timeline__changes" },
    ...comparison.changes.map((c) =>
      h(
        "li",
        {},
        h("span", { class: `sev sev--${c.severity}` }, c.severity),
        h("span", {}, c.message),
      ),
    ),
  );
  const clock = ctx.track(
    createClock({
      duration: tEnd,
      loop: true,
      hold: 1000,
      onTick: (t) => render(t),
      onState: ({ playing }) => tp.icon(playing),
    }),
  );
  const tp = transport(clock, tEnd, ctx.signal, { speeds: [0.5, 1, 2], initial: 1 });
  el.append(
    h(
      "div",
      { class: "timeline__head" },
      h(
        "span",
        { class: "label" },
        h("b", {}, set.scenario),
        " · Lenis · recorded live, never replayed",
      ),
      h(
        "span",
        { class: "timeline__legend label" },
        h("i", { class: "key key--b" }),
        `lerp ${rb.config.lerp}`,
        h("i", { class: "key key--c" }),
        `lerp ${rc.config.lerp}`,
      ),
    ),
    h(
      "div",
      { class: "scrollviz__body" },
      h("div", { class: "scrollviz__viewports" }, vb.node, vc.node),
      h("div", { class: "scrollviz__plot" }, svg, tp.node),
    ),
    h("div", { class: "scrollviz__foot" }, table, changes),
  );
  const pageH = () => vb.page.parentElement.clientHeight;
  function render(t) {
    ph.setAttribute("x1", x(t));
    ph.setAttribute("x2", x(t));
    tp.sync(t);
    for (const [view, rec] of [
      [vb, rb],
      [vc, rc],
    ]) {
      const p = (positionAt(rec.samples, t) - lo) / (hi - lo || 1);
      view.page.style.transform = `translateY(${(-p * (view.page.scrollHeight - pageH())).toFixed(2)}px)`;
    }
  }
  render(0);
  if (reducedMotion()) return render(tEnd);
  ctx.gsap(() => {
    for (const l of lines) {
      const len = l.getTotalLength();
      gsap.fromTo(
        l,
        { strokeDasharray: len, strokeDashoffset: len },
        {
          strokeDashoffset: 0,
          duration: 1.4,
          ease: EASE.out,
          scrollTrigger: { trigger: el, start: "top 80%", once: true },
        },
      );
    }
    gsap.from(table.querySelectorAll("tbody tr"), {
      opacity: 0,
      x: -8,
      duration: DUR.slow,
      stagger: 0.05,
      ease: EASE.out,
      scrollTrigger: { trigger: el, start: "top 70%", once: true },
    });
  });
  let started = false;
  ctx.track(
    watchVisibility(el, (visible) => {
      clock.setVisible(visible);
      if (visible && !started) {
        started = true;
        clock.play();
      }
    }),
  );
}
