// MotionPR website. Persistent UI (header, search, copy) is set up once; everything inside the
// page shell is mounted per page and torn down before the next one replaces it.
import { ScrollTrigger, gsap, onReducedMotionChange, reducedMotion } from "./lib/motion.js";
import { ticker } from "./lib/ticker.js";
import { mountAbove, mountAll, registryStats, unmountAll } from "./registry.js";
import { initRouter, navigate } from "./router.js";
import { breatheMark, initHeader } from "./ui/header.js";
import { initSearch } from "./ui/search.js";
import { initCopy } from "./ui/copy.js";
import { mountDocsPage } from "./ui/docs.js";
import { enter } from "./ui/enter.js";
import { getLenis, mountLanding } from "./ui/landing.js";

let pageCleanup = null;
let entrance = null;

function mountPage(shell) {
  const layout = shell.dataset.layout;
  const cleanups = [];
  if (layout === "docs") cleanups.push(mountDocsPage(shell));
  if (layout === "landing") cleanups.push(mountLanding(shell));
  mountAll(shell);
  pageCleanup = () => {
    for (const c of cleanups) c?.();
    unmountAll(shell);
  };
}

function unmountPage() {
  entrance?.kill();
  entrance = null;
  pageCleanup?.();
  pageCleanup = null;
  // Anything a page created outside a component context must not survive it.
  for (const st of ScrollTrigger.getAll()) st.kill();
}

// Mounting content above the viewport makes the browser's scroll anchoring move the page natively;
// bring Lenis's own idea of the position (and the page's height) back in line before using it.
function sync(lenis) {
  lenis.resize();
  lenis.scrollTo(scrollY, { immediate: true, force: true });
}

async function scrollToTarget(target, { instant = false } = {}) {
  const shell = document.querySelector("[data-shell]");
  await mountAbove(shell, () => target.getBoundingClientRect().top + scrollY + innerHeight);
  ScrollTrigger.refresh();
  const lenis = getLenis();
  const offset = (document.querySelector(".site-header")?.offsetHeight ?? 64) + 8;
  const now = instant || reducedMotion();
  // What was laid out above the target can still settle after the move: check on arrival and
  // correct, unless the reader has started scrolling on their own.
  const quit = new AbortController();
  for (const type of ["wheel", "touchstart", "keydown", "pointerdown"])
    addEventListener(type, () => quit.abort(), { once: true, passive: true, signal: quit.signal });
  setTimeout(() => quit.abort(), 3000);
  const settle = (tries = 2) => {
    if (quit.signal.aborted) return;
    const off = target.getBoundingClientRect().top - offset;
    if (Math.abs(off) > 3) {
      if (lenis) {
        sync(lenis);
        lenis.scrollTo(scrollY + off, { immediate: true, force: true });
      } else window.scrollBy(0, off);
    }
    if (tries > 1) setTimeout(() => settle(tries - 1), 200);
    else quit.abort();
  };
  if (lenis) {
    sync(lenis);
    lenis.scrollTo(target.getBoundingClientRect().top + scrollY - offset, {
      immediate: now,
      onComplete: () => setTimeout(settle, 60),
    });
    if (now) setTimeout(settle, 120);
  } else {
    target.scrollIntoView({ behavior: now ? "auto" : "smooth", block: "start" });
    if (now) setTimeout(settle, 120);
    else
      addEventListener("scrollend", () => setTimeout(settle, 60), {
        once: true,
        signal: quit.signal,
      });
  }
}

function boot() {
  document.documentElement.classList.add("is-ready");
  const header = initHeader();
  initCopy();
  initSearch({ navigate: (href) => navigate(href) });
  let shell = document.querySelector("[data-shell]");
  mountPage(shell);
  entrance = enter(shell);
  const hashTarget = location.hash
    ? document.getElementById(decodeURIComponent(location.hash.slice(1)))
    : null;
  if (hashTarget) scrollToTarget(hashTarget, { instant: true });

  initRouter({
    beforeSwap: async () => {
      breatheMark(true);
      header.closeMenu();
      unmountPage();
    },
    afterSwap: async (next) => {
      shell = next;
      mountPage(next);
      header.onRoute();
      breatheMark(false);
      ScrollTrigger.refresh();
    },
    // Back/forward: lay the page out above the reader's old place, then go there.
    restoreScroll: async ({ x, y }) => {
      await mountAbove(shell, y + innerHeight);
      ScrollTrigger.refresh();
      const lenis = getLenis();
      if (lenis) {
        sync(lenis); // its scroll limit was measured before the components above mounted
        lenis.scrollTo(y, { immediate: true, force: true });
      } else window.scrollTo(x, y);
      ScrollTrigger.update();
    },
    // In-page anchors: first lay out everything above the target (lazy components grow when they
    // mount and would push it away mid-scroll), then Lenis scrolls the landing page, below the
    // header; elsewhere the browser does, honouring scroll-margin.
    scrollToTarget,
    enter: (next) => {
      entrance = enter(next);
    },
  });

  // A changed motion preference applies immediately: remount the page with or without motion.
  onReducedMotionChange(() => {
    unmountPage();
    gsap.globalTimeline.clear();
    shell = document.querySelector("[data-shell]");
    mountPage(shell);
    entrance = enter(shell);
  });

  // Inspection hook for the site's own browser tests (e2e/docs-site.spec.ts): proves that route
  // changes leave no components, ScrollTriggers, frame loops or Lenis instances behind.
  window.__motionprSite = {
    stats: () => ({
      ...registryStats(),
      scrollTriggers: ScrollTrigger.getAll().length,
      frameLoops: ticker.size,
      frameLoopRunning: ticker.running,
      lenis: Boolean(getLenis()),
      reducedMotion: reducedMotion(),
    }),
  };
}

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
