// Soft navigation between pages of the site. Real URLs, real HTML files (every page works
// without JavaScript and on refresh); the router only makes the move between them continuous:
// prefetch on intent, a short exit, swap the shell, a choreographed entrance, scroll restored on
// back/forward, focus moved and the new title announced. Anything unusual falls back to a normal
// page load.
import { DUR, EASE, gsap, reducedMotion } from "./lib/motion.js";

const cache = new Map();
const MAX_CACHE = 24;
let navigating = null;
let renderedPath = location.pathname + location.search;
let hooks = {
  beforeSwap: async () => {},
  afterSwap: async () => {},
  restoreScroll: async ({ x, y }) => window.scrollTo(x, y),
  scrollToTarget: (target, { instant = false } = {}) =>
    target.scrollIntoView({
      behavior: instant || reducedMotion() ? "auto" : "smooth",
      block: "start",
    }),
  enter: () => {},
};

function siteRoot() {
  const meta = document.querySelector('meta[name="mp-root"]')?.content ?? "";
  return new URL(meta || "./", location.href);
}

function eligible(url, anchor) {
  if (url.origin !== location.origin) return false;
  // The 404 page resolves its links through <base href>; a swapped-in page would inherit it.
  if (document.querySelector("base[href]")) return false;
  if (!url.pathname.startsWith(siteRoot().pathname)) return false;
  if (anchor?.dataset.router === "off" || anchor?.hasAttribute("download")) return false;
  if (anchor?.target && anchor.target !== "_self") return false;
  const rest = url.pathname.slice(siteRoot().pathname.length);
  // The report and the embedded demo app are separate applications.
  if (/^(report|demo\/app)\//.test(rest)) return false;
  if (/\.(json|xml|txt|png|jpg|svg|ico|webmanifest)$/.test(url.pathname)) return false;
  return true;
}

/** The script a page boots from: its file name is the build's content hash (build.mjs). */
function buildOf(doc, base) {
  const src = doc.querySelector('script[type="module"][src]')?.getAttribute("src");
  return src ? new URL(src, base).pathname : null;
}
// The build this tab is running, read once at boot: later the script tag's relative src would
// resolve against whichever page the router has since moved to.
const BOOT_BUILD = buildOf(document, location.href);

function fetchPage(url) {
  const key = url.pathname + url.search;
  if (!cache.has(key)) {
    const p = fetch(key, { credentials: "same-origin" }).then((r) => {
      // A missing page loads for real (navigate() falls back to location.assign): the 404 page
      // needs its own <base href>, which a swap would not bring along.
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      if (!r.headers.get("content-type")?.includes("text/html")) throw new Error("not html");
      return r.text();
    });
    p.catch(() => cache.delete(key));
    cache.set(key, p);
    if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
  }
  return cache.get(key);
}

export function prefetch(href) {
  try {
    const url = new URL(href, location.href);
    if (eligible(url)) fetchPage(url).catch(() => {});
  } catch {
    /* ignore */
  }
}

const playhead = () => ({
  bar: document.querySelector(".playhead__bar"),
  head: document.querySelector(".playhead__head"),
});

function startPlayhead() {
  const { bar, head } = playhead();
  if (!bar || reducedMotion()) return () => {};
  gsap.killTweensOf([bar, head]);
  gsap.set([bar, head], { opacity: 1 });
  gsap.set(bar, { scaleX: 0 });
  gsap.set(head, { x: 0 });
  const w = window.innerWidth;
  // Sweeps toward 80% while loading (a timeline cursor), then completes.
  const tl = gsap.timeline();
  tl.to(bar, { scaleX: 0.8, duration: 1.2, ease: "power2.out" }, 0).to(
    head,
    { x: w * 0.8, duration: 1.2, ease: "power2.out" },
    0,
  );
  return () => {
    tl.kill();
    gsap.to(bar, { scaleX: 1, duration: DUR.base, ease: EASE.out });
    gsap.to(head, { x: w, duration: DUR.base, ease: EASE.out });
    gsap.to([bar, head], { opacity: 0, duration: DUR.slow, delay: DUR.base, ease: EASE.out });
  };
}

const isDocsUrl = (url) => url.pathname.slice(siteRoot().pathname.length).startsWith("docs/");

async function exitTransition(shell, url) {
  if (reducedMotion()) return;
  // Between documentation pages the navigation stays where it is: only the reading column
  // (article and table of contents) leaves, so the sidebar never flickers.
  const docsToDocs = shell.dataset.layout === "docs" && isDocsUrl(url);
  const targets = docsToDocs ? shell.querySelectorAll(".article, .toc") : shell;
  await gsap
    .to(targets, { opacity: 0, y: docsToDocs ? 6 : 8, duration: DUR.quick, ease: EASE.in })
    .then();
}

function announce(title) {
  const el = document.querySelector("[data-route-announcer]");
  if (el) el.textContent = `Navigated to ${title}`;
}

function saveScroll() {
  const state = history.state ?? {};
  history.replaceState({ ...state, mp: true, x: scrollX, y: scrollY }, "");
}

export async function navigate(href, { push = true, scroll = null } = {}) {
  const url = new URL(href, location.href);
  if (!eligible(url)) {
    location.assign(url.href);
    return;
  }
  const samePage = url.pathname === location.pathname && url.search === location.search;
  if (samePage && push) {
    // An in-page anchor: let the browser (or Lenis) handle it, and keep history.
    if (url.hash) {
      history.pushState({ mp: true, x: scrollX, y: scrollY }, "", url.href);
      const target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
      if (target) {
        hooks.scrollToTarget(target);
        // Move focus there too, so keyboard and screen-reader users arrive where they looked.
        if (!target.matches("a, button, input, select, textarea, [tabindex]"))
          target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
      }
    }
    return;
  }
  const token = {};
  navigating = token;
  if (push) saveScroll();
  const stopPlayhead = startPlayhead();
  const shell = document.querySelector("[data-shell]");
  try {
    const [html] = await Promise.all([fetchPage(url), exitTransition(shell, url)]);
    if (navigating !== token) return;
    const doc = new DOMParser().parseFromString(html, "text/html");
    const next = doc.querySelector("[data-shell]");
    if (!next) throw new Error("no shell");
    // A page from a newer deploy needs that deploy's scripts: load it for real.
    if (buildOf(doc, url) !== BOOT_BUILD) throw new Error("new deploy");
    const persistentLinks = document.querySelectorAll("[data-persist] a[href]");
    const freshLinks = doc.querySelectorAll("[data-persist] a[href]");
    if (persistentLinks.length !== freshLinks.length) throw new Error("persistent links differ");
    await hooks.beforeSwap(shell);
    if (push) history.pushState({ mp: true, x: 0, y: 0 }, "", url.href);
    document.title = doc.title;
    for (const sel of [
      'meta[name="description"]',
      'link[rel="canonical"]',
      'meta[property="og:url"]',
      'meta[property="og:title"]',
      'meta[name="mp-root"]',
    ]) {
      const fresh = doc.head.querySelector(sel);
      const current = document.head.querySelector(sel);
      if (fresh && current) current.replaceWith(fresh.cloneNode(true));
    }
    for (const attr of ["data-layout", "data-page"])
      document.documentElement.setAttribute(attr, doc.documentElement.getAttribute(attr) ?? "");
    // The header, mobile menu and search stay on screen across pages, but their links are
    // relative to the page they were rendered for: take the new page's version of each link.
    persistentLinks.forEach((a, i) => a.setAttribute("href", freshLinks[i].getAttribute("href")));
    const imported = document.importNode(next, true);
    const sidebarTop = shell.querySelector(".sidebar")?.scrollTop;
    shell.replaceWith(imported);
    // The new sidebar opens where the reader left the old one.
    const sidebar = imported.querySelector(".sidebar");
    if (sidebar && sidebarTop) sidebar.scrollTop = sidebarTop;
    // Mount the page at the top, as a fresh load would. Creating ScrollTriggers while the page is
    // already scrolled far down makes the "once" reveals above the fold fire and remove themselves
    // in the middle of ScrollTrigger's own refresh, which throws. Then go to the hash target or
    // the restored position (still before the entrance, in the same frame).
    window.scrollTo(0, 0);
    renderedPath = url.pathname + url.search;
    await hooks.afterSwap(imported, { url });
    const target = url.hash ? document.getElementById(decodeURIComponent(url.hash.slice(1))) : null;
    if (scroll) await hooks.restoreScroll(scroll);
    else if (target) await hooks.scrollToTarget(target, { instant: true });
    stopPlayhead();
    hooks.enter(imported);
    const focusTarget = imported.querySelector("h1[tabindex]") ?? imported.querySelector("main");
    if (!target && focusTarget) focusTarget.focus({ preventScroll: true });
    announce(doc.title.replace(/ · MotionPR.*$/, ""));
  } catch (error) {
    // A newer deploy is expected, not a failure; anything else is worth a warning.
    if (error?.message !== "new deploy")
      console.warn("[motionpr] soft navigation failed, loading the page", error);
    location.assign(url.href);
  } finally {
    if (navigating === token) navigating = null;
  }
}

export function initRouter(h) {
  hooks = { ...hooks, ...h };
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  history.replaceState({ ...(history.state ?? {}), mp: true, x: scrollX, y: scrollY }, "");

  document.addEventListener("click", (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const anchor = event.target.closest?.("a[href]");
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("mailto:")) return;
    const url = new URL(anchor.href, location.href);
    if (!eligible(url, anchor)) return;
    event.preventDefault();
    navigate(url.href);
  });

  const intent = (event) => {
    const anchor = event.target.closest?.("a[href]");
    if (anchor && anchor.dataset.router !== "off") prefetch(anchor.href);
  };
  document.addEventListener("pointerover", intent, { passive: true });
  document.addEventListener("focusin", intent);
  document.addEventListener("touchstart", intent, { passive: true });

  window.addEventListener("popstate", (event) => {
    const state = event.state;
    const scroll = state?.mp ? { x: state.x ?? 0, y: state.y ?? 0 } : null;
    if (location.pathname + location.search === renderedPath) {
      // Only the hash changed (back from an in-page anchor): restore the position, no reload.
      if (scroll) window.scrollTo(scroll.x, scroll.y);
      return;
    }
    navigate(location.href, { push: false, scroll });
  });

  let t = 0;
  window.addEventListener(
    "scroll",
    () => {
      clearTimeout(t);
      t = setTimeout(saveScroll, 120);
    },
    { passive: true },
  );
}
