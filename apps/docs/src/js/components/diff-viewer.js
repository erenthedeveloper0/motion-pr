// The real comparison of the demo app's two variants (all differences), filterable like a review:
// by severity, engine and text. Filtering reflows with GSAP Flip so the list never jumps.
import { DUR, EASE, Flip, gsap, reducedMotion } from "../lib/motion.js";
import { loadSiteData } from "../lib/data.js";
import { h } from "../lib/dom.js";

const SEVERITIES = ["critical", "warning", "info", "uncertain"];
const ENGINES = ["All engines", "Native CSS", "WAAPI", "GSAP", "Anime.js", "Lenis"];

function engineFor(d, data) {
  if (d.source === "gsap") return "GSAP";
  if (d.source === "animejs") return "Anime.js";
  if (d.source === "lenis") return "Lenis";
  if (d.source === "native") return /web-animation/.test(d.title) ? "WAAPI" : "Native CSS";
  // Stagger differences have no single source: use the engine of their checkpoint's records.
  const set = data.datasets[`${d.scenario.split("@")[0]}/${d.checkpoint}`];
  const t = set?.tracks[0];
  if (!t) return "Native CSS";
  return t.source === "native"
    ? t.type === "web-animation"
      ? "WAAPI"
      : "Native CSS"
    : t.source === "animejs"
      ? "Anime.js"
      : t.source === "gsap"
        ? "GSAP"
        : "Lenis";
}

