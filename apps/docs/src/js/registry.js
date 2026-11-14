// Component lifecycle. Every interactive element declares data-component="name"; its module
// exports mount(el, ctx) and may return a cleanup function. The registry mounts lazily (one shared
// IntersectionObserver), and unmounting a page tears down everything a component created: its
// GSAP context (tweens, timelines, ScrollTriggers), listeners (ctx.signal), and anything handed
// to ctx.track() (clocks, observers, Lenis instances).
import { gsap } from "./lib/motion.js";

const LOADERS = {
  hero: () => import("./components/hero.js"),
  compare: () => import("./components/hero.js"),
  findings: () => import("./components/findings.js"),
  "code-diff": () => import("./components/code-diff.js"),
  workflow: () => import("./components/workflow.js"),
  "diff-viewer": () => import("./components/diff-viewer.js"),
  engines: () => import("./components/engines.js"),
  "engine-demo": () => import("./components/engines.js"),
  "easing-lab": () => import("./components/easing-lab.js"),
  scroll: () => import("./components/scroll.js"),
  "scroll-lab": () => import("./components/scroll-lab.js"),
  timeline: () => import("./components/timeline.js"),
  stagger: () => import("./components/timeline.js"),
  playground: () => import("./components/playground.js"),
  demo: () => import("./components/demo.js"),
  terminal: () => import("./components/terminal.js"),
  mark: () => import("./components/mark.js"),
  "code-tabs": () => import("./ui/code-tabs.js"),
};

const mounted = new Map(); // el → { cleanup }
let io = null;
const pending = new Set();

function ctxFor(el) {
  const controller = new AbortController();
  const tracked = [];
  const gctx = gsap.context(() => {}, el);
  return {
    ctx: {
      signal: controller.signal,
      /** Run code whose GSAP animations belong to this component (reverted on unmount). */
      gsap: (fn) => gctx.add(fn),
      /** Anything with destroy(), kill(), disconnect() or a function. */
      track(obj) {
        tracked.push(obj);
        return obj;
      },
      isMounted: () => !controller.signal.aborted,
    },
    teardown() {
      controller.abort();
      for (const obj of tracked.reverse()) {
        try {
          if (typeof obj === "function") obj();
          else if (obj?.destroy) obj.destroy();
          else if (obj?.kill) obj.kill();
          else if (obj?.disconnect) obj.disconnect();
        } catch (error) {
          console.error("[motionpr] cleanup failed", error);
        }
      }
      gctx.revert();
    },
  };
}

async function mountOne(el) {
  if (mounted.has(el)) return;
  const name = el.dataset.component;
  const load = LOADERS[name];
  if (!load) return;
  const record = { cleanup: null, teardown: null };
  mounted.set(el, record);
  try {
    const mod = await load();
    if (mounted.get(el) !== record) return; // unmounted while loading
    const { ctx, teardown } = ctxFor(el);
    record.teardown = teardown;
    el.classList.add("is-mounted");
    const cleanup = await mod.mount(el, ctx, name);
    if (mounted.get(el) !== record) {
      cleanup?.();
      teardown();
      return;
    }
    record.cleanup = cleanup ?? null;
  } catch (error) {
    console.error(`[motionpr] component "${name}" failed`, error);
    el.classList.add("is-failed");
  }
}

function observer() {
  io ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        pending.delete(e.target);
        mountOne(e.target);
      }
    },
    { rootMargin: "50% 0px" },
  );
  return io;
}

/** Mounts every component in root: immediately when eager, otherwise when it nears the viewport. */
export function mountAll(root = document) {
  for (const el of root.querySelectorAll("[data-component]")) {
    if (mounted.has(el) || pending.has(el)) continue;
    if (el.hasAttribute("data-eager") || typeof IntersectionObserver === "undefined") mountOne(el);
    else {
      pending.add(el);
      observer().observe(el);
    }
  }
}

/**
 * Mounts, now, every pending component that starts above `bottom` (a document y). Used before
 * restoring a scroll position: components change height when they mount, so the page above the
 * reader's place must be laid out as it was when they left. Mounting moves what follows, hence
 * a few passes; it gives up waiting after `timeout` ms rather than hold up the navigation.
 */
export async function mountAbove(root, bottom, { timeout = 1200 } = {}) {
  const deadline = performance.now() + timeout;
  for (let pass = 0; pass < 4 && performance.now() < deadline; pass++) {
    const jobs = [];
    for (const el of [...pending]) {
      if (!root.contains(el) || el.getBoundingClientRect().top + scrollY >= bottom) continue;
      io?.unobserve(el);
      pending.delete(el);
      jobs.push(mountOne(el));
    }
    if (!jobs.length) return;
    const left = Math.max(0, deadline - performance.now());
    await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, left))]);
  }
}

export function unmountAll(root = document) {
  for (const el of [...pending]) {
    if (root.contains(el)) {
      io?.unobserve(el);
      pending.delete(el);
    }
  }
  for (const [el, record] of [...mounted]) {
    if (!root.contains(el)) continue;
    mounted.delete(el);
    try {
      record.cleanup?.();
    } finally {
      record.teardown?.();
      el.classList.remove("is-mounted");
    }
  }
}

export const registryStats = () => ({ mounted: mounted.size, pending: pending.size });
