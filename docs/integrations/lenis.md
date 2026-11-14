---
title: Lenis integration
description: Record and compare Lenis smooth scrolling with @erenthedeveloper0/motionpr/lenis.
---

# Lenis integration

Lenis is a smooth-scroll engine, not an animation timeline. MotionPR therefore records **scroll
motion** — where the page actually was, frame by frame — rather than pretending a scroll has an
animation duration or easing. Scroll records are compared with scroll-specific metrics.

**Status:** supported. Tested against Lenis **1.3.27**; versions outside `>=1.1.0 <2.0.0` are
reported as _untested_.

|         |                                                                                                                            |
| ------- | -------------------------------------------------------------------------------------------------------------------------- |
| Install | `npm install -D @erenthedeveloper0/motionpr` and `npm install lenis` (optional peer dependency)                            |
| Import  | `import { motionprLenis } from "@erenthedeveloper0/motionpr/lenis"` (browser code, no dependencies, does not bundle Lenis) |
| Config  | `adapters: [{ name: "lenis", required: true }]`                                                                            |
| Records | `ScrollMotionRecord` with `source: "lenis"` in `checkpoint.scrollMotion`                                                   |

<!-- motionpr:engine-demo engine="lenis" -->

## Setup

```ts
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { motionprLenis } from "@erenthedeveloper0/motionpr/lenis";

const lenis = new Lenis({ autoRaf: true });
motionprLenis.attach(lenis); // or attach(lenis, { name: "page" }) for a stable session name
```

With GSAP ScrollTrigger (externally managed RAF):

```ts
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { motionprGsap } from "@erenthedeveloper0/motionpr/gsap";
import { motionprLenis } from "@erenthedeveloper0/motionpr/lenis";

motionprGsap.register(gsap);
gsap.registerPlugin(ScrollTrigger);

const lenis = new Lenis({ autoRaf: false });
lenis.on("scroll", ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);
motionprLenis.attach(lenis);
```

### Scenarios

Two steps produce scroll motion, and one waits for it to finish:

```ts
scenarios: [
  {
    id: "journal",
    steps: [
      // Programmatic smooth scroll through Lenis (falls back to native smooth scrolling
      // when no Lenis instance is attached; `via: "lenis"` makes Lenis mandatory).
      { type: "scrollTo", target: "#journal", behavior: "smooth" },
      { type: "waitForScrollSettled" },
      { type: "capture", label: "journal" },
      // Real wheel input, which Lenis intercepts exactly as it does for users.
      { type: "wheel", deltaY: 800, steps: 4 },
      {
        type: "waitForScrollSettled",
        timeout: 5000,
        threshold: 0.5,
        stableFrames: 6,
        minStableMs: 100,
      },
      { type: "capture", label: "after-wheel" },
    ],
  },
];
```

`waitForScrollSettled` resolves when **every** scroller (the document, plus each attached
Lenis instance) has moved less than `threshold` px per sample for `stableFrames` consecutive
samples **and** at least `minStableMs`, so throttled frame rates cannot settle early. A Lenis
instance still easing out (`isScrolling: "smooth"` and moving) counts as moving even when its
steps are tiny; a stopped instance (`lenis.stop()`) counts as settled. On timeout the step adds
a `SCROLL_NOT_SETTLED` warning instead of failing; a Lenis instance that reports smooth
scrolling but never moves adds `SCROLL_STALLED` (usually: `autoRaf: false` and nothing calls
`lenis.raf()`).

## What is captured

For every Lenis `scroll` event in a checkpoint window, on MotionPR's monotonic clock
(`performance.now()`, window-relative):

