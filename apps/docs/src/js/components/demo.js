// Interactive demo: the bundled demo app (demo/app/, the same files `motionpr demo` captures) in
// its baseline and candidate variants, side by side. "Play" replays the scenario's real steps
// (packages/cli/src/demo/config.ts) in both frames at once; below are MotionPR's real findings and
// timeline for that scenario, and a link to the full report.
import { DUR, EASE, gsap, reducedMotion } from "../lib/motion.js";
import { createClock } from "../lib/clock.js";
import { engineOf, loadSiteData, siteUrl } from "../lib/data.js";
import { h } from "../lib/dom.js";
import { renderTimeline, tracksOf, transport } from "./timeline.js";

const VIEW_W = 1280;
const VIEW_H = 800;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function settle(win, { timeout = 3000, quiet = 160 } = {}) {
  // Wait until the frame has no running finite animation and its scroll position is still.
  return new Promise((resolve) => {
    const started = performance.now();
    let lastY = win.scrollY;
    let still = 0;
    const tick = () => {
      const running = win.document
        .getAnimations()
        .filter(
          (a) => a.playState === "running" && a.effect?.getTiming().iterations !== Infinity,
        ).length;
      const y = win.scrollY;
      still = running === 0 && Math.abs(y - lastY) < 0.5 ? still + 16 : 0;
      lastY = y;
      if (still >= quiet || performance.now() - started > timeout) resolve();
      else win.requestAnimationFrame(tick);
    };
    win.requestAnimationFrame(tick);
  });
}

async function runStep(win, step, onHint) {
  const doc = win.document;
  const q = (sel) => doc.querySelector(sel);
  switch (step.type) {
    case "click":
      q(step.selector)?.click();
      await wait(40);
      return;
    case "hover": {
      const el = q(step.selector);
      onHint?.(
        `Hover “${el?.textContent?.trim() || step.selector}” in each frame: a page script cannot produce :hover.`,
      );
      el?.classList.add("motionpr-demo-target");
      return;
    }
    case "scrollIntoView":
      q(step.selector)?.scrollIntoView({ block: step.block ?? "center", behavior: "instant" });
      await wait(80);
      return;
    case "scrollTo": {
      // Real wheel input, which the demo app's Lenis turns into its smooth scroll.
      const target =
        typeof step.target === "number"
          ? step.target - win.scrollY
          : (q(step.target)?.getBoundingClientRect().top ?? 0);
      const steps = 4;
      for (let i = 0; i < steps; i++) {
        win.dispatchEvent(
          new win.WheelEvent("wheel", { deltaY: target / steps, bubbles: true, cancelable: true }),
        );
        await wait(16);
      }
      return;
    }
    case "waitForAnimations":
    case "waitForScrollSettled":
    case "capture":
      await settle(win, { timeout: step.type === "waitForScrollSettled" ? 5000 : 3000 });
      return;
    case "wait":
      await wait(step.duration ?? 0);
      return;
    default:
      return; // move, goto, … have no visible effect in the demo
  }
}

