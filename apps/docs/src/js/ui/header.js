// Persistent header: the logo mark's intro and loading "breath" (both from the brand's motion
// spec), the scrolled state, the mobile menu and the primary-nav marker.
import { markGeometry, MARK_OFFSET } from "../../../../../brand/source/motionpr-logo.mjs";
import { DUR, EASE, gsap, reducedMotion } from "../lib/motion.js";

function markPaths() {
  return [...document.querySelectorAll("path.logo-mark")].map((path) => ({
    path,
    x: Number(path.dataset.markX),
    y: Number(path.dataset.markY),
    size: Number(path.dataset.markSize),
  }));
}
function drawMark(marks, offset) {
  for (const m of marks)
    m.path.setAttribute("d", markGeometry({ x: m.x, y: m.y, size: m.size, offset }).path);
}

let breath = null;
const markState = { offset: MARK_OFFSET };

/** Brand intro: the circles separate from one point. cubic-bezier(.16,1,.3,1), 1600 ms, 350 ms delay. */
export function introMark() {
  const marks = markPaths();
  if (!marks.length || reducedMotion()) return;
  markState.offset = 0;
  drawMark(marks, 0);
  gsap.to(markState, {
    offset: MARK_OFFSET,
    duration: DUR.intro,
    delay: 0.35,
    ease: EASE.out,
    onUpdate: () => drawMark(marks, markState.offset),
  });
}

/** Brand loader: the offset breathes between 100% and 30% (cubic-bezier(.65,0,.35,1), alternate). */
export function breatheMark(on) {
  const marks = markPaths();
  if (!marks.length || reducedMotion()) return;
  breath?.kill();
  if (on) {
    breath = gsap.to(markState, {
      offset: MARK_OFFSET * 0.3,
      duration: 0.9,
      ease: EASE.inOut,
      repeat: -1,
      yoyo: true,
      onUpdate: () => drawMark(marks, markState.offset),
    });
  } else {
    breath = gsap.to(markState, {
      offset: MARK_OFFSET,
      duration: DUR.slow,
      ease: EASE.out,
      onUpdate: () => drawMark(marks, markState.offset),
    });
  }
}

function placeNavMarker(animate) {
  const nav = document.querySelector(".primary-nav");
  const marker = nav?.querySelector(".primary-nav__marker");
  if (!nav || !marker) return;
  const layout = document.documentElement.dataset.layout;
  const page = document.documentElement.dataset.page;
  const key =
    layout === "docs"
      ? "docs"
      : page === "demo"
        ? "demo"
        : page === "playground"
          ? "playground"
          : null;
  for (const a of nav.querySelectorAll("a")) {
    if (a.dataset.nav === key) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  const active = key ? nav.querySelector(`a[data-nav="${key}"]`) : null;
  if (!active) {
    gsap.to(marker, { opacity: 0, duration: DUR.quick });
    return;
  }
  const navBox = nav.getBoundingClientRect();
  const box = active.getBoundingClientRect();
  const to = { x: box.left - navBox.left + 12, width: box.width - 24, opacity: 1 };
  if (animate && !reducedMotion()) gsap.to(marker, { ...to, duration: DUR.slow, ease: EASE.out });
  else gsap.set(marker, to);
}

export function initHeader() {
  const header = document.querySelector(".site-header");
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      header?.classList.toggle("is-scrolled", scrollY > 8);
      ticking = false;
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Mobile menu
  const button = document.querySelector("[data-menu-toggle]");
  const menu = document.getElementById("mobile-nav");
  const setOpen = (open) => {
    if (!button || !menu) return;
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    document.documentElement.classList.toggle("menu-open", open);
    if (open) {
      menu.hidden = false;
      if (!reducedMotion()) {
        gsap.fromTo(menu, { opacity: 0 }, { opacity: 1, duration: DUR.base, ease: EASE.out });
        gsap.fromTo(
          menu.querySelectorAll("li"),
          { y: 18, opacity: 0 },
          { y: 0, opacity: 1, duration: DUR.slow, ease: EASE.out, stagger: 0.035 },
        );
      }
      menu.querySelector("a")?.focus();
    } else if (!menu.hidden) {
      if (reducedMotion()) menu.hidden = true;
      else
        gsap.to(menu, {
          opacity: 0,
          duration: DUR.quick,
          ease: EASE.in,
          onComplete: () => (menu.hidden = true),
        });
    }
  };
  button?.addEventListener("click", () => setOpen(button.getAttribute("aria-expanded") !== "true"));
  menu?.addEventListener("click", (e) => {
    if (e.target.closest("a")) setOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && button?.getAttribute("aria-expanded") === "true") {
      setOpen(false);
      button.focus();
    }
  });
  window.addEventListener("resize", () => {
    if (innerWidth > 920 && button?.getAttribute("aria-expanded") === "true") setOpen(false);
    placeNavMarker(false);
  });
  document.fonts?.ready.then(() => placeNavMarker(false));
  placeNavMarker(false);
  introMark();
  return { onRoute: () => placeNavMarker(true), closeMenu: () => setOpen(false) };
}