| Field                      | Lenis property                                                 |
| -------------------------- | -------------------------------------------------------------- |
| `actualScroll`             | `actualScroll` (the browser's scroll position)                 |
| `animatedScroll`           | `animatedScroll` (what Lenis renders)                          |
| `targetScroll`             | `targetScroll`                                                 |
| `progress`, `limit`        | `progress`, `limit`                                            |
| `velocity`, `direction`    | `velocity` (px per frame), `direction`                         |
| `isScrolling`, `isStopped` | `isScrolling` (`false`, `"smooth"` or `"native"`), `isStopped` |

Plus per record: axis (`isHorizontal`), wrapper element identity, `prefersReducedMotion`, the
event count, and the Lenis options that shape the motion (`lerp`, `duration`, `easing` as
`"custom"`, `smoothWheel`, `syncTouch`, `infinite`, `orientation`, `wheelMultiplier`,
`autoRaf`, …; scalars only, never functions). Lenis's own `time` is kept as metadata only,
because with an external RAF it is on the caller's clock. Live Lenis objects are never stored.
No raw input events (wheel/touch payloads) are recorded.

A record is emitted when the scroller moved in the window. Instant positioning (`scroll`,
`scrollIntoView` steps) is a state change and produces no scroll motion; `scrollTo` and
`wheel` steps always record what happened, even a jump (reduced motion).

## How scroll is compared

<!-- motionpr:scroll dataset="lenis-journal/scrolled" -->

The chart above is the demo app's `lenis-journal` scenario, recorded by this adapter: the baseline
scrolls with `lerp: 0.1`, the candidate with `lerp: 0.06`. For this capture MotionPR reported the
settle time (_Scroll takes 1228ms → 2045ms to settle (+817ms)_, a warning), the lower peak velocity
(_6.54 → 4.31 px/ms (-34%)_, info) and the option change (info). Scroll is recorded live, so these
numbers move by a few milliseconds between runs; the thresholds are built for that.

Metrics are derived from `animatedScroll` over time and normalized to the movement, so a scroll
that begins a frame later does not register:

| Metric                                              | Rule               | Default threshold                                 |
| --------------------------------------------------- | ------------------ | ------------------------------------------------- |
| start / end / target position                       | `scroll-position`  | ignore ≤ 2 px, warn ≥ 24 px                       |
| movement duration (to settle)                       | `scroll-duration`  | ignore ≤ 60 ms; warn when > 120 ms **and** > 20%  |
| normalized progress curve (the "scroll easing")     | `scroll-curve`     | ignore ≤ 0.04, warn ≥ 0.10                        |
| peak velocity (px/ms, derived)                      | `scroll-velocity`  | ignore ≤ ±25%, warn > ±50%                        |
| overshoot past the final position                   | `scroll-overshoot` | ignore ≤ 4 px; warn when it appears or disappears |
| direction changes, smooth-scroll lag, Lenis options | info               | —                                                 |

All thresholds live in `comparison.scroll` (see [Comparison thresholds](../configuration/comparison.md#comparisonscroll)).
A Lenis record and a native record on the same scroller are paired and reported as an engine
change. A scroller that had not settled is reported as `uncertain`, never as a regression.

## In the report

Scroll records appear as lanes in the timeline (rendered position for baseline and candidate).
Selecting one opens the scroll inspector: position over time (rendered, native and target),
velocity, the normalized progress curves, the metrics table, the Lenis options and the
animations that ran during the scroll. All charts follow the shared playhead. Use the engine
filter to show only Lenis.

## Limitations

- Scroll motion is **recorded live and never replayed**: filmstrip frames for a scroll window
  show the final scroll position, and the scroll graph is the source of truth for the movement.
  (Replaying by setting scroll positions would re-run scroll handlers and ScrollTrigger
  callbacks in your app.)
- Lenis velocity is reported in Lenis's units (px per frame); comparisons use velocities derived
  from positions over time (px per ms).
- `scrollTo` steps drive the **first** attached Lenis instance. Lenis instances on scroll
  containers (`wrapper` option) are recorded with their wrapper identity, but this is not yet
  covered by browser tests, and steps do not drive them.
- With `infinite: true`, positions wrap; distance and curve metrics assume no wrap.
- Touch scrolling (`syncTouch`) is recorded like any scroll but not generated by steps.

## Lifecycle and safety

- MotionPR never starts a RAF loop, never calls `lenis.raf()`, never changes options, never
  intercepts input and never calls `destroy()`.
- `attach()` adds one `scroll` listener through `lenis.on()`; attaching the same instance again
  returns the existing subscription (no duplicate listeners).
- `handle.dispose()` removes the listener with the unsubscribe function `on()` returns (falling
  back to `off()`), and unregisters the adapter when no instance is attached. It does not stop,
  destroy or reconfigure Lenis.
- Without a capturing MotionPR agent, `attach()` returns an inactive handle and adds nothing.

## API

| Export                                                         | Description                                                                                                       |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `motionprLenis.attach(lenis, options?)`                        | Starts observing a Lenis instance. `AttachOptions`: `{ name?: string; force?: boolean }`. Returns a `LenisHandle` |
| `motionprLenis.isActive()`                                     | `true` while at least one instance is attached to a capturing agent                                               |
| `handle.dispose()`, `handle.getDiagnostics()`, `handle.active` | Lifecycle and health of one attachment                                                                            |
| `readState(lenis)`                                             | The public state MotionPR reads, as a plain object                                                                |
| `SUPPORTED_LENIS_RANGE`                                        | The tested version range                                                                                          |
| `LenisLike`, `LenisHandle`, `AttachOptions`                    | Types                                                                                                             |

`motionprLenis` is also the default export.

## Troubleshooting

| Symptom                                 | Fix                                                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `ADAPTER_MISSING` for `lenis`           | `motionprLenis.attach(lenis)` did not run in the captured page                                            |
| `SCROLL_STALLED`                        | Lenis reports smooth scrolling but never moves: with `autoRaf: false`, call `lenis.raf(time)` every frame |
| `SCROLL_NOT_SETTLED`                    | Raise the step `timeout`, or check for scroll-jacking that never comes to rest                            |
| `SCROLL_NATIVE` (info)                  | A `scrollTo` step used native smooth scrolling because no Lenis instance was attached                     |
| No scroll record after `scrollIntoView` | Expected: instant positioning is not scroll motion. Use `scrollTo` with `behavior: "smooth"`              |
| `LENIS_VERSION_UNKNOWN`                 | The page's Lenis did not set `window.lenisVersion`; support status is unknown                             |
