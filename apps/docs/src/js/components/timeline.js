// Timeline visualization: one row per animation, baseline (blue) and candidate (peach) bars with
// delay, duration and the easing curve inside, timeline labels, and a shared playhead. Used for
// real datasets (docs, demo page) and for the playground's generated records.
import { DUR, EASE, gsap, reducedMotion } from "../lib/motion.js";
import { createClock } from "../lib/clock.js";
import { dataset, engineOf, shortKey } from "../lib/data.js";
import { easedAt, h, pathFrom, s, watchVisibility } from "../lib/dom.js";

const BLUE = "#839CF6";
const PEACH = "#ECA67A";

/**
 * Renders tracks into an SVG and returns { svg, setTime(t) }. `tracks`: [{ label, status,
 * severity, baseline, candidate }] with sides { start, delay, duration, easing: { samples } }.
 */
export function renderTimeline(
  tracks,
  { windowEnd, labels = null, rowHeight = 30, labelWidth = 150, width = 760 } = {},
) {
  const W = width;
  const top = labels ? 40 : 24;
  const H = top + tracks.length * rowHeight + 14;
  const x = (t) => labelWidth + (t / windowEnd) * (W - labelWidth - 14);
  const svg = s("svg", {
    class: "timeline__svg",
    viewBox: `0 0 ${W} ${H}`,
    role: "img",
    "aria-label": `Timeline of ${tracks.length} animations, baseline and candidate`,
  });
  const step = windowEnd > 1600 ? 400 : windowEnd > 800 ? 200 : 100;
  for (let t = 0; t <= windowEnd; t += step) {
    svg.append(s("line", { x1: x(t), x2: x(t), y1: top - 6, y2: H - 8, class: "tl-grid" }));
    svg.append(
      s(
        "text",
        { x: x(t), y: 12, class: "tl-tick", "text-anchor": "middle" },
        document.createTextNode(`${t} ms`),
      ),
    );
  }
  if (labels) {
    for (const [side, color, y] of [
      ["baseline", BLUE, 22],
      ["candidate", PEACH, 32],
    ]) {
      for (const l of labels[side] ?? []) {
        svg.append(
          s("line", {
            x1: x(l.time),
            x2: x(l.time),
            y1: y - 5,
            y2: H - 8,
            stroke: color,
            "stroke-opacity": 0.35,
            "stroke-dasharray": "2 3",
          }),
        );
        svg.append(
          s(
            "text",
            { x: x(l.time) + 3, y, class: "tl-mark", fill: color },
            document.createTextNode(l.name),
          ),
        );
      }
    }
  }
  const curves = [];
  tracks.forEach((t, i) => {
    const y = top + i * rowHeight;
    const g = s("g", { class: `tl-row tl-row--${t.status}` });
    if (t.status !== "unchanged")
      g.append(s("rect", { x: 0, y: y - 2, width: W, height: rowHeight - 2, class: "tl-rowbg" }));
    g.append(
      s(
        "text",
        { x: labelWidth - 10, y: y + rowHeight / 2 + 1, class: "tl-label", "text-anchor": "end" },
        document.createTextNode(t.label),
      ),
    );
    const lane = (side, color, yy, hh) => {
      if (!side) return;
      const d0 = x(side.start ?? 0);
      const a0 = x((side.start ?? 0) + (side.delay ?? 0));
      const a1 = x((side.start ?? 0) + (side.delay ?? 0) + (side.duration ?? 0));
      if (a0 > d0)
        g.append(
          s("rect", { x: d0, y: yy, width: a0 - d0, height: hh, class: "tl-delay", stroke: color }),
        );
      g.append(
        s("rect", {
          x: a0,
          y: yy,
          width: Math.max(1, a1 - a0),
          height: hh,
          rx: 2.5,
          fill: color,
          "fill-opacity": 0.14,
          stroke: color,
          "stroke-opacity": 0.6,
        }),
      );
      if (side.easing?.samples?.length) {
        const pts = side.easing.samples.map((v, k, a) => [
          a0 + ((a1 - a0) * k) / (a.length - 1),
          yy + hh - 1.5 - Math.max(-0.2, Math.min(1.2, v)) * (hh - 3),
        ]);
        const c = s("path", {
          d: pathFrom(pts),
          fill: "none",
          stroke: color,
          "stroke-width": 1.3,
          class: "tl-curve",
        });
        g.append(c);
        curves.push(c);
      }
    };
    const hh = (rowHeight - 8) / 2;
    lane(t.baseline, BLUE, y + 1, hh);
    lane(t.candidate, PEACH, y + 2 + hh, hh);
    if (t.status === "added" || t.status === "removed")
      g.append(
        s(
          "text",
          {
            x: W - 16,
            y: y + rowHeight / 2 + 1,
            class: `tl-tag tl-tag--${t.status}`,
            "text-anchor": "end",
          },
          document.createTextNode(t.status === "added" ? "new" : "gone"),
        ),
      );
    svg.append(g);
  });
  const ph = s("line", { x1: x(0), x2: x(0), y1: 16, y2: H - 4, class: "tl-playhead" });
  svg.append(ph);
  return {
    svg,
    curves,
    setTime(t) {
      ph.setAttribute("x1", x(t));
      ph.setAttribute("x2", x(t));
    },
  };
}