export async function mount(el, ctx) {
  const data = await loadSiteData();
  if (!ctx.isMounted()) return;
  const diffs = data.differences.map((d) => ({
    ...d,
    engine: engineFor(d, data),
    text: `${d.title} ${d.detail} ${d.scenario}`.toLowerCase(),
  }));
  const scenarioName = Object.fromEntries(data.scenarios.map((s) => [s.key, s.name]));
  const state = { severities: new Set(SEVERITIES), engine: "All engines", q: "" };

  el.textContent = "";
  el.classList.add("diffs");
  const sevChips = SEVERITIES.map((sev) => {
    const n = diffs.filter((d) => d.severity === sev).length;
    return h(
      "button",
      { type: "button", class: "chip", "aria-pressed": "true", "data-sev": sev },
      h("span", { class: `sev sev--${sev}` }, sev),
      h("span", { class: "count" }, String(n)),
    );
  });
  const engine = h(
    "select",
    { class: "select", "aria-label": "Engine" },
    ...ENGINES.map((e) => h("option", { value: e }, e)),
  );
  const search = h("input", {
    class: "input",
    type: "search",
    placeholder: "Filter: duration, stagger, nav-panel…",
    "aria-label": "Filter differences",
  });
  const status = h("p", { class: "diffs__status label", role: "status", "aria-live": "polite" });
  const list = h("div", { class: "diffs__list" });
  el.append(
    h(
      "div",
      { class: "diffs__bar" },
      h("div", { class: "diffs__sev", role: "group", "aria-label": "Severity" }, ...sevChips),
      h("div", { class: "diffs__filters" }, engine, search),
    ),
    status,
    list,
    h(
      "p",
      { class: "diffs__source label" },
      `Comparison by MotionPR ${data.source.motionprVersion} · ${data.source.browser} · ${data.source.platform}`,
    ),
  );

  // Build every group and row once; filtering only hides and shows.
  const groups = new Map();
  for (const d of diffs) {
    if (!groups.has(d.scenario)) {
      const body = h("ul", { class: "diffs__rows" });
      const head = h(
        "h3",
        { class: "diffs__group-title" },
        h("span", {}, scenarioName[d.scenario] ?? d.scenario),
        h("span", { class: "label" }, d.scenario),
      );
      const node = h("section", { class: "diffs__group" }, head, body);
      list.append(node);
      groups.set(d.scenario, { node, body, rows: [] });
    }
    const g = groups.get(d.scenario);
    const detail = h(
      "div",
      { class: "diff__detail", hidden: true },
      h("p", {}, d.detail),
      h(
        "dl",
        {},
        ...[
          ["Before", d.before],
          ["After", d.after],
          [
            "Delta",
            d.delta !== null && d.delta !== undefined
              ? `${d.delta > 0 ? "+" : ""}${d.delta}${d.unit ? ` ${d.unit}` : ""}`
              : null,
          ],
          ["Measurement", d.measurement],
          ["Category", d.category],
          ["Engine", d.engine],
          ["Checkpoint", d.checkpoint],
        ]
          .filter(([, v]) => v !== null && v !== undefined && v !== "")
          .map(([k, v]) => h("div", {}, h("dt", { class: "label" }, k), h("dd", {}, String(v)))),
      ),
    );
    // Titles read "<subject>: <change>"; "Added: …" and "Removed: …" are already the change.
    const split = /^(Added|Removed): /.test(d.title) ? -1 : d.title.indexOf(": ");
    const main = split > 0 ? d.title.slice(split + 2) : d.title;
    const subject = split > 0 ? d.title.slice(0, split) : "";
    const button = h(
      "button",
      { type: "button", class: "diff__summary", "aria-expanded": "false" },
      h("span", { class: `sev sev--${d.severity}` }, d.severity),
      h(
        "span",
        { class: "diff__title" },
        main,
        h(
          "span",
          { class: "diff__subject label" },
          [subject, d.checkpoint].filter(Boolean).join(" · "),
        ),
      ),
      h("span", { class: "diff__engine label" }, d.engine),
    );
    button.addEventListener(
      "click",
      () => {
        const open = button.getAttribute("aria-expanded") !== "true";
        button.setAttribute("aria-expanded", String(open));
        detail.hidden = !open;
        if (open && !reducedMotion())
          gsap.fromTo(
            detail,
            { opacity: 0, y: -4 },
            { opacity: 1, y: 0, duration: DUR.base, ease: EASE.out },
          );
      },
      { signal: ctx.signal },
    );
    const row = h("li", { class: "diff", "data-flip-id": d.id }, button, detail);
    g.body.append(row);
    g.rows.push({ d, row });
  }

  // Each group shows its first rows; the rest open with "Show N more" (state kept per group).
  const LIMIT = 3;
  for (const g of groups.values()) {
    g.more = h("button", { type: "button", class: "diffs__more label", "aria-expanded": "false" });
    g.expanded = false;
    g.more.addEventListener(
      "click",
      () => {
        g.expanded = !g.expanded;
        apply(true);
      },
      { signal: ctx.signal },
    );
    g.node.append(g.more);
  }
  const apply = (animate) => {
    const flipState =
      animate && !reducedMotion()
        ? Flip.getState(list.querySelectorAll(".diff, .diffs__group"))
        : null;
    let shown = 0;
    for (const g of groups.values()) {
      let matching = 0;
      for (const { d, row } of g.rows) {
        const ok =
          state.severities.has(d.severity) &&
          (state.engine === "All engines" || d.engine === state.engine) &&
          (!state.q || d.text.includes(state.q));
        if (ok) matching++;
        row.hidden = !ok || (!g.expanded && matching > LIMIT);
      }
      shown += matching;
      g.node.hidden = matching === 0;
      const extra = matching - LIMIT;
      g.more.hidden = extra <= 0;
      g.more.textContent = g.expanded ? "Show fewer" : `Show ${extra} more`;
      g.more.setAttribute("aria-expanded", String(g.expanded));
    }
    status.textContent = `${shown} of ${diffs.length} differences`;
    if (flipState) {
      ctx.gsap(() =>
        Flip.from(flipState, {
          duration: DUR.slow,
          ease: EASE.out,
          absolute: false,
          nested: true,
          onEnter: (els) =>
            gsap.fromTo(
              els,
              { opacity: 0, y: 8 },
              { opacity: 1, y: 0, duration: DUR.slow, ease: EASE.out, stagger: 0.012 },
            ),
          onLeave: (els) => gsap.to(els, { opacity: 0, duration: DUR.quick }),
        }),
      );
    }
  };
  for (const chip of sevChips) {
    chip.addEventListener(
      "click",
      () => {
        const sev = chip.dataset.sev;
        const on = chip.getAttribute("aria-pressed") !== "true";
        chip.setAttribute("aria-pressed", String(on));
        if (on) state.severities.add(sev);
        else state.severities.delete(sev);
        apply(true);
      },
      { signal: ctx.signal },
    );
  }
  engine.addEventListener(
    "change",
    () => {
      state.engine = engine.value;
      apply(true);
    },
    { signal: ctx.signal },
  );
  let t = 0;
  search.addEventListener(
    "input",
    () => {
      clearTimeout(t);
      t = setTimeout(() => {
        state.q = search.value.trim().toLowerCase();
        apply(true);
      }, 90);
    },
    { signal: ctx.signal },
  );
  apply(false);
  if (!reducedMotion())
    ctx.gsap(() =>
      gsap.from(list.querySelectorAll(".diffs__group"), {
        opacity: 0,
        y: 16,
        duration: DUR.story,
        ease: EASE.out,
        stagger: 0.05,
        scrollTrigger: { trigger: list, start: "top 85%", once: true },
      }),
    );
}
