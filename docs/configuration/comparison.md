---
title: Comparison thresholds
description: Every comparison option — tolerances, warning and critical thresholds, visual and scroll settings, severity overrides.
---

# Comparison thresholds

```ts
comparison: {
  failOn: "critical",                 // exit 1 at this severity or worse
  timing: { warnRelative: 0.2 },      // only change what you need; the rest keeps its default
  severity: { visual: "off" },        // per-rule overrides
},
```

What the thresholds mean, with examples, is explained in [Severity](../features/severity.md).

| Option                                      | Default      | Description                                                                                                     |
| ------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------- |
| `comparison.failOn`                         | `"critical"` | Exit 1 for differences at this severity or worse; `never` disables                                              |
| `comparison.failOnUncertain`                | `false`      | Also fail on uncertain differences                                                                              |
| `comparison.timing.toleranceMs`             | `1`          | Ignore declared duration/delay differences up to this                                                           |
| `comparison.timing.startToleranceMs`        | `34`         | Ignore start/latency differences up to this (≈2 frames)                                                         |
| `comparison.timing.warnRelative`            | `0.15`       | Warning when the relative change reaches this…                                                                  |
| `comparison.timing.warnAbsoluteMs`          | `50`         | …and the absolute change reaches this                                                                           |
| `comparison.timing.criticalRelative`        | `1`          | Critical from this relative change (1 = doubled/halved); `null` disables                                        |
| `comparison.easing.tolerance`               | `0.005`      | Curves closer than this are equivalent                                                                          |
| `comparison.easing.warnDeviation`           | `0.05`       | Max progress deviation at which an easing change is a warning                                                   |
| `comparison.properties.positionTolerancePx` | `2`          | Ignore position differences up to this                                                                          |
| `comparison.properties.warnPositionPx`      | `12`         | Position differences from this are warnings                                                                     |
| `comparison.properties.sizeTolerancePx`     | `2`          | Ignore size differences up to this                                                                              |
| `comparison.properties.opacityTolerance`    | `0.02`       | Ignore opacity differences up to this                                                                           |
| `comparison.properties.warnOpacity`         | `0.15`       | Opacity differences from this are warnings                                                                      |
| `comparison.visual.enabled`                 | `true`       | Pixel comparison of settled frames and filmstrips                                                               |
| `comparison.visual.pixelThreshold`          | `0.1`        | Per-pixel colour threshold for pixelmatch (0 strict … 1 lenient)                                                |
| `comparison.visual.maxDiffRatio`            | `0.002`      | Share of differing pixels above which a checkpoint is visually changed                                          |
| `comparison.visual.includeAntialiasing`     | `false`      | Count anti-aliased pixels                                                                                       |
| `comparison.visual.ignoreRegions`           | `[]`         | Viewport rectangles `{ x, y, width, height }` (CSS px) excluded                                                 |
| `comparison.visual.frameDivergence`         | `true`       | Chart per-frame pixel divergence (PNG frames)                                                                   |
| `comparison.uncertainOnLowConfidence`       | `true`       | Changes on elements matched by DOM position are `uncertain`                                                     |
| `comparison.severity`                       | `{}`         | Per-rule override: `critical`, `warning`, `info`, `uncertain` or `off`. See [Severity](../features/severity.md) |

Relative timing changes are measured against the baseline duration for durations, and against the
animation's duration for delays and start offsets.

### `comparison.scroll`

Scroll motion is compared by its own metrics (see [Lenis](../integrations/lenis.md#how-scroll-is-compared)).

| Key                                      | Default | Description                                               |
| ---------------------------------------- | ------- | --------------------------------------------------------- |
| `comparison.scroll.positionTolerancePx`  | `2`     | Start/end/target differences up to this are ignored       |
| `comparison.scroll.warnPositionPx`       | `24`    | Position differences at or above this are warnings        |
| `comparison.scroll.durationToleranceMs`  | `60`    | Movement-duration differences up to this are ignored      |
| `comparison.scroll.warnDurationRelative` | `0.2`   | Duration change is a warning above this ratio…            |
| `comparison.scroll.warnDurationMs`       | `120`   | …and above this many ms                                   |
| `comparison.scroll.curveTolerance`       | `0.04`  | Normalized progress-curve deviation treated as noise      |
| `comparison.scroll.warnCurveDeviation`   | `0.1`   | Curve deviation at or above this is a warning             |
| `comparison.scroll.velocityTolerance`    | `0.25`  | Relative peak-velocity change ignored (warning above 2×)  |
| `comparison.scroll.overshootTolerancePx` | `4`     | Overshoot differences ignored                             |
| `comparison.scroll.settleVelocity`       | `0.02`  | Velocity (px/ms) below which a scroller counts as settled |

Unreleased, after `0.3.0-alpha`: `positionTolerancePx` and `warnPositionPx` also apply to a moved
ScrollTrigger `start` or `end` ([GSAP: ScrollTrigger](../integrations/gsap.md#scrolltrigger)).
Scroll-linked progress at the same scroll position, graded with `curveTolerance` and
`warnCurveDeviation`, is then compared only for captures without those positions.

## Overrides

`comparison.severity` maps a rule name to `critical`, `warning`, `info`, `uncertain` or `off`.
Every rule name is listed in [Severity](../features/severity.md) and exported as
`SEVERITY_RULES`. An unknown rule name is a config error.

## From the command line

```bash
npx motionpr run --threshold warning     # override failOn for one run (alias -t)
```