/** Transport (play/pause, scrub, speed) bound to a clock. */
export function transport(
  clock,
  windowEnd,
  signal,
  { speeds = [0.25, 0.5, 1], initial = 0.5 } = {},
) {
  const play = h("button", { type: "button", class: "icon-button", "aria-label": "Play" });
  const icon = (playing) => {
    play.setAttribute("aria-label", playing ? "Pause" : "Play");
    play.innerHTML = playing
      ? '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="3.5" y="2.5" width="3" height="11" rx="1"/><rect x="9.5" y="2.5" width="3" height="11" rx="1"/></svg>'
      : '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 2.8v10.4a.6.6 0 0 0 .9.5l8.4-5.2a.6.6 0 0 0 0-1L4.9 2.3a.6.6 0 0 0-.9.5Z"/></svg>';
  };
  icon(false);
  const range = h("input", {
    type: "range",
    class: "range",
    min: 0,
    max: Math.round(windowEnd),
    step: 1,
    value: 0,
    "aria-label": "Time in milliseconds",
  });
  const time = h("output", { class: "transport__time mono" }, "0 ms");
  const speed = h(
    "select",
    { class: "select transport__speed", "aria-label": "Playback speed" },
    ...speeds.map((v) => h("option", { value: String(v), selected: v === initial }, `${v}×`)),
  );
  clock.speed = initial;
  play.addEventListener("click", () => clock.toggle(), { signal });
  range.addEventListener(
    "input",
    () => {
      clock.pause();
      clock.seek(Number(range.value));
    },
    { signal },
  );
  speed.addEventListener("change", () => (clock.speed = Number(speed.value)), { signal });
  return {
    node: h("div", { class: "transport" }, play, range, time, speed),
    sync(t) {
      range.value = String(Math.round(t));
      time.textContent = `${Math.round(t)} ms`;
    },
    icon,
  };
}

export function tracksOf(set) {
  return set.tracks.map((t) => ({
    ...t,
    label:
      t.label.replace(/ · .*$/, "").replace(/^(nav|work|feature|service|process|hero)-/, "") +
      (t.label.includes(" · ")
        ? ` · ${t.label.split(" · ")[1].replace(/^(hero-intro|process)@/, "@")}`
        : ""),
  }));
}

