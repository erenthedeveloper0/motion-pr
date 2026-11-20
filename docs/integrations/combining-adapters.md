---
title: Combining adapters
description: Use native animations, GSAP, Anime.js and Lenis together, and read their relationships.
---

# Combining adapters

A creative site rarely uses one engine. MotionPR records every engine in the same checkpoint,
on one clock, and keeps their meaning separate:

| Record               | What it is                                         | Produced by                                                                                                                     |
| -------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `AnimationRecord`    | One element animated over time                     | CSS (`driver: css`), WAAPI (`waapi`), GSAP and Anime.js (`javascript`), Anime.js `waapi.animate()` (`waapi`, `source: animejs`) |
| `TimelineRecord`     | A container that sequences animations, with labels | GSAP and Anime.js timelines                                                                                                     |
| `ScrollMotionRecord` | How a scroller moved                               | Lenis (`source: lenis`) and native scrolling (`source: native`)                                                                 |
| `FrameSample`        | Computed values of one animation at one instant    | Deterministic replay                                                                                                            |

```ts
// motionpr.config.ts
export default defineConfig({
  baseURL: "http://localhost:3000",
  adapters: [
    { name: "gsap", required: true },
    { name: "animejs", required: true },
    { name: "lenis", required: true },
  ],
  scenarios: [
    {
      id: "journal",
      steps: [
        { type: "scrollTo", target: "#journal" },
        { type: "waitForScrollSettled" },
        { type: "capture", label: "journal" },
      ],
    },
  ],
});
```

Connect each engine in the app as its guide describes ([GSAP](gsap.md), [Anime.js](animejs.md),
[Lenis](lenis.md)). Order does not matter, and each one is a no-op outside a capture.

## No duplicate records

- An animation is recorded by exactly one source. Anime.js `waapi.animate()` creates real Web
  Animations; the Anime.js adapter _claims_ them, so MotionPR's native collector records them
  once, labelled `source: animejs`, `driver: waapi`.
- When Lenis drives the document scroller, the native document scroll is not recorded again;
  when it drives a scroll container (`wrapper`), that container is not recorded again as a native
  scroll container.
- If two engines animate the same property of the same element at the same time (usually a bug
  in the app), the checkpoint gets a `POSSIBLE_DUPLICATE_RECORDS` warning naming them.

## Scroll and animation relationships

MotionPR distinguishes three things that often happen together:

1. **Scroll motion** (Lenis or native): a `ScrollMotionRecord`.
2. **Scroll-linked animations**, whose engine declares that their progress follows scroll: CSS
   scroll-driven animations (`timeline: scroll | view`) and GSAP ScrollTrigger animations. They
   have no start time, so they are not replayed in time; MotionPR records their timing and, for
   GSAP, their **progress observed live** (`progressTrace`) and the **positions ScrollTrigger
   resolved** (`scrollLink`, unreleased after `0.3.0-alpha`).
3. **Animations that merely ran during a scroll**, e.g. an `IntersectionObserver` reveal.

Every checkpoint lists `correlations`: `kind: "scroll-linked"` for (2), and
`kind: "overlap"` with the overlap in milliseconds for (3). An overlap is an observation in time,
**not** a claim that the scroll caused the animation; the report says so. MotionPR does not
assume a GSAP animation is controlled by Lenis just because both are present.

For scroll-linked GSAP animations the comparison reports a moved ScrollTrigger `start`/`end`
from the positions ScrollTrigger resolved: _“Starts at scroll position 400px → 550px (+150px)”_,
and a changed `scrub` or `toggleActions` as a scroll setting (unreleased, after `0.3.0-alpha`).
Captures without those positions (`0.3.0-alpha` and earlier) are compared by relating progress
to scroll position instead: _“Scroll-linked progress at the same scroll position differs by up
to N%”_. The _values_ a scroll-linked tween writes (e.g. `yPercent`) are sampled at the progress the
scroll reached and compared at the same progress, so a changed parallax distance is found too:
_“Scroll-linked translateY differs by up to 120px at the same scroll progress”_ (see
[GSAP: ScrollTrigger](gsap.md#scrolltrigger)).

## Filtering by engine

The report's timeline and difference list can be filtered by engine: Native CSS, WAAPI, GSAP,
Anime.js, Lenis (and Native scroll when present). Every difference carries its `source`, and
JSON/Markdown output include it.

## Tested combinations

| Combination                                       | Covered by                                                  |
| ------------------------------------------------- | ----------------------------------------------------------- |
| GSAP + Lenis (ScrollTrigger via `gsap.ticker`)    | demo app `lenis-journal`, CLI end-to-end test               |
| Anime.js + native CSS transitions                 | Anime.js browser tests, demo app                            |
| Anime.js + WAAPI (`waapi.animate`, no duplicates) | Anime.js browser tests                                      |
| GSAP + native animations                          | GSAP browser tests, demo app                                |
| GSAP + Anime.js + Lenis in one page               | demo app (11 scenarios), `motionpr run` CLI end-to-end test |
