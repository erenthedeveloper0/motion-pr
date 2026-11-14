// Documentation page behaviour: the sidebar's active indicator (it glides from the previous page's
// item), the mobile drawer, the table of contents scrollspy with its marker, and reading progress.
import { DUR, EASE, gsap, reducedMotion } from "../lib/motion.js";

let lastIndicator = null; // previous page's indicator box, for the glide

export function mountDocsPage(shell) {
  const controller = new AbortController();
  const { signal } = controller;
  const cleanups = [];
  const sidebar = shell.querySelector(".sidebar");
  const inner = shell.querySelector(".sidebar__inner");
  const indicator = shell.querySelector(".sidebar__indicator");
  const current = shell.querySelector('.sidebar a[aria-current="page"]');

  // Sidebar indicator: glide from where it was on the previous page.
  if (indicator && inner) {
    if (current) {
      const box = current.getBoundingClientRect();
      const base = inner.getBoundingClientRect();
      const to = { y: box.top - base.top + 6, height: box.height - 12, opacity: 1 };
      // Keep the active item in view inside the sidebar.
      const sbox = sidebar.getBoundingClientRect();
      if (box.top < sbox.top + 80 || box.bottom > sbox.bottom - 80)
        sidebar.scrollTop += box.top - sbox.top - sbox.height / 3;
      const fresh = current.getBoundingClientRect();
      to.y = fresh.top - inner.getBoundingClientRect().top + 6;
      if (lastIndicator && !reducedMotion()) {
        gsap.fromTo(
          indicator,
          { y: lastIndicator.y, height: lastIndicator.height, opacity: 1 },
          { ...to, duration: DUR.slow, ease: EASE.out },
        );
      } else gsap.set(indicator, to);
      lastIndicator = { y: to.y, height: to.height };
    } else {
      gsap.set(indicator, { opacity: 0 });
      lastIndicator = null;
    }
  }

  // Mobile drawer
  const toggle = shell.querySelector("[data-sidebar-toggle]");
  let scrim = null;
  const setDrawer = (open) => {
    if (!sidebar || !toggle) return;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) {
      sidebar.classList.add("is-open");
      scrim = document.createElement("div");
      scrim.className = "sidebar-scrim";
      scrim.addEventListener("click", () => setDrawer(false));
      sidebar.before(scrim);
      if (!reducedMotion()) {
        gsap.fromTo(sidebar, { x: "-102%" }, { x: "0%", duration: DUR.slow, ease: EASE.out });
        gsap.fromTo(scrim, { opacity: 0 }, { opacity: 1, duration: DUR.base });
      }
      (sidebar.querySelector('a[aria-current="page"]') ?? sidebar.querySelector("a"))?.focus();
    } else {
      const done = () => {
        sidebar.classList.remove("is-open");
        gsap.set(sidebar, { clearProps: "transform" });
        scrim?.remove();
        scrim = null;
      };
      if (reducedMotion()) done();
      else {
        gsap.to(sidebar, { x: "-102%", duration: DUR.base, ease: EASE.in, onComplete: done });
        if (scrim) gsap.to(scrim, { opacity: 0, duration: DUR.base });
      }
    }
  };
  toggle?.addEventListener(
    "click",
    () => setDrawer(toggle.getAttribute("aria-expanded") !== "true"),
    { signal },
  );
  sidebar?.addEventListener(
    "click",
    (e) => {
      if (e.target.closest("a") && toggle?.getAttribute("aria-expanded") === "true")
        setDrawer(false);
    },
    { signal },
  );
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && toggle?.getAttribute("aria-expanded") === "true") {
        setDrawer(false);
        toggle.focus();
      }
    },
    { signal },
  );
  cleanups.push(() => scrim?.remove());

  // Table of contents: the section being read is the last heading above the reading line.
  const links = [...shell.querySelectorAll(".toc a")];
  const marker = shell.querySelector(".toc__marker");
  const headings = links
    .map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1))))
    .filter(Boolean);
  let active = -1;
  const setActive = (i) => {
    if (i === active) return;
    active = i;
    links.forEach((a, j) =>
      j === i ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current"),
    );
    if (!marker) return;
    if (i < 0) return void gsap.to(marker, { opacity: 0, duration: DUR.quick });
    const a = links[i];
    const to = { y: a.offsetTop + 4, height: a.offsetHeight - 8, opacity: 1 };
    if (reducedMotion()) gsap.set(marker, to);
    else gsap.to(marker, { ...to, duration: DUR.base, ease: EASE.out });
  };

  // Reading progress, and the scrollspy, in one rAF-throttled scroll handler.
  const progress = shell.querySelector(".reading-progress");
  const article = shell.querySelector("[data-docs-article]");
  let ticking = false;
  const update = () => {
    ticking = false;
    if (progress && article) {
      const rect = article.getBoundingClientRect();
      const total = rect.height - innerHeight * 0.6;
      const p = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 1;
      progress.style.setProperty("--progress", p.toFixed(4));
    }
    if (headings.length) {
      const line = innerHeight * 0.3;
      let i = -1;
      for (let j = 0; j < headings.length; j++)
        if (headings[j].getBoundingClientRect().top <= line) i = j;
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4)
        i = headings.length - 1;
      setActive(i);
    }
  };
  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };
  window.addEventListener("scroll", onScroll, { passive: true, signal });
  window.addEventListener("resize", onScroll, { passive: true, signal });
  update();

  return () => {
    controller.abort();
    for (const c of cleanups) c();
  };
}
