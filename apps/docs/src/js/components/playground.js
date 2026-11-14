// Playground: change the candidate's duration, easing, delay and stagger; the preview plays both
// versions with the Web Animations API, and the report is produced by MotionPR's comparison
// engine (compareMatchedAnimation per element, compareStagger for the group) with its default
// thresholds and the fail-on level you choose. Records come from lib/records.js.
import { DUR, EASE, gsap, reducedMotion } from "../lib/motion.js";
import { createClock } from "../lib/clock.js";
import { loadSiteData } from "../lib/data.js";
import {
  compareMatchedAnimation,
  compareStagger,
  sampleEasing,
  tryParseCssEasing,
} from "../lib/engine.js";
import { buildRecord } from "../lib/records.js";
import { h } from "../lib/dom.js";
import { renderTimeline, transport } from "./timeline.js";

const N = 5;
const BASE = { duration: 320, easing: "cubic-bezier(0.16, 1, 0.3, 1)", delay: 0, stagger: 60 };
const EASINGS = [
  "cubic-bezier(0.16, 1, 0.3, 1)",
  "ease",
  "ease-out",
  "ease-in-out",
  "linear",
  "cubic-bezier(0.34, 1.56, 0.64, 1)",
  "cubic-bezier(0.65, 0, 0.35, 1)",
  "steps(4, end)",
];
const RANK = { critical: 3, warning: 2, info: 1, uncertain: 0 };

