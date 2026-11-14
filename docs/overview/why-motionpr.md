---
title: Why MotionPR
description: Motion is behaviour, and code review cannot see it. Why animation needs its own regression test.
---

# Why MotionPR

Motion is part of an interface's behaviour: how long a menu takes to open, whether a dialog
settles or overshoots, the rhythm of a staggered list, how far a smooth scroll lags behind the
wheel. It is also the part of a change that code review sees least.

A pull request that changes `--duration-panel` from `320ms` to `560ms` is one line. A refactor
that swaps a hand-tuned `cubic-bezier()` for a design-token `ease-in-out` looks like cleanup. An
upgrade of an animation library, a new default in a component kit, or a reordered timeline can
change how every screen feels without changing a single assertion in your test suite.

## What existing tests see

| Approach                   | Sees motion?                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| Unit and integration tests | No. They assert on state, and the end state of a slower animation is the same                       |
| End-to-end tests           | Rarely. Playwright waits for animations to finish; that is usually what you want from them          |
| Screenshot (visual) tests  | Only the settled state. A transition that got twice as long produces the same final screenshot      |
| Recording a video          | Not reproducibly. Two recordings of the same build differ, and a video cannot be diffed numerically |

## What MotionPR adds

- **Motion as data.** Each animation becomes a record of its timing, easing curve, animated
  properties and sampled computed values, and each scroll a record of positions over time. Data
  can be compared exactly, with tolerances you choose.
- **A baseline you approve.** The approved capture lives in your repository next to the code
  that produces it. A motion change shows up in the same pull request as the code that caused it.
- **Severity, not noise.** Differences are graded (critical, warning, info, uncertain) by rules
  with documented defaults, and anything MotionPR cannot measure reliably is reported as
  uncertain instead of failing your build. See [Severity](../features/severity.md).
- **A report a person can review.** Baseline and candidate play side by side, frame by frame,
  with easing curves, timelines and scroll graphs on the same playhead. It is one HTML file that
  works offline, so a CI artifact is enough. See [HTML reports](../features/html-reports.md).

## When it is worth it

MotionPR earns its place in projects where motion is designed: product sites, creative
development, design systems with motion tokens, component libraries, and apps that use GSAP,
Anime.js or Lenis heavily. It adds a Chromium run per scenario, so a handful of well-chosen
interactions (the menu, the dialog, the hero intro, the main scroll) usually covers what matters.

## When it is not

- Your animations are incidental and nobody would review a change to them.
- Motion is drawn on a `<canvas>` or in WebGL by your own loop. MotionPR only sees animations the
  browser or a supported engine exposes (see [Limitations](../advanced/limitations.md)), unless you
  write an [adapter](../advanced/custom-adapters.md).
- You need Firefox or Safari behaviour. This release captures with Chromium only.