export async function mount(el, ctx, name) {
  const key = el.dataset.dataset;
  const { set } = await dataset(key);
  if (!ctx.isMounted()) return;
  const tracks = tracksOf(set);
  const ends = tracks.flatMap((t) =>
    [t.baseline, t.candidate]
      .filter(Boolean)
      .map((sd) => (sd.start ?? 0) + (sd.delay ?? 0) + (sd.duration ?? 0)),
  );
  const windowEnd =
    Math.ceil(Math.max(...ends, set.window.baseline, set.window.candidate) / 50) * 50;
  const labels =
    set.timelines.baseline.length || set.timelines.candidate.length
      ? {
          baseline: set.timelines.baseline[0]?.labels ?? [],
          candidate: set.timelines.candidate[0]?.labels ?? [],
        }
      : null;
  const view = renderTimeline(tracks, {
    windowEnd,
    labels,
    rowHeight: tracks.length > 8 ? 24 : 30,
    width: Math.max(560, Math.round(el.clientWidth - 34)),
  });

  el.textContent = "";
  el.classList.add("timeline", "panel");
  const engine = engineOf(tracks[0].source, tracks[0].type);
  const preview =
    name === "stagger" ? h("div", { class: "timeline__preview", "aria-hidden": "true" }) : null;
  const tiles = [];
  if (preview) {
    for (const which of ["baseline", "candidate"]) {
      const row = h(
        "div",
        { class: `timeline__tiles timeline__tiles--${which}` },
        h("span", { class: "label" }, which),
      );
      for (const t of tracks.filter((tt) => tt[which])) {
        const tile = h("i", { title: t.label });
        row.append(tile);
        tiles.push({ tile, side: t[which] });
      }
      preview.append(row);
    }
  }
  const changes = [
    ...set.stagger.map((sg) => ({
      severity: sg.severity,
      message: `Stagger interval ${sg.baselineInterval}ms → ${sg.candidateInterval}ms across ${sg.members} elements`,
    })),
    ...set.timelines.changes,
    ...tracks.flatMap((t) =>
      t.changes
        .filter((c) => c.severity !== "info")
        .map((c) => ({ severity: c.severity, message: `${shortKey(t.element)}: ${c.message}` })),
    ),
  ].slice(0, 6);
  const clock = ctx.track(
    createClock({
      duration: windowEnd,
      loop: true,
      hold: 900,
      onTick: (t) => render(t),
      onState: ({ playing }) => tp.icon(playing),
    }),
  );
  const tp = transport(clock, windowEnd, ctx.signal, { initial: 0.5 });
  el.append(
    h(
      "div",
      { class: "timeline__head" },
      h("span", { class: "label" }, h("b", {}, set.scenario), ` · ${set.checkpoint} · ${engine}`),
      h(
        "span",
        { class: "timeline__legend label" },
        h("i", { class: "key key--b" }),
        "baseline",
        h("i", { class: "key key--c" }),
        "candidate",
      ),
    ),
    preview ?? "",
    h("div", { class: "timeline__scroll" }, view.svg),
    tp.node,
    changes.length
      ? h(
          "ul",
          { class: "timeline__changes" },
          ...changes.map((c) =>
            h(
              "li",
              {},
              h("span", { class: `sev sev--${c.severity}` }, c.severity),
              h("span", {}, c.message),
            ),
          ),
        )
      : "",
    h("p", { class: "timeline__source label" }, "Real capture of the demo app"),
  );
  function render(t) {
    view.setTime(t);
    tp.sync(t);
    for (const { tile, side } of tiles) {
      const p = easedAt(side, t);
      tile.style.opacity = (0.15 + p * 0.85).toFixed(3);
      tile.style.transform = `translateY(${((1 - p) * 10).toFixed(2)}px)`;
    }
  }
  render(0);
  if (!reducedMotion()) {
    ctx.gsap(() => {
      for (const c of view.curves) {
        const len = c.getTotalLength();
        gsap.fromTo(
          c,
          { strokeDasharray: len, strokeDashoffset: len },
          {
            strokeDashoffset: 0,
            duration: 1,
            ease: EASE.out,
            scrollTrigger: { trigger: el, start: "top 85%", once: true },
          },
        );
      }
      gsap.from(view.svg.querySelectorAll(".tl-row"), {
        opacity: 0,
        x: -10,
        duration: DUR.slow,
        ease: EASE.out,
        stagger: 0.03,
        scrollTrigger: { trigger: el, start: "top 85%", once: true },
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
  } else render(windowEnd);
}
