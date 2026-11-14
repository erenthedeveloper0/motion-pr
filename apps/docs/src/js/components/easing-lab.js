// Easing laboratory. Everything it computes comes from MotionPR's own code, bundled for the
// browser: parseCssEasing / sampleEasing / compareEasingSamples / describeEasingShape from
// @motionpr/core, and the verdict from compareMatchedAnimation (@motionpr/comparison) run on two
// records that differ only in their easing, with MotionPR's default thresholds.
import { DUR, EASE, gsap, reducedMotion } from "../lib/motion.js";
import { createClock } from "../lib/clock.js";
import { loadSiteData } from "../lib/data.js";
import {
  compareEasingSamples,
  compareMatchedAnimation,
  describeEasingShape,
  formatCssEasing,
  sampleEasing,
  tryParseCssEasing,
} from "../lib/engine.js";
import { buildRecord } from "../lib/records.js";
import { clamp, h, pathFrom, s, watchVisibility } from "../lib/dom.js";

const PRESETS = [
  "linear",
  "ease",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "cubic-bezier(0.16, 1, 0.3, 1)",
  "cubic-bezier(0.65, 0, 0.35, 1)",
  "cubic-bezier(0.34, 1.56, 0.64, 1)",
  "cubic-bezier(0.25, 0.1, 0.25, 1)",
  "steps(5, end)",
  "linear(0, 0.6 30%, 0.9 60%, 1)",
];
const COLORS = { baseline: "#839CF6", candidate: "#ECA67A" };

