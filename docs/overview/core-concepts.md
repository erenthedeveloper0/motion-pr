---
title: Core concepts
description: Scenarios, checkpoints, windows, records, baselines, matches and severities — the vocabulary MotionPR uses everywhere.
---

# Core concepts

| Term                   | Meaning                                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Scenario**           | A repeatable interaction: open a page, run steps, record checkpoints. Runs once per viewport, each time in a fresh browser context                                                               |
| **Step**               | One action in a scenario: `click`, `hover`, `scrollTo`, `wheel`, `waitForAnimations`, `capture`, … ([all steps](../configuration/scenarios.md))                                                  |
| **Checkpoint**         | The result of a `capture` or `screenshot` step, identified by its label. Checkpoints are matched across captures by label                                                                        |
| **Window**             | The span of time a checkpoint covers: from the first motion after the first interaction since the previous checkpoint, until motion settles                                                      |
| **Trigger**            | The input event that opened a window. The time from the trigger to the first motion is the window's **latency**                                                                                  |
| **Capture**            | One run of all scenarios: `capture.json` plus content-addressed PNG assets                                                                                                                       |
| **Baseline**           | An approved capture that later captures are compared against. It lives in `.motionpr/baseline/` and is committed                                                                                 |
| **Candidate**          | The capture being compared: usually the one `motionpr run` just made                                                                                                                             |
| **AnimationRecord**    | One element animated over time: timing, easing (with 65 curve samples), properties, sampled values ([data model](../features/capture-data-model.md))                                             |
| **TimelineRecord**     | A GSAP or Anime.js timeline: duration, repeat, speed, labels and the animations that belong to it                                                                                                |
| **ScrollMotionRecord** | How one scroller moved during a window, sample by sample, recorded live                                                                                                                          |
| **Adapter**            | Code in your page that reports an engine's animations to MotionPR (GSAP, Anime.js, Lenis, or [your own](../advanced/custom-adapters.md))                                                         |
| **Element identity**   | How an animated element is recognised across versions: `data-motionpr-id`, `data-testid`, a stable `id`, an accessible label, or a DOM path ([details](../features/animation-identification.md)) |
| **Match**              | A pair of records, one per capture, judged to be the same animation. Method `exact`, `element` or `fuzzy`                                                                                        |
| **Change**             | One measured difference within a match, such as `duration` or `easing`, with before, after, delta and unit                                                                                       |
| **Severity**           | `critical`, `warning`, `info` or `uncertain`, assigned by a named rule ([Severity](../features/severity.md))                                                                                     |
| **Measurement**        | How a value was obtained: `measured`, `estimated`, `incomplete` or `unsupported`                                                                                                                 |
| **Provenance**         | For record fields: `declared` by the engine, `observed` while the page ran, `inferred` from other values, or `unavailable`                                                                       |
| **Report**             | The offline HTML viewer with both captures and the comparison embedded                                                                                                                           |

## Time

Every time in a checkpoint is in milliseconds, relative to the window **origin**: `t = 0` is the
first animation start (or the first frame of scroll movement) after the trigger. Start times and
latency are quantized to frames (about 16.7 ms at 60 Hz) and compared with a tolerance of two
frames. Declared durations, delays and easings are compared exactly.

## Two kinds of motion

An animation maps **time → value**. It can be replayed exactly, so MotionPR samples it at chosen
times. A scroll maps **time → position**, produced by input and an engine. Replaying it would
re-run your scroll handlers, so MotionPR only observes it. The two are stored, compared and drawn
differently, and the report never presents a scroll as if it had an animation duration.