export async function mount(el, ctx) {
  const data = await loadSiteData();
  if (!ctx.isMounted()) return;
  const compact = el.hasAttribute("data-compact");
  const cand = { duration: 480, easing: "ease-in-out", delay: 0, stagger: 90 };
  let failOn = "critical";

  el.textContent = "";
  el.classList.add("playground", "panel", "panel--ticks");
  if (compact) el.classList.add("playground--compact");

  const slider = (label, key, min, max, step, unit) => {
    const out = h("output", { class: "mono" }, `${cand[key]}${unit}`);
    const input = h("input", {
      type: "range",
      class: "range",
      min,
      max,
      step,
      value: cand[key],
      "aria-label": `Candidate ${label}`,
    });
    input.addEventListener(
      "input",
      () => {
        cand[key] = Number(input.value);
        out.textContent = `${cand[key]}${unit}`;
        update();
      },
      { signal: ctx.signal },
    );
    return h(
      "label",
      { class: "field pg__field" },
      h("span", {}, label, h("em", { class: "pg__base" }, `baseline ${BASE[key]}${unit}`)),
      h("div", { class: "pg__row" }, input, out),
    );
  };
  const easingSelect = h(
    "select",
    { class: "select", "aria-label": "Candidate easing preset" },
    ...EASINGS.map((e) => h("option", { value: e, selected: e === cand.easing }, e)),
  );
  const easingInput = h("input", {
    class: "input",
    value: cand.easing,
    "aria-label": "Candidate easing",
    spellcheck: "false",
  });
  const easingError = h("span", { class: "lab__error", role: "alert" });
  easingSelect.addEventListener(
    "change",
    () => {
      easingInput.value = easingSelect.value;
      cand.easing = easingSelect.value;
      update();
    },
    { signal: ctx.signal },
  );
  easingInput.addEventListener(
    "input",
    () => {
      if (tryParseCssEasing(easingInput.value)) {
        cand.easing = easingInput.value.trim();
        easingInput.setAttribute("aria-invalid", "false");
        easingError.textContent = "";
        update();
      } else {
        easingInput.setAttribute("aria-invalid", "true");
        easingError.textContent = "Not a CSS easing";
      }
    },
    { signal: ctx.signal },
  );
  const failSelect = h(
    "select",
    { class: "select", "aria-label": "Fail on" },
    ...["critical", "warning", "info", "never"].map((v) =>
      h("option", { value: v, selected: v === failOn }, v),
    ),
  );
  failSelect.addEventListener(
    "change",
    () => {
      failOn = failSelect.value;
      update();
    },
    { signal: ctx.signal },
  );

  const rows = {
    baseline: h("div", { class: "pg__cards" }),
    candidate: h("div", { class: "pg__cards" }),
  };
  for (const which of ["baseline", "candidate"])
    for (let i = 0; i < N; i++) rows[which].append(h("i", { "data-motionpr-id": `card-${i + 1}` }));
  const replay = h("button", { type: "button", class: "button button--small" }, "Play both");
  const timelineBox = h("div", { class: "pg__timeline" });
  const report = h("div", { class: "pg__report", role: "status", "aria-live": "polite" });

  el.append(
    h(
      "div",
      { class: "pg__controls" },
      h(
        "p",
        { class: "label pg__legend" },
        "Candidate",
        h("span", {}, " · baseline is fixed: 320 ms, cubic-bezier(0.16, 1, 0.3, 1), stagger 60 ms"),
      ),
      slider("Duration", "duration", 80, 1400, 10, " ms"),
      h(
        "div",
        { class: "field pg__field" },
        h(
          "span",
          {},
          "Easing",
          h("em", { class: "pg__base" }, "baseline cubic-bezier(0.16, 1, 0.3, 1)"),
        ),
        easingSelect,
        easingInput,
        easingError,
      ),
      slider("Delay", "delay", 0, 600, 10, " ms"),
      slider("Stagger", "stagger", 0, 240, 5, " ms"),
      h(
        "label",
        { class: "field pg__field" },
        h("span", {}, "Fail on (comparison.failOn)"),
        failSelect,
      ),
    ),
    h(
      "div",
      { class: "pg__main" },
      h(
        "div",
        { class: "pg__preview" },
        h(
          "div",
          { class: "pg__lane" },
          h("span", { class: "label baseline-text" }, "Baseline"),
          rows.baseline,
        ),
        h(
          "div",
          { class: "pg__lane" },
          h("span", { class: "label candidate-text" }, "Candidate"),
          rows.candidate,
        ),
        replay,
      ),
      timelineBox,
      report,
    ),
  );

  let anims = [];
  const playPreview = () => {
    anims.forEach((a) => a.cancel());
    anims = [];
    const run = (which, p) =>
      [...rows[which].children].forEach((card, i) =>
        anims.push(
          card.animate(
            [
              { opacity: 0, transform: "translateY(24px)" },
              { opacity: 1, transform: "none" },
            ],
            {
              duration: p.duration,
              delay: p.delay + i * p.stagger,
              easing: p.easing,
              fill: "both",
            },
          ),
        ),
      );
    run("baseline", BASE);
    run("candidate", cand);
  };
  ctx.track(() => anims.forEach((a) => a.cancel()));
  replay.addEventListener("click", playPreview, { signal: ctx.signal });

  let clock = null;
  let view = null;
  let tp = null;
  function update() {
    const records = (p) =>
      Array.from({ length: N }, (_, i) =>
        buildRecord(data.template, {
          key: `motionpr-id:card-${i + 1}`,
          name: "reveal",
          duration: p.duration,
          delay: p.delay + i * p.stagger,
          easing: p.easing,
        }),
      );
    const b = records(BASE);
    const c = records(cand);
    const results = b.map((rb, i) =>
      compareMatchedAnimation(
        { baseline: rb, candidate: c[i], method: "exact", confidence: "high", notes: [] },
        data.comparisonConfig,
      ),
    );
    const stagger = compareStagger(b, c, data.comparisonConfig);
    const changes = [
      ...stagger.map((sg) => ({
        severity: sg.severity,
        rule: "stagger",
        who: `${sg.members} cards`,
        message: `Stagger interval ${sg.baselineInterval}ms → ${sg.candidateInterval}ms across ${sg.members} elements`,
      })),
      ...results.flatMap((r, i) => r.changes.map((ch) => ({ ...ch, who: `card-${i + 1}` }))),
    ];
    const counts = { critical: 0, warning: 0, info: 0, uncertain: 0 };
    for (const ch of changes) counts[ch.severity]++;
    const failed =
      failOn !== "never" &&
      changes.some((ch) => ch.severity !== "uncertain" && RANK[ch.severity] >= RANK[failOn]);

    // Report
    report.innerHTML = "";
    report.append(
      h(
        "div",
        { class: "pg__verdict" },
        h("span", { class: `pg__exit pg__exit--${failed ? 1 : 0}` }, `exit ${failed ? 1 : 0}`),
        h(
          "p",
          {},
          failed
            ? "Regression: a difference reached "
            : changes.length
              ? "Within thresholds: nothing reached "
              : "No differences. ",
          changes.length || failed ? h("code", {}, `failOn: "${failOn}"`) : "",
        ),
        h(
          "p",
          { class: "pg__counts label" },
          ...Object.entries(counts).map(([k, n]) =>
            h("span", { class: `sev sev--${k}` }, `${n} ${k}`),
          ),
        ),
      ),
      h(
        "ul",
        { class: "pg__changes" },
        ...changes
          .slice(0, compact ? 5 : 12)
          .map((ch) =>
            h(
              "li",
              {},
              h("span", { class: `sev sev--${ch.severity}` }, ch.severity),
              h("span", { class: "label" }, ch.who),
              h("span", {}, ch.message),
              h("span", { class: "label pg__rule" }, ch.rule),
            ),
          ),
      ),
      changes.length > (compact ? 5 : 12)
        ? h("p", { class: "label" }, `+ ${changes.length - (compact ? 5 : 12)} more`)
        : "",
      h(
        "p",
        { class: "label pg__source" },
        "compareMatchedAnimation + compareStagger from @motionpr/comparison, run in your browser",
      ),
    );

    // Timeline of both versions
    const side = (r) => ({
      start: 0,
      delay: r.timing.delay,
      duration: r.timing.duration,
      easing: { samples: r.timing.effectiveEasing.samples },
    });
    const tracks = b.map((rb, i) => ({
      label: `card-${i + 1}`,
      status: results[i].status,
      baseline: side(rb),
      candidate: side(c[i]),
    }));
    const windowEnd =
      Math.ceil(
        Math.max(...[...b, ...c].map((r) => r.timing.delay + r.timing.duration), 400) / 100,
      ) *
        100 +
      50;
    timelineBox.innerHTML = "";
    view = renderTimeline(tracks, {
      windowEnd,
      rowHeight: 26,
      labelWidth: 70,
      width: Math.max(520, Math.round(timelineBox.clientWidth || 620)),
    });
    if (!clock) {
      clock = ctx.track(
        createClock({
          duration: windowEnd,
          onTick: (t) => {
            view?.setTime(t);
            tp?.sync(t);
          },
          onState: ({ playing }) => tp?.icon(playing),
        }),
      );
    } else clock.setDuration(windowEnd);
    tp = transport(clock, windowEnd, ctx.signal, { speeds: [0.25, 0.5, 1], initial: 1 });
    timelineBox.append(view.svg, tp.node);
    clock.seek(clock.time);
    void sampleEasing;
  }
  update();
  replay.addEventListener(
    "click",
    () => {
      clock?.seek(0);
      clock?.play();
    },
    { signal: ctx.signal },
  );
  if (!reducedMotion())
    ctx.gsap(() =>
      gsap.from(el.querySelectorAll(".pg__field"), {
        opacity: 0,
        y: 10,
        duration: DUR.slow,
        ease: EASE.out,
        stagger: 0.05,
      }),
    );
  playPreview();
}