export async function mount(el, ctx) {
  const data = await loadSiteData();
  if (!ctx.isMounted()) return;
  el.textContent = "";
  el.classList.add("demo");

  const list = h("div", { class: "demo__list", role: "listbox", "aria-label": "Demo scenarios" });
  const frames = {};
  const makeFrame = (variant) => {
    const iframe = h("iframe", {
      title: `Demo app, ${variant} variant`,
      src: siteUrl(`demo/app/index.html?variant=${variant}`),
      loading: "lazy",
      tabindex: "0",
    });
    const box = h("div", { class: "demo__viewport" }, iframe);
    const node = h(
      "figure",
      { class: `demo__frame demo__frame--${variant}` },
      h("figcaption", { class: "label" }, variant === "baseline" ? "Baseline" : "Candidate"),
      box,
    );
    frames[variant] = { iframe, box, node, variant };
    return node;
  };
  const play = h("button", { type: "button", class: "button" }, "Play scenario");
  const reset = h("button", { type: "button", class: "button button--ghost" }, "Reset frames");
  const step = h(
    "p",
    { class: "demo__step label", role: "status", "aria-live": "polite" },
    "Choose a scenario, then press Play.",
  );
  const hint = h("p", { class: "demo__hint", hidden: true });
  const detail = h("div", { class: "demo__detail" });
  el.append(
    h(
      "div",
      { class: "demo__layout" },
      h(
        "aside",
        { class: "demo__aside" },
        h(
          "p",
          { class: "label" },
          `${data.scenarios.length} scenarios · ${data.summary.counts.critical + data.summary.counts.warning + data.summary.counts.info + data.summary.counts.uncertain} differences`,
        ),
        list,
      ),
      h(
        "div",
        { class: "demo__main" },
        h("div", { class: "demo__frames" }, makeFrame("baseline"), makeFrame("candidate")),
        h("div", { class: "demo__controls" }, play, reset, step),
        hint,
        detail,
      ),
    ),
  );

  // Scale both 1280 × 800 frames to the available width.
  const ro = new ResizeObserver(() => {
    for (const f of Object.values(frames)) {
      const scale = f.box.clientWidth / VIEW_W;
      f.iframe.style.transform = `scale(${scale})`;
      f.box.style.height = `${VIEW_H * scale}px`;
    }
  });
  for (const f of Object.values(frames)) ro.observe(f.box);
  ctx.track(ro);

  let selected = null;
  let running = false;
  let tlClock = null;
  const reload = () =>
    Promise.all(
      Object.values(frames).map(
        (f) =>
          new Promise((resolve) => {
            f.iframe.addEventListener("load", () => resolve(), { once: true });
            f.iframe.src = siteUrl(`demo/app/index.html?variant=${f.variant}&t=${Date.now()}`);
          }),
      ),
    );

  const renderDetail = (sc) => {
    detail.innerHTML = "";
    tlClock?.destroy();
    const diffs = data.differences.filter((d) => d.scenario === sc.key);
    const checkpoints = sc.checkpoints.filter(
      (label) => data.datasets[`${sc.id}/${label}`]?.tracks.length,
    );
    const head = h(
      "div",
      { class: "demo__detail-head" },
      h("h2", { class: "app-page__h2" }, sc.name),
      h(
        "p",
        { class: "label" },
        `${sc.key} · ${diffs.length} differences · highest: ${sc.severity ?? "none"}`,
      ),
    );
    const listEl = h(
      "ul",
      { class: "timeline__changes demo__diffs" },
      ...diffs.map((d) =>
        h(
          "li",
          {},
          h("span", { class: `sev sev--${d.severity}` }, d.severity),
          h("span", {}, d.title.replace(/^[^:]+: /, "")),
          h("span", { class: "label" }, d.checkpoint ?? ""),
        ),
      ),
    );
    detail.append(head, listEl);
    const cpTabs = h(
      "div",
      { class: "segmented", role: "group", "aria-label": "Checkpoint" },
      h("span", { class: "segmented__thumb", "aria-hidden": "true" }),
    );
    const tlBox = h("div", { class: "demo__timeline panel" });
    const showCp = (label) => {
      cpTabs
        .querySelectorAll("button")
        .forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cp === label)));
      const active = cpTabs.querySelector(`[data-cp="${label}"]`);
      if (active)
        gsap.to(cpTabs.querySelector(".segmented__thumb"), {
          x: active.offsetLeft - 3,
          width: active.offsetWidth,
          duration: reducedMotion() ? 0 : DUR.base,
          ease: EASE.out,
        });
      const set = data.datasets[`${sc.id}/${label}`];
      const tracks = tracksOf(set);
      const ends = tracks.flatMap((t) =>
        [t.baseline, t.candidate]
          .filter(Boolean)
          .map((sd) => (sd.start ?? 0) + (sd.delay ?? 0) + (sd.duration ?? 0)),
      );
      const windowEnd = Math.ceil(Math.max(...ends, 200) / 50) * 50;
      const labels = set.timelines.baseline.length
        ? {
            baseline: set.timelines.baseline[0]?.labels ?? [],
            candidate: set.timelines.candidate[0]?.labels ?? [],
          }
        : null;
      const view = renderTimeline(tracks, {
        windowEnd,
        labels,
        rowHeight: 26,
        width: Math.max(560, Math.round(tlBox.clientWidth - 30)),
      });
      tlClock?.destroy();
      tlClock = ctx.track(
        createClock({
          duration: windowEnd,
          onTick: (t) => {
            view.setTime(t);
            tp.sync(t);
          },
          onState: ({ playing }) => tp.icon(playing),
        }),
      );
      const tp = transport(tlClock, windowEnd, ctx.signal, { initial: 0.5 });
      tlBox.innerHTML = "";
      tlBox.append(
        h(
          "p",
          { class: "label" },
          `Timeline · ${label} · ${engineOf(tracks[0].source, tracks[0].type)}`,
        ),
        h("div", { class: "timeline__scroll" }, view.svg),
        tp.node,
      );
    };
    for (const label of checkpoints) {
      const b = h("button", { type: "button", "data-cp": label, "aria-pressed": "false" }, label);
      b.addEventListener("click", () => showCp(label), { signal: ctx.signal });
      cpTabs.append(b);
    }
    if (checkpoints.length) {
      detail.append(
        h("div", { class: "demo__cp" }, h("span", { class: "label" }, "Checkpoint"), cpTabs),
        tlBox,
      );
      requestAnimationFrame(() => showCp(checkpoints[0]));
    } else {
      detail.append(
        h(
          "p",
          { class: "demo__note" },
          "This scenario's checkpoints record scroll motion. Its scroll comparison is on the landing page and in the Lenis integration guide.",
        ),
      );
    }
    detail.append(
      h(
        "p",
        {},
        h(
          "a",
          { class: "button button--ghost", href: siteUrl("report/"), "data-router": "off" },
          "Open the full MotionPR report",
        ),
        " ",
        h("span", { class: "label" }, `then pick “${sc.name}” in its scenario list`),
      ),
    );
    if (!reducedMotion())
      gsap.fromTo(
        detail.children,
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: DUR.slow, ease: EASE.out, stagger: 0.05 },
      );
  };

  const select = (sc, focus = false) => {
    selected = sc;
    hint.hidden = true;
    list
      .querySelectorAll("[role=option]")
      .forEach((o) => o.setAttribute("aria-selected", String(o.dataset.id === sc.id)));
    if (focus) list.querySelector(`[data-id="${sc.id}"]`)?.focus();
    step.textContent = `${sc.steps.length} steps · press Play to run them in both frames`;
    renderDetail(sc);
  };
  for (const sc of data.scenarios) {
    const engines = [
      ...new Set(
        Object.entries(data.datasets)
          .filter(([k]) => k.startsWith(`${sc.id}/`))
          .flatMap(([, set]) => set.tracks.map((t) => engineOf(t.source, t.type)))
          .concat(sc.id === "lenis-journal" ? ["Lenis"] : []),
      ),
    ];
    const option = h(
      "button",
      {
        type: "button",
        role: "option",
        class: "demo__option",
        "data-id": sc.id,
        "aria-selected": "false",
      },
      h("span", {
        class: `sev sev--${sc.severity ?? "none"}`,
        "aria-label": sc.severity ?? "none",
      }),
      h("span", { class: "demo__option-name" }, sc.name),
      h("span", { class: "label" }, engines.join(" · ")),
    );
    option.addEventListener("click", () => select(sc), { signal: ctx.signal });
    list.append(option);
  }
  list.addEventListener(
    "keydown",
    (e) => {
      const options = [...list.querySelectorAll("[role=option]")];
      const i = options.indexOf(document.activeElement);
      const n = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: options.length - 1 }[e.key];
      if (n === undefined || i < 0) return;
      e.preventDefault();
      const sc = data.scenarios[(n + options.length) % options.length];
      select(sc, true);
    },
    { signal: ctx.signal },
  );

  play.addEventListener(
    "click",
    async () => {
      if (!selected || running) return;
      running = true;
      play.disabled = true;
      hint.hidden = true;
      try {
        step.textContent = "Resetting both frames…";
        await reload();
        await wait(400);
        for (const [i, st] of selected.steps.entries()) {
          if (!ctx.isMounted()) return;
          step.textContent = `Step ${i + 1}/${selected.steps.length} · ${st.type}${st.selector ? ` ${st.selector}` : st.label ? ` “${st.label}”` : st.target ? ` ${st.target}` : ""}`;
          await Promise.all(
            Object.values(frames).map((f) =>
              runStep(f.iframe.contentWindow, st, (msg) => {
                hint.textContent = msg;
                hint.hidden = false;
              }),
            ),
          );
        }
        step.textContent = "Done. Both versions ran the same steps.";
      } catch (error) {
        step.textContent = `Could not drive the frames (${error.message}).`;
      } finally {
        running = false;
        play.disabled = false;
      }
    },
    { signal: ctx.signal },
  );
  reset.addEventListener(
    "click",
    async () => {
      hint.hidden = true;
      step.textContent = "Resetting…";
      await reload();
      step.textContent = "Frames reset.";
    },
    { signal: ctx.signal },
  );

  const fromHash = data.scenarios.find((s) => `#${s.id}` === location.hash);
  select(fromHash ?? data.scenarios[0]);
}
