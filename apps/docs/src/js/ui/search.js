// Documentation search: ⌘K / Ctrl+K / "/" opens it. The index (assets/search-index.json) is built
// from the same Markdown as the pages and loaded on first use. Ranking: every query term must
// appear; matches in titles and headings outrank matches in text; earlier matches rank higher.
import { DUR, EASE, gsap, reducedMotion } from "../lib/motion.js";
import { siteUrl } from "../lib/data.js";

let index = null;
let indexPromise = null;
function loadIndex() {
  indexPromise ??= fetch(siteUrl("assets/search-index.json"))
    .then((r) => r.json())
    .then((entries) => {
      index = entries.map((e) => ({
        ...e,
        lt: e.t.toLowerCase(),
        lh: e.h.toLowerCase(),
        lx: `${e.d ?? ""} ${e.x}`.toLowerCase(),
      }));
      return index;
    });
  return indexPromise;
}

const escape = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
function highlight(text, terms) {
  let out = escape(text);
  for (const t of terms.sort((a, b) => b.length - a.length)) {
    if (t.length < 2) continue;
    out = out.replace(
      new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"),
      "<mark>$1</mark>",
    );
  }
  return out;
}
function excerpt(text, terms) {
  const lower = text.toLowerCase();
  const at = Math.min(...terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0), text.length);
  const start = Math.max(0, at - 40);
  return (start ? "…" : "") + text.slice(start, start + 160);
}

export function search(query, limit = 12) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length || !index) return [];
  const results = [];
  for (const e of index) {
    let score = 0;
    let ok = true;
    for (const t of terms) {
      const inT = e.lt.indexOf(t);
      const inH = e.lh.indexOf(t);
      const inX = e.lx.indexOf(t);
      if (inT < 0 && inH < 0 && inX < 0) {
        ok = false;
        break;
      }
      if (inH === 0 || inT === 0) score += 12;
      if (inH >= 0) score += 8;
      if (inT >= 0) score += e.h ? 3 : 10;
      if (inX >= 0) score += 2 + Math.max(0, 2 - inX / 200);
    }
    if (ok) results.push({ e, score: score + (e.h ? 0 : 1) });
  }
  results.sort((a, b) => b.score - a.score);
  const seen = new Set();
  return results
    .filter(({ e }) => (seen.has(e.u) ? false : seen.add(e.u)))
    .slice(0, limit)
    .map(({ e }) => ({ ...e, terms }));
}

export function initSearch({ navigate }) {
  const dialog = document.querySelector(".search-dialog");
  if (!dialog) return;
  const panel = dialog.querySelector(".search-dialog__panel");
  const input = dialog.querySelector("input");
  const list = dialog.querySelector(".search-results");
  let selected = 0;
  let items = [];
  let returnFocus = null;

  const render = () => {
    const q = input.value.trim();
    items = q ? search(q) : [];
    list.innerHTML = "";
    if (!q) {
      list.innerHTML = `<li class="search-empty">Search ${index ? index.length : ""} sections of the documentation.</li>`;
      input.removeAttribute("aria-activedescendant");
      return;
    }
    if (!items.length) {
      list.innerHTML = `<li class="search-empty">No results for “${escape(q)}”.</li>`;
      input.removeAttribute("aria-activedescendant");
      return;
    }
    selected = Math.min(selected, items.length - 1);
    items.forEach((r, i) => {
      const li = document.createElement("li");
      li.setAttribute("role", "presentation");
      li.innerHTML = `<a id="sr-${i}" role="option" href="${siteUrl(r.u)}" aria-selected="${i === selected}"><span class="r-path">${escape(r.s)}${r.h ? ` · ${escape(r.t)}` : ""}</span><span class="r-title">${highlight(r.h || r.t, r.terms)}</span><span class="r-text">${highlight(excerpt(r.x || r.d || "", r.terms), r.terms)}</span></a>`;
      list.append(li);
    });
    input.setAttribute("aria-activedescendant", `sr-${selected}`);
  };
  const move = (d) => {
    if (!items.length) return;
    selected = (selected + d + items.length) % items.length;
    list
      .querySelectorAll("a")
      .forEach((a, i) => a.setAttribute("aria-selected", String(i === selected)));
    input.setAttribute("aria-activedescendant", `sr-${selected}`);
    list.querySelector(`#sr-${selected}`)?.scrollIntoView({ block: "nearest" });
  };
  const open = async () => {
    if (!dialog.hidden) return;
    returnFocus = document.activeElement;
    dialog.hidden = false;
    document.documentElement.classList.add("search-open");
    if (!reducedMotion()) {
      gsap.fromTo(
        dialog.querySelector(".search-dialog__backdrop"),
        { opacity: 0 },
        { opacity: 1, duration: DUR.base, ease: EASE.out },
      );
      gsap.fromTo(
        panel,
        { opacity: 0, y: -10, scale: 0.98 },
        { opacity: 1, y: 0, scale: 1, duration: DUR.slow, ease: EASE.out },
      );
    }
    input.focus();
    input.select();
    await loadIndex();
    render();
  };
  const close = () => {
    if (dialog.hidden) return;
    const done = () => {
      dialog.hidden = true;
      document.documentElement.classList.remove("search-open");
      returnFocus?.focus?.();
    };
    if (reducedMotion()) return done();
    gsap.to(panel, { opacity: 0, y: -6, scale: 0.985, duration: DUR.quick, ease: EASE.in });
    gsap.to(dialog.querySelector(".search-dialog__backdrop"), {
      opacity: 0,
      duration: DUR.quick,
      ease: EASE.in,
      onComplete: done,
    });
  };

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-search-open]")) {
      e.preventDefault();
      open();
    } else if (e.target.closest("[data-search-close]")) close();
  });
  document.addEventListener("keydown", (e) => {
    const typing =
      /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? "") ||
      document.activeElement?.isContentEditable;
    if (
      (e.key === "k" && (e.metaKey || e.ctrlKey)) ||
      (e.key === "/" && !typing && dialog.hidden)
    ) {
      e.preventDefault();
      if (dialog.hidden) open();
      else close();
    }
  });
  input.addEventListener("input", () => {
    selected = 0;
    render();
  });
  dialog.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter" && items[selected]) {
      e.preventDefault();
      const href = siteUrl(items[selected].u);
      close();
      navigate(href);
    } else if (e.key === "Tab") {
      // Keep focus inside the dialog.
      const focusables = [input, ...list.querySelectorAll("a")];
      const i = focusables.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) {
        e.preventDefault();
        focusables.at(-1).focus();
      } else if (!e.shiftKey && i === focusables.length - 1) {
        e.preventDefault();
        input.focus();
      }
    }
  });
  list.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (!a) return;
    e.preventDefault();
    close();
    navigate(a.href);
  });
}