export async function mount(el, ctx) {
  const data = await loadSiteData();
  if (!ctx.isMounted()) return;
  const compact = el.hasAttribute("data-compact");
  const config = data.comparisonConfig;
  const state = {
    baseline: el.dataset.baseline || "ease-out",
    candidate: el.dataset.candidate || "ease-in-out",
    active: "candidate",
  };

  // Chart geometry: output range −0.25..1.25 so overshooting curves stay visible.
  const W = 420;
  const H = 360;
  const P = 34;
  const X = (v) => P + v * (W - 2 * P);
  const Y = (v) => H - P - ((v + 0.25) / 1.5) * (H - 2 * P);
  const inv = (px, py) => ({
    x: (px - P) / (W - 2 * P),
    y: ((H - P - py) / (H - 2 * P)) * 1.5 - 0.25,
  });

  el.textContent = "";
  el.classList.add("lab", "panel", "panel--ticks");
  if (compact) el.classList.add("lab--compact");
  const svg = s("svg", {
    class: "lab__chart",
    viewBox: `0 0 ${W} ${H}`,
    role: "img",
    "aria-label": "Easing curves: progress over time",
  });
  for (let k = 0; k <= 4; k++) {
    svg.append(
      s("line", { x1: X(k / 4), x2: X(k / 4), y1: Y(-0.25), y2: Y(1.25), class: "lab__grid" }),
    );
    svg.append(
      s(
        "text",
        { x: X(k / 4), y: H - 12, class: "lab__tick", "text-anchor": "middle" },
        document.createTextNode(`${k * 25}%`),
      ),
    );
  }
  for (const v of [0, 1]) {
    svg.append(s("line", { x1: X(0), x2: X(1), y1: Y(v), y2: Y(v), class: "lab__axis" }));
    svg.append(
      s(
        "text",
        { x: P - 8, y: Y(v) + 4, class: "lab__tick", "text-anchor": "end" },
        document.createTextNode(String(v)),
      ),
    );
  }
  const area = s("path", { class: "lab__area" });
  const curves = {
    baseline: s("path", { class: "lab__curve", stroke: COLORS.baseline }),
    candidate: s("path", { class: "lab__curve", stroke: COLORS.candidate }),
  };
  const dev = s("line", { class: "lab__dev" });
  const devLabel = s("text", { class: "lab__devlabel" });
  const playLine = s("line", { y1: Y(-0.25), y2: Y(1.25), class: "lab__playhead" });
  const dots = {
    baseline: s("circle", { r: 5, fill: COLORS.baseline }),
    candidate: s("circle", { r: 5, fill: COLORS.candidate }),
  };
  const handles = s("g", { class: "lab__handles" });
  svg.append(
    area,
    curves.baseline,
    curves.candidate,
    dev,
    devLabel,
    playLine,
    dots.baseline,
    dots.candidate,
    handles,
  );

  const inputFor = (which) => {
    const input = h("input", {
      class: "input",
      value: state[which],
      "aria-label": `${which} easing`,
      spellcheck: "false",
    });
    const select = h(
      "select",
      { class: "select", "aria-label": `${which} preset` },
      h("option", { value: "" }, "Presets…"),
      ...PRESETS.map((p) => h("option", { value: p }, p)),
    );
    const error = h("span", { class: "lab__error", role: "alert" });
    const radio = h("input", {
      type: "radio",
      name: `lab-active-${Math.random().toString(36).slice(2, 6)}`,
      value: which,
      checked: which === state.active,
      "aria-label": `Edit the ${which} curve's handles`,
    });
    return {
      input,
      select,
      error,
      radio,
      node: h(
        "div",
        { class: `lab__input lab__input--${which}` },
        h(
          "label",
          { class: "lab__key" },
          radio,
          h("span", { class: `key key--${which[0]}` }),
          h("span", { class: "label" }, which),
        ),
        input,
        select,
        error,
      ),
    };
  };
  const ui = { baseline: inputFor("baseline"), candidate: inputFor("candidate") };
  ui.candidate.radio.name = ui.baseline.radio.name;
  const tracks = {
    baseline: h("i", { class: "lab__ball lab__ball--b" }),
    candidate: h("i", { class: "lab__ball lab__ball--c" }),
  };
  const metrics = h("dl", { class: "lab__metrics" });
  const verdict = h("div", { class: "lab__verdict", role: "status", "aria-live": "polite" });
  const clock = ctx.track(
    createClock({
      duration: 1400,
      loop: true,
      hold: 700,
      onTick: (t) => draw(t / 1400),
      onState: ({ playing }) => (playBtn.textContent = playing ? "Pause" : "Play"),
    }),
  );
  const playBtn = h(
    "button",
    { type: "button", class: "button button--ghost button--small" },
    "Play",
  );
  const scrub = h("input", {
    type: "range",
    class: "range",
    min: 0,
    max: 1000,
    value: 0,
    "aria-label": "Input progress",
  });
  playBtn.addEventListener("click", () => clock.toggle(), { signal: ctx.signal });
  scrub.addEventListener(
    "input",
    () => {
      clock.pause();
      draw(Number(scrub.value) / 1000);
    },
    { signal: ctx.signal },
  );

  el.append(
    h("div", { class: "lab__controls" }, ui.baseline.node, ui.candidate.node),
    h(
      "div",
      { class: "lab__body" },
      h(
        "div",
        { class: "lab__plot" },
        svg,
        h(
          "div",
          { class: "lab__tracks", "aria-hidden": "true" },
          h("div", { class: "lab__track" }, tracks.baseline),
          h("div", { class: "lab__track" }, tracks.candidate),
        ),
        h("div", { class: "lab__transport" }, playBtn, scrub),
      ),
      h("div", { class: "lab__side" }, verdict, metrics),
    ),
    h(
      "p",
      { class: "lab__source label" },
      "Computed in your browser with MotionPR's easing and comparison code · default thresholds",
    ),
  );

  let samples = { baseline: null, candidate: null };
  let cmp = null;
  let progress = 0;

  function recompute() {
    for (const which of ["baseline", "candidate"]) {
      const parsed = tryParseCssEasing(state[which]);
      ui[which].input.setAttribute("aria-invalid", String(!parsed));
      ui[which].error.textContent = parsed ? "" : "Not a CSS easing";
      if (parsed) samples[which] = sampleEasing(parsed);
    }
    if (!samples.baseline || !samples.candidate) return;
    cmp = compareEasingSamples(samples.baseline, samples.candidate);
    // The verdict, exactly as MotionPR would grade it in a comparison.
    const base = buildRecord(data.template, {
      key: "motionpr-id:lab",
      name: "lab",
      duration: 400,
      delay: 0,
      easing: state.baseline,
    });
    const cand = buildRecord(data.template, {
      key: "motionpr-id:lab",
      name: "lab",
      duration: 400,
      delay: 0,
      easing: state.candidate,
    });
    // Same sampled values on both sides: only the easing is under test here.
    cand.samples = base.samples;
    const result = compareMatchedAnimation(
      { baseline: base, candidate: cand, method: "exact", confidence: "high", notes: [] },
      config,
    );
    const change = result.changes.find((c) => c.kind === "easing");
    verdict.innerHTML = "";
    verdict.append(
      h("p", { class: "label" }, "MotionPR would report"),
      change
        ? h(
            "p",
            { class: "lab__verdict-line" },
            h("span", { class: `sev sev--${change.severity}` }, change.severity),
            h("span", {}, change.message),
          )
        : h(
            "p",
            { class: "lab__verdict-line" },
            h("span", { class: "sev sev--none" }, "no change"),
            h(
              "span",
              {},
              cmp.equivalent
                ? "The curves are equivalent."
                : `Max deviation ${(cmp.maxDeviation * 100).toFixed(2)}% is within the ${config.easing.tolerance * 100}% tolerance.`,
            ),
          ),
    );
    metrics.innerHTML = "";
    const row = (k, v) =>
      metrics.append(h("div", {}, h("dt", { class: "label" }, k), h("dd", { class: "mono" }, v)));
    row(
      "Max deviation",
      `${(cmp.maxDeviation * 100).toFixed(1)}% at ${Math.round(cmp.maxDeviationAt * 100)}%`,
    );
    row("Mean deviation", `${(cmp.meanDeviation * 100).toFixed(1)}%`);
    for (const c of cmp.checkpoints)
      row(`Δ at ${c.at * 100}%`, `${c.delta > 0 ? "+" : ""}${(c.delta * 100).toFixed(1)}%`);
    row("Baseline shape", describeEasingShape(samples.baseline));
    row("Candidate shape", describeEasingShape(samples.candidate));
    renderCurves();
  }

  function curvePath(arr) {
    return pathFrom(arr.map((v, i) => [X(i / (arr.length - 1)), Y(v)]));
  }
  function renderCurves() {
    curves.baseline.setAttribute("d", curvePath(samples.baseline));
    curves.candidate.setAttribute("d", curvePath(samples.candidate));
    const n = samples.baseline.length;
    const top = samples.baseline.map((v, i) => [X(i / (n - 1)), Y(v)]);
    const bottom = samples.candidate.map((v, i) => [X(i / (n - 1)), Y(v)]).reverse();
    area.setAttribute("d", `${pathFrom(top)}L${pathFrom(bottom).slice(1)}Z`);
    const at = cmp.maxDeviationAt;
    const i = Math.round(at * (n - 1));
    dev.setAttribute("x1", X(at));
    dev.setAttribute("x2", X(at));
    dev.setAttribute("y1", Y(samples.baseline[i]));
    dev.setAttribute("y2", Y(samples.candidate[i]));
    devLabel.setAttribute("x", X(at) + 8);
    devLabel.setAttribute("y", (Y(samples.baseline[i]) + Y(samples.candidate[i])) / 2 + 4);
    devLabel.textContent =
      cmp.maxDeviation > 0.0001 ? `Δ ${(cmp.maxDeviation * 100).toFixed(0)}%` : "";
    renderHandles();
    draw(progress);
  }
  function renderHandles() {
    handles.textContent = "";
    const parsed = tryParseCssEasing(state[state.active]);
    if (!parsed || parsed.type !== "cubic-bezier") return;
    const color = COLORS[state.active];
    const pts = [
      [0, 0, parsed.x1, parsed.y1],
      [1, 1, parsed.x2, parsed.y2],
    ];
    pts.forEach(([ax, ay, px, py], k) => {
      handles.append(
        s("line", { x1: X(ax), y1: Y(ay), x2: X(px), y2: Y(py), stroke: color, class: "lab__arm" }),
      );
      const knob = s("circle", {
        cx: X(px),
        cy: Y(py),
        r: 7,
        class: "lab__knob",
        stroke: color,
        tabindex: 0,
        role: "slider",
        "aria-label": `Control point ${k + 1} of the ${state.active} curve`,
        "aria-valuetext": `${px.toFixed(2)}, ${py.toFixed(2)}`,
      });
      knob.addEventListener("pointerdown", (e) => startDrag(e, k), { signal: ctx.signal });
      knob.addEventListener("keydown", (e) => nudge(e, k), { signal: ctx.signal });
      handles.append(knob);
    });
  }
  function setBezier(k, x, y) {
    const parsed = tryParseCssEasing(state[state.active]);
    if (!parsed || parsed.type !== "cubic-bezier") return;
    const p = { ...parsed, keyword: undefined };
    if (k === 0) [p.x1, p.y1] = [clamp(x, 0, 1), clamp(y, -0.5, 1.5)];
    else [p.x2, p.y2] = [clamp(x, 0, 1), clamp(y, -0.5, 1.5)];
    const r2 = (n) => Math.round(n * 100) / 100;
    state[state.active] = formatCssEasing({
      type: "cubic-bezier",
      x1: r2(p.x1),
      y1: r2(p.y1),
      x2: r2(p.x2),
      y2: r2(p.y2),
    });
    ui[state.active].input.value = state[state.active];
    recompute();
  }
  function startDrag(e, k) {
    e.preventDefault();
    const rect = svg.getBoundingClientRect();
    const move = (ev) => {
      const p = inv(
        ((ev.clientX - rect.left) / rect.width) * W,
        ((ev.clientY - rect.top) / rect.height) * H,
      );
      setBezier(k, p.x, p.y);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move, { signal: ctx.signal });
    window.addEventListener("pointerup", up, { signal: ctx.signal });
  }
  function nudge(e, k) {
    const parsed = tryParseCssEasing(state[state.active]);
    if (!parsed || parsed.type !== "cubic-bezier") return;
    const d = e.shiftKey ? 0.1 : 0.01;
    const [x, y] = k === 0 ? [parsed.x1, parsed.y1] : [parsed.x2, parsed.y2];
    const map = {
      ArrowLeft: [x - d, y],
      ArrowRight: [x + d, y],
      ArrowUp: [x, y + d],
      ArrowDown: [x, y - d],
    };
    if (!map[e.key]) return;
    e.preventDefault();
    setBezier(k, ...map[e.key]);
    handles.querySelectorAll(".lab__knob")[k]?.focus();
  }
  function valueAt(arr, x) {
    const pos = clamp(x, 0, 1) * (arr.length - 1);
    const i = Math.floor(pos);
    const j = Math.min(arr.length - 1, i + 1);
    return arr[i] + (arr[j] - arr[i]) * (pos - i);
  }
  function draw(p) {
    progress = p;
    if (!samples.baseline) return;
    playLine.setAttribute("x1", X(p));
    playLine.setAttribute("x2", X(p));
    for (const which of ["baseline", "candidate"]) {
      const v = valueAt(samples[which], p);
      dots[which].setAttribute("cx", X(p));
      dots[which].setAttribute("cy", Y(v));
      tracks[which].style.left = `calc(${(clamp(v, -0.25, 1.25) * 100).toFixed(2)}% * 0.84 + 8%)`;
    }
    scrub.value = String(Math.round(p * 1000));
  }

  for (const which of ["baseline", "candidate"]) {
    const { input, select, radio } = ui[which];
    input.addEventListener(
      "input",
      () => {
        state[which] = input.value;
        recompute();
      },
      { signal: ctx.signal },
    );
    select.addEventListener(
      "change",
      () => {
        if (!select.value) return;
        state[which] = select.value;
        input.value = select.value;
        select.value = "";
        recompute();
        if (!reducedMotion())
          for (const c of Object.values(curves))
            gsap.fromTo(c, { opacity: 0.3 }, { opacity: 1, duration: DUR.slow, ease: EASE.out });
      },
      { signal: ctx.signal },
    );
    radio.addEventListener(
      "change",
      () => {
        state.active = which;
        renderHandles();
      },
      { signal: ctx.signal },
    );
  }
  recompute();
  if (reducedMotion()) return;
  ctx.gsap(() => {
    for (const c of Object.values(curves)) {
      const len = c.getTotalLength();
      gsap.fromTo(
        c,
        { strokeDasharray: len, strokeDashoffset: len },
        {
          strokeDashoffset: 0,
          duration: 1.2,
          ease: EASE.out,
          clearProps: "strokeDasharray,strokeDashoffset",
          scrollTrigger: { trigger: el, start: "top 80%", once: true },
        },
      );
    }
    gsap.from(area, {
      opacity: 0,
      duration: 1,
      delay: 0.5,
      scrollTrigger: { trigger: el, start: "top 80%", once: true },
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
