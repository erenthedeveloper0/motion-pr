// Entrance choreography for a freshly shown page. Roles, not one generic fade:
//   title  — rises out of its own line (mask), the brand curve, the longest move on the page
//   lede   — follows a beat later, shorter travel
//   blocks — the first screenful of content settles in a tight stagger; the rest is simply there
//   toc    — items arrive top to bottom, quietly
import { DUR, EASE, STAGGER, gsap, reducedMotion } from "../lib/motion.js";

/** Delay between the hero's lines, in seconds: the "+90 ms" the page prints beside them. */
const HERO_STAGGER = 0.09;

export function enter(shell) {
  if (reducedMotion()) {
    shell.querySelectorAll("[data-reveal], [data-hero]").forEach((el) => (el.style.opacity = ""));
    document.documentElement.classList.add("is-entered");
    return null;
  }
  const tl = gsap.timeline({
    defaults: { ease: EASE.out },
    onComplete: () => document.documentElement.classList.add("is-entered"),
  });
  const layout = shell.dataset.layout;

  if (layout === "landing") {
    // The staircase: each line rises 90 ms after the previous one, as its tick says
    // (site/pages.mjs, HERO_LINES).
    const lines = shell.querySelectorAll('[data-hero="line"]');
    // The pre-entrance CSS hides lines with translateY(108%); start from an explicit y: 0 so the
    // offset GSAP reads from it does not survive the entrance.
    tl.fromTo(
      lines,
      { yPercent: 108, y: 0 },
      { yPercent: 0, y: 0, duration: 1.15, stagger: HERO_STAGGER },
      0.15,
    );
    tl.fromTo(
      shell.querySelectorAll(".hero__tick"),
      { opacity: 0, x: -8 },
      { opacity: 1, x: 0, duration: DUR.story, stagger: HERO_STAGGER },
      0.95,
    );
    tl.fromTo(
      shell.querySelector('[data-hero="eyebrow"]'),
      { opacity: 0, y: 8, letterSpacing: "0.32em" },
      { opacity: 1, y: 0, letterSpacing: "0.2em", duration: 1.1, clearProps: "letterSpacing" },
      0.02,
    );
    tl.fromTo(
      shell.querySelectorAll('[data-hero="lede"], [data-hero="actions"], [data-hero="install"]'),
      { opacity: 0, y: 14 },
      { opacity: 1, y: 0, duration: DUR.story, stagger: 0.07 },
      0.55,
    );
    // The horizon draws its own intro (the circles separate); here it only comes up out of the
    // dark, slower than everything else.
    tl.fromTo(
      shell.querySelector('[data-hero="horizon"]'),
      { opacity: 0, y: 24 },
      { opacity: 1, y: 0, duration: DUR.intro, ease: EASE.out },
      0.25,
    );
    tl.fromTo(
      shell.querySelector('[data-hero="index"]'),
      { opacity: 0 },
      { opacity: 1, duration: DUR.slow },
      0.9,
    );
    return tl;
  }

  const title = shell.querySelector('[data-reveal="title"] .h1-inner');
  const lede = shell.querySelector('[data-reveal="lede"]');
  if (title) tl.fromTo(title, { yPercent: 104, y: 0 }, { yPercent: 0, y: 0, duration: 0.7 }, 0);
  if (lede) tl.fromTo(lede, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: DUR.slow }, 0.08);
  const article = shell.querySelector("[data-docs-article]") ?? shell.querySelector(".app-page");
  if (article) {
    const fold = innerHeight * 1.1;
    const blocks = [...article.children].filter(
      (el) =>
        !el.matches("h1, [data-reveal], .app-page__head") && el.getBoundingClientRect().top < fold,
    );
    if (blocks.length)
      tl.fromTo(
        blocks.slice(0, 8),
        { opacity: 0, y: 12 },
        {
          opacity: 1,
          y: 0,
          duration: DUR.slow,
          stagger: STAGGER.base,
          clearProps: "transform,opacity",
        },
        0.14,
      );
  }
  const toc = shell.querySelectorAll(".toc li");
  if (toc.length)
    tl.fromTo(
      toc,
      { opacity: 0, x: -6 },
      {
        opacity: 1,
        x: 0,
        duration: DUR.base,
        stagger: STAGGER.tight,
        clearProps: "transform,opacity",
      },
      0.2,
    );
  const head = shell.querySelector(".app-page__head");
  if (head)
    tl.fromTo(
      head.querySelectorAll(".label, .app-page__lede"),
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: DUR.slow, stagger: 0.06 },
      0.1,
    );
  return tl;
}
