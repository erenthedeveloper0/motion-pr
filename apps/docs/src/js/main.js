// MotionPR website. Persistent UI (header, search, copy) is set up once; everything inside the
// page shell is mounted per page and torn down before the next one replaces it.
import { ScrollTrigger, gsap, onReducedMotionChange, reducedMotion } from "./lib/motion.js";
import { ticker } from "./lib/ticker.js";
import { mountAll, registryStats, unmountAll } from "./registry.js";
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

function boot() {
  document.documentElement.classList.add("is-ready");
  const header = initHeader();
  initCopy();
  initSearch({ navigate: (href) => navigate(href) });
  let shell = document.querySelector("[data-shell]");
  mountPage(shell);
  entrance = enter(shell);

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
