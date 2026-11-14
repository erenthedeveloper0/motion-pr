---
title: Architecture
description: How the agent, adapters, replay, normalization, comparison and report fit together, and where each lives in the repository.
---

# Architecture

## Packages

```text
packages/core          schemas (capture/comparison v2), config, easing math, adapter protocol, storage
packages/capture       Playwright runner + the in-page agent (src/agent, bundled into the runner)
packages/comparison    matching, animation/scroll/timeline comparison, severity, visual diff
packages/report        offline report viewer (React, one HTML file) + generator
packages/adapters/*    gsap, animejs, lenis: browser code, published as @erenthedeveloper0/motionpr/<name>
packages/cli           the motionpr CLI and the public entry points; the only published package
fixtures/demo-app      the demo site with baseline and candidate variants (every engine)
apps/docs              this website
```

Only `packages/cli` is published. It bundles the private workspace packages (`@motionpr/*`) and
keeps third-party dependencies external.

## The capture pipeline

1. **Agent.** Before any page script runs, Playwright injects MotionPR's agent
   (`window.__MOTIONPR_AGENT__`). It discovers native animations (CSS transitions, CSS
   animations, Web Animations) by polling `document.getAnimations()` every frame and patching
   `Element.prototype.animate`, and records interaction triggers.
2. **Adapters** for JavaScript engines (GSAP, Anime.js, Lenis, custom) register with the agent
   from inside the app. They implement one contract (`MotionprAdapter` in
   `@motionpr/core/protocol`): `collect()` animations, and optionally `collectTimelines()`,
   `collectScroll()`, `claims()` for native animations their engine created, deterministic
   `beginReplay()` / `seek()` / `endReplay()`, `scrollStates()` for settle detection,
   `scrollTo()` for scroll steps and `diagnostics()`. Their public handles add `dispose()`.
3. **Windows.** Each checkpoint closes a window that opened at the previous checkpoint. The
   window origin is the first motion after the first interaction: the earliest animation start
   or the first frame of scroll movement. Motion that began before the interaction belongs to
   the previous state and is excluded (with a diagnostic).
4. **Settling.** A checkpoint waits until no finite animation runs, no smooth scroll is
   advancing, and nothing new started for `capture.settleTime`.
5. **Replay.** Native animations are replayed by cloning them (`target.animate(keyframes,
timing)`) and seeking the paused clones, so the originals never re-dispatch
   `transitionend`/`animationend`/`finish`. Adapters render their engines at exact times with
   callbacks muted (GSAP `totalTime(t, true)`, Anime.js `seek(t, true)`). Everything else is
   frozen. Samples (computed styles, transforms, geometry) and filmstrip frames are taken at
   deterministic times, then all state is restored.
6. **Scroll** is never replayed. Scroll motion is observed live (Lenis events, native positions
   each frame) and stored as `ScrollMotionRecord`s. Scroll-linked animations (CSS scroll
   timelines, GSAP ScrollTrigger) are recorded as metadata plus, for GSAP, a live progress trace.
7. **Normalization** (Node side) assigns stable ids (`<element key>::<type>::<name>`), links
   animations to `TimelineRecord`s, computes completeness and correlations, and writes the
   capture bundle (see [Capture serialization](capture-serialization.md)).

Limitations of the approach are listed in each integration guide and in
[Troubleshooting](troubleshooting.md) and [Limitations](limitations.md).

## Comparison and report

`@motionpr/comparison` reads two capture bundles, matches records
([Animation identification](../features/animation-identification.md)), compares each pair, grades
each change with a rule ([Severity](../features/severity.md)), diffs screenshots with pixelmatch and
writes `comparison.json`. `@motionpr/report` copies a prebuilt viewer (React, Tailwind, fonts,
inlined into one HTML file) and embeds both captures and the comparison as inert JSON. Frames stay
separate files in `assets/`.
