// The hero's horizon: the MotionPR mark at planetary scale. Two circles, baseline and candidate,
// are combined with XOR exactly as the brand mark is (brand/README.md): only where they differ
// stays lit, so the glowing rim *is* the difference. Two lights travel the rim with each version's
// real timing (the demo app's navigation panel as MotionPR captured it, site-data.json), and the
// arc opens as far as their progress differs: when the versions agree, it closes to a hairline.
//
// Canvas 2D, redrawn only while it moves and is on screen (the shared ticker). The bloom is the
// band drawn into a small canvas and scaled up, which is cheap; nothing is blurred per pixel.
import { gsap, reducedMotion } from "../lib/motion.js";
import { dataset } from "../lib/data.js";
import { clamp, easedAt, h, lerp, watchVisibility } from "../lib/dom.js";
import { ticker } from "../lib/ticker.js";

const STOPS = [
  [0, "#839CF6"],
  [0.38, "#7E4AE6"],
  [0.72, "#E5A9C7"],
  [1, "#ECA67A"],
];
const BLUE = "131, 156, 246";
const PEACH = "236, 166, 122";
const VIOLET = "126, 74, 230";
const SLOW = 5; // the capture, slowed down to be watchable
const LEAD = 900; // ms at rest before each run
const HOLD = 1800; // ms both lights rest where they arrived
const FADE = 650; // ms the lights take to fade out, and back in at the start
const INTRO = 1600; // the brand intro: the circles separate from one point
const U = Math.SQRT1_2; // the brand's 45°: lower-left → upper-right
const HALF = 0.5; // resolution of the horizon layer (band and bloom)

