---
title: Easing analysis
description: MotionPR compares easing as curves, not strings — equivalent spellings match, and real changes are measured.
---

# Easing analysis

Two easings that look different can be the same curve (`ease` and
`cubic-bezier(0.25, 0.1, 0.25, 1)`), and two that look similar can feel very different. MotionPR
therefore compares the **curve**: 65 evenly spaced samples of eased progress over input progress
0 → 1, taken for every easing an engine can evaluate.

<!-- motionpr:easing-lab baseline="cubic-bezier(0.16, 1, 0.3, 1)" candidate="ease-in-out" -->

The lab above runs MotionPR's own easing code (`@motionpr/core`) in your browser: the parser,
the evaluator and `compareEasingSamples`. Type any CSS easing.

## Where the samples come from

| Source                                                | How the 65 samples are obtained                                                                      |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| CSS keywords, `cubic-bezier()`, `steps()`, `linear()` | Parsed and evaluated by MotionPR (matches Chromium to 1e-4); `samplesSource: exact`                  |
| CSS animations                                        | The uniform `animation-timing-function` of their keyframes; per-keyframe easings are kept separately |
| GSAP                                                  | GSAP's own ease function (`power3.out`, `back.out(1.7)`, `steps(5)`, CustomEase)                     |
| Anime.js                                              | Anime.js's own ease (`out(3)`, `inOutQuad`, springs), or a sampled custom function (`custom`)        |

An easing whose curve cannot be derived is compared by name only: a different name is reported
as `uncertain` (_curves cannot be compared numerically_), never as a regression.

## The metrics

`compareEasingSamples(baseline, candidate)` returns:

| Metric                                    | Meaning                                                             |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `equivalent`                              | Max deviation below 1e-4: the same curve, whatever its spelling     |
| `maxDeviation`                            | Largest absolute difference in output progress                      |
| `maxDeviationAt`                          | The input progress (0..1) where it occurs                           |
| `meanDeviation`                           | Mean absolute difference: the area between the curves, approximated |
| `checkpoints`                             | Signed difference at 25%, 50% and 75% input                         |
| `baselineOvershoot`, `candidateOvershoot` | Whether a curve leaves the 0..1 range                               |

## Severity

| Condition                                                                    | Severity                 |
| ---------------------------------------------------------------------------- | ------------------------ |
| Max deviation at or below `comparison.easing.tolerance` (0.005)              | no change                |
| Max deviation at or above `comparison.easing.warnDeviation` (0.05)           | warning                  |
| Overshoot appears or disappears                                              | warning                  |
| The easing moved between effect level and keyframe segments                  | warning                  |
| Per-keyframe easings changed (CSS animations with different segment easings) | warning                  |
| Anything else between the two thresholds                                     | info                     |
| No curve on one side (an easing that cannot be evaluated)                    | uncertain, `unsupported` |

The change message names both easings and the measurement:
`Easing cubic-bezier(0.16, 1, 0.3, 1) → ease-in-out (max deviation 70% of progress at 27% time)`,
and, when it applies, `now overshoots` or `no longer overshoots`. Promote easing changes with
`comparison.severity: { easing: "critical" }`; see [Severity](severity.md).

## Real examples from the demo app

| Scenario   | Baseline                        | Candidate                           | Reported                                 |
| ---------- | ------------------------------- | ----------------------------------- | ---------------------------------------- |
| navigation | `cubic-bezier(0.16, 1, 0.3, 1)` | `ease-in-out`                       | warning, max deviation 70% at 27% time   |
| modal      | `cubic-bezier(0.16, 1, 0.3, 1)` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | warning, 12% (the candidate overshoots)  |
| gsap-intro | `power3.out`                    | `back.out(1.7)`                     | warning, 16% at 41% time; now overshoots |

## Use it from code

```ts
import { compareEasingSamples, sampleEasing } from "@erenthedeveloper0/motionpr";

const ease = sampleEasing("ease");
compareEasingSamples(ease, sampleEasing("cubic-bezier(0.25, 0.1, 0.25, 1)")).equivalent; // true

const change = compareEasingSamples(
  sampleEasing("cubic-bezier(0.16, 1, 0.3, 1)"),
  sampleEasing("ease-in-out"),
);
change.maxDeviation; // 0.6975, at maxDeviationAt 0.2656: the navigation panel's "70% at 27%"
```