export async function mount(el, ctx) {
  const { set } = await dataset(el.dataset.dataset || "navigation/open");
  if (!ctx.isMounted()) return;
  const track =
    set.tracks.find((t) => t.key === el.dataset.track) ??
    set.tracks.find((t) => t.status === "changed");
  const B = track.baseline;
  const C = track.candidate;
  const end = Math.max(B.start + B.delay + B.duration, C.start + C.delay + C.duration);
  // The largest progress difference over the run, to scale the arc's opening to the data.
  let maxDiff = 0;
  for (let t = 0; t <= end; t += 2)
    maxDiff = Math.max(maxDiff, Math.abs(easedAt(B, t) - easedAt(C, t)));
  maxDiff ||= 1;
  const runEnd = LEAD + end * SLOW;
  const LOOP = runEnd + HOLD + FADE;
  const intro = gsap.parseEase("mp.out");

  const canvas = el.querySelector("canvas");
  const g = canvas.getContext("2d");
  const band = document.createElement("canvas");
  const bg = band.getContext("2d");
  const soft = document.createElement("canvas"); // 1/6 scale: the bloom
  const sg = soft.getContext("2d");
  const wide = document.createElement("canvas"); // 1/14 scale: the atmosphere
  // The lights move every frame; the horizon only when the arc opens or closes. Two layers, so a
  // frame redraws only what changed.
  const lightsCanvas = document.createElement("canvas");
  lightsCanvas.className = "horizon__lights";
  lightsCanvas.setAttribute("aria-hidden", "true");
  canvas.after(lightsCanvas);
  ctx.track(() => lightsCanvas.remove());
  const lg = lightsCanvas.getContext("2d");
  const wg = wide.getContext("2d");

  // Controls and live readout, under the arc.
  const caption = el.querySelector(".horizon__caption");
  const legend = caption.querySelector(".horizon__legend");
  legend.innerHTML = "";
  legend.append(
    h(
      "span",
      { class: "horizon__key horizon__key--b" },
      `Baseline ${B.duration} ms`,
      h("span", { class: "horizon__ease" }, ` · ${B.easing.value}`),
    ),
    h(
      "span",
      { class: "horizon__key horizon__key--c" },
      `Candidate ${C.duration} ms`,
      h("span", { class: "horizon__ease" }, ` · ${C.easing.value}`),
    ),
  );
  const play = h("button", { type: "button", class: "icon-button horizon__play" });
  const out = {
    t: h("span", {}, "0 ms"),
    b: h("span", {}, "0%"),
    c: h("span", {}, "0%"),
    d: h("span", {}, "0%"),
  };
  const readout = h(
    "p",
    { class: "horizon__readout label", "aria-live": "off" },
    h("span", {}, "t ", out.t),
    h("span", { class: "horizon__r--b" }, "baseline ", out.b),
    h("span", { class: "horizon__r--c" }, "candidate ", out.c),
    h("span", {}, "Δ ", out.d),
  );
  caption.prepend(h("div", { class: "horizon__controls" }, play, readout));

  // Geometry, in CSS pixels.
  let W = 0;
  let H = 0;
  let dpr = 1;
  let geo = null;
  function layout() {
    const box = canvas.getBoundingClientRect();
    W = Math.max(1, Math.round(box.width));
    H = Math.max(1, Math.round(box.height));
    // Glow is soft by nature: one canvas pixel per CSS pixel is enough, and keeps the frame cheap
    // on high-density screens (a 2× backing store would quadruple every fill).
    dpr = 1;
    // The band and its bloom are soft: half resolution. The crisp rim is drawn on the lights layer.
    for (const [c, scale] of [
      [canvas, HALF],
      [band, HALF],
      [lightsCanvas, dpr],
    ]) {
      c.width = Math.round(W * scale);
      c.height = Math.round(H * scale);
    }
    soft.width = Math.max(1, Math.round(W / 6));
    soft.height = Math.max(1, Math.round(H / 6));
    wide.width = Math.max(1, Math.round(W / 14));
    wide.height = Math.max(1, Math.round(H / 14));
    const narrow = W < 720;
    geo = {
      // Curvature from the reference horizon: the arc falls ~9% of the width at the edges.
      R: W * (narrow ? 1.9 : 1.4),
      top: H * (narrow ? 0.44 : 0.47), // the arc's peak; above it, room for the glow
      cx: W * 0.5,
      rest: Math.max(8, W * (narrow ? 0.03 : 0.02)),
      gain: W * (narrow ? 0.06 : 0.036),
      x0: W * (narrow ? 0.1 : 0.16),
      x1: W * (narrow ? 0.9 : 0.84),
      scale: narrow ? 0.62 : 1,
    };
  }

  const gradient = (c, s) => {
    // Lower-left → upper-right across the visible arc, as the brand gradient always runs.
    const grad = c.createLinearGradient(0, H * s, W * s, H * s * 0.35);
    for (const [o, col] of STOPS) grad.addColorStop(o, col);
    return grad;
  };
  const centers = (d) => {
    const ax = geo.cx - (d / 2) * U;
    const ay = geo.top + geo.R + (d / 2) * U;
    return { ax, ay, bx: ax + d * U, by: ay - d * U };
  };
  // A point on the candidate circle's upper rim (the lit horizon) at horizontal position x.
  const rimY = (x, cxp, cyp) => cyp - Math.sqrt(Math.max(0, geo.R ** 2 - (x - cxp) ** 2));

  function drawBand(d) {
    const { ax, ay, bx, by } = centers(d);
    const s = HALF;
    bg.setTransform(1, 0, 0, 1, 0, 0);
    bg.globalCompositeOperation = "source-over";
    bg.clearRect(0, 0, band.width, band.height);
    bg.setTransform(s, 0, 0, s, 0, 0);
    bg.fillStyle = gradient(bg, 1);
    bg.beginPath();
    bg.arc(ax, ay, geo.R, 0, Math.PI * 2);
    bg.fill();
    bg.globalCompositeOperation = "xor";
    bg.beginPath();
    bg.arc(bx, by, geo.R, 0, Math.PI * 2);
    bg.fill();
    // Light falls off towards the inside of the crescent, as on the brand board.
    bg.globalCompositeOperation = "source-atop";
    const inner = bg.createRadialGradient(bx, by, geo.R - Math.max(d * 1.6, 10), bx, by, geo.R);
    inner.addColorStop(0, "rgba(7, 7, 9, 0.92)");
    inner.addColorStop(0.55, "rgba(7, 7, 9, 0.35)");
    inner.addColorStop(1, "rgba(7, 7, 9, 0)");
    bg.fillStyle = inner;
    bg.fillRect(0, 0, W, H);
    return { ax, ay, bx, by };
  }

  function light(x, y, rgb, alpha, k) {
    if (alpha <= 0.001) return;
    lg.save();
    lg.globalCompositeOperation = "lighter";
    lg.translate(x, y);
    // Every halo falls off like a Gaussian, so none shows an edge where it reaches zero.
    const glow = (r, a, inner = rgb) => {
      const grad = lg.createRadialGradient(0, 0, 0, 0, 0, r);
      for (const [o, f] of [
        [0, 1],
        [0.12, 0.72],
        [0.28, 0.38],
        [0.48, 0.14],
        [0.7, 0.035],
        [1, 0],
      ])
        grad.addColorStop(o, `rgba(${o < 0.1 ? inner : rgb}, ${a * f})`);
      lg.fillStyle = grad;
      lg.fillRect(-r, -r, r * 2, r * 2);
    };
    glow(W * 0.2 * k, 0.24 * alpha);
    glow(80 * k, 0.75 * alpha, "255, 255, 255");
    // Rays, faint and fixed: a lens, not decoration that moves on its own.
    lg.lineCap = "round";
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.26;
      const len = (i % 3 === 0 ? 150 : i % 2 ? 70 : 105) * k;
      const grad = lg.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
      grad.addColorStop(0, `rgba(255, 255, 255, ${0.28 * alpha})`);
      grad.addColorStop(1, `rgba(${rgb}, 0)`);
      lg.strokeStyle = grad;
      lg.lineWidth = 1.4 * k;
      lg.beginPath();
      lg.moveTo(0, 0);
      lg.lineTo(Math.cos(a) * len, Math.sin(a) * len);
      lg.stroke();
    }
    // The anamorphic streak along the horizon.
    lg.save();
    lg.scale(1, 0.045);
    glow(W * 0.32 * k, 0.5 * alpha, "255, 255, 255");
    lg.restore();
    glow(10 * k, 1 * alpha, "255, 255, 255");
    lg.restore();
  }

  // state → pixels. The horizon layer: band, bloom, atmosphere and rim.
  function renderHorizon(d) {
    drawBand(d);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    // Atmosphere and bloom: the band drawn small and blurred (cheap at that size), scaled up.
    for (const [cv, cg, blur, a] of [
      [wide, wg, 3, 1.7],
      [soft, sg, 2, 1.05],
    ]) {
      cg.globalCompositeOperation = "copy";
      cg.filter = `blur(${blur}px)`;
      cg.drawImage(band, 0, 0, cv.width, cv.height);
      cg.filter = "none";
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = a;
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = "high";
      g.drawImage(cv, 0, 0, canvas.width, canvas.height);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
    g.drawImage(band, 0, 0);
    g.globalCompositeOperation = "source-over";
  }

  // The lights layer: they ride the rim, baseline cool and candidate warm; together they burn white.
  function renderLights({ d, pB, pC, lights }) {
    const c = centers(d);
    lg.setTransform(1, 0, 0, 1, 0, 0);
    lg.clearRect(0, 0, lightsCanvas.width, lightsCanvas.height);
    lg.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The rim itself: a hairline of light on the candidate circle, brightest at the top.
    lg.globalCompositeOperation = "lighter";
    const rim = lg.createLinearGradient(0, 0, W, 0);
    rim.addColorStop(0, "rgba(131, 156, 246, 0)");
    rim.addColorStop(0.25, "rgba(200, 190, 250, 0.55)");
    rim.addColorStop(0.55, "rgba(255, 245, 250, 0.8)");
    rim.addColorStop(0.85, "rgba(236, 166, 122, 0.5)");
    rim.addColorStop(1, "rgba(236, 166, 122, 0)");
    lg.strokeStyle = rim;
    lg.lineWidth = 2.4;
    lg.beginPath();
    lg.arc(c.bx, c.by, geo.R, Math.PI, Math.PI * 2);
    lg.stroke();
    lg.lineWidth = 1;
    lg.stroke();
    lg.globalCompositeOperation = "source-over";
    const at = (p) => {
      const x = lerp(geo.x0, geo.x1, p);
      return [x, rimY(x, c.bx, c.by)];
    };
    const [xb, yb] = at(pB);
    const [xc, yc] = at(pC);
    light(xb, yb, BLUE, lights, geo.scale);
    light(xc, yc, PEACH, lights, geo.scale);
    // A faint violet haze where the two meet, so the merge reads as one source.
    const near = 1 - clamp(Math.abs(xb - xc) / (W * 0.08), 0, 1);
    if (near > 0) light((xb + xc) / 2, (yb + yc) / 2, VIOLET, near * lights * 0.35, geo.scale);
  }

  // time → state
  let time = 0; // ms within the loop
  let introAt = 0; // ms since mount, for the intro
  const stateAt = (t) => {
    const w = clamp((t - LEAD) / SLOW, 0, end);
    const pB = easedAt(B, w);
    const pC = easedAt(C, w);
    const diff = Math.abs(pB - pC);
    let lights = 1;
    if (t > runEnd + HOLD) lights = 1 - (t - runEnd - HOLD) / FADE;
    else if (t < FADE) lights = t / FADE;
    const open = Math.min(1, introAt / INTRO);
    const d = (geo.rest + geo.gain * (diff / maxDiff)) * intro(open);
    return { d, pB, pC, diff, w, lights: clamp(lights, 0, 1) * Math.min(1, open * 1.4) };
  };
  // Draw only what changed: during the rests and holds of the loop nothing does, and nothing is
  // drawn.
  let drawn = { d: -1, lights: "" };
  const show = (st, force = false) => {
    if (force || Math.abs(st.d - drawn.d) > 0.15) {
      renderHorizon(st.d);
      drawn.d = st.d;
    }
    const key = `${st.d.toFixed(1)}|${st.pB.toFixed(4)}|${st.pC.toFixed(4)}|${st.lights.toFixed(3)}`;
    if (force || key !== drawn.lights) {
      renderLights(st);
      drawn.lights = key;
    }
    const text = [
      `${Math.round(st.w)} ms`,
      `${Math.round(st.pB * 100)}%`,
      `${Math.round(st.pC * 100)}%`,
      `${Math.round(st.diff * 100)}%`,
    ];
    [out.t, out.b, out.c, out.d].forEach((el, i) => {
      if (el.textContent !== text[i]) el.textContent = text[i];
    });
  };

  let playing = false;
  let visible = true;
  let stop = null;
  const frame = (dt) => {
    introAt += dt;
    time += dt;
    if (time >= LOOP) time -= LOOP;
    show(stateAt(time));
  };
  const sync = () => {
    const run = playing && visible;
    if (run && !stop) stop = ticker.add(frame);
    if (!run && stop) {
      stop();
      stop = null;
    }
    play.setAttribute("aria-label", playing ? "Pause the horizon" : "Play the horizon");
    play.innerHTML = playing
      ? '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="3.5" y="2.5" width="3" height="11" rx="1"/><rect x="9.5" y="2.5" width="3" height="11" rx="1"/></svg>'
      : '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 2.8v10.4a.6.6 0 0 0 .9.5l8.4-5.2a.6.6 0 0 0 0-1L4.9 2.3a.6.6 0 0 0-.9.5Z"/></svg>';
  };
  play.addEventListener(
    "click",
    () => {
      playing = !playing;
      if (playing) introAt = Math.max(introAt, INTRO * 0.4);
      sync();
    },
    { signal: ctx.signal },
  );

  layout();
  if (reducedMotion()) {
    // One still frame: both versions arrived, the arc at rest.
    introAt = INTRO;
    time = runEnd;
    show(stateAt(time));
    playing = false;
  } else {
    introAt = 0;
    time = 0;
    show(stateAt(0));
    playing = true;
  }
  sync();

  const ro = new ResizeObserver(() => {
    layout();
    show(stateAt(time), true);
  });
  ro.observe(canvas);
  ctx.track(ro);
  ctx.track(
    watchVisibility(
      el,
      (v) => {
        visible = v;
        sync();
      },
      "0px",
    ),
  );
  ctx.track(() => {
    stop?.();
    stop = null;
  });
}
