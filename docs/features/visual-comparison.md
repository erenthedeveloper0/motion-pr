---
title: Visual comparison
description: Pixel comparison of settled states and per-frame divergence of filmstrips — and why pixels are never critical by default.
---

# Visual comparison

Animation data says how things moved. Pixels say what the user saw at the end, and when during
the motion the two versions looked different. MotionPR uses both, and keeps them apart.

## Settled screenshots

Every `capture` checkpoint takes a PNG of the settled state at the end of its window (turn it off
per checkpoint with `screenshot: false`). `screenshot` checkpoints take one without animation
data. The two versions are compared with [pixelmatch](https://github.com/mapbox/pixelmatch):

| Status             | Meaning                                                              |
| ------------------ | -------------------------------------------------------------------- |
| `identical`        | No differing pixel (or the very same asset)                          |
| `within-threshold` | Some pixels differ, at most `visual.maxDiffRatio` of them (0.2%)     |
| `changed`          | More than `visual.maxDiffRatio` differ: a `visual` difference        |
| `not-comparable`   | A screenshot is missing on one side, unreadable, or the sizes differ |
| `skipped`          | `comparison.visual.enabled` is `false`                               |

A checkpoint with differing pixels gets a diff image: differing pixels in peach (blue where the
candidate is darker), anti-aliased pixels in violet, the rest faded. The report shows it in its
_Pixel diff_ mode with the counts and the threshold.

| Option                                  | Default | Effect                                                 |
| --------------------------------------- | ------- | ------------------------------------------------------ |
| `comparison.visual.pixelThreshold`      | `0.1`   | Per-pixel colour threshold (0 strict … 1 lenient)      |
| `comparison.visual.maxDiffRatio`        | `0.002` | Share of differing pixels above which it is `changed`  |
| `comparison.visual.includeAntialiasing` | `false` | Count anti-aliased pixels as differences               |
| `comparison.visual.ignoreRegions`       | `[]`    | Viewport rectangles `{ x, y, width, height }` excluded |
| `comparison.visual.frameDivergence`     | `true`  | Compare filmstrip frames pairwise                      |

## Frame divergence

With PNG frames on both sides, MotionPR compares time-aligned filmstrip frames and stores the
share of differing pixels per frame. The report draws it above the timeline as the **frame
divergence** strip: you can see when the versions start to look different, and when they meet
again. JPEG frames (`capture.frames.format: "jpeg"`) skip this, because lossy compression would
make every frame differ.

## Why pixels are a warning

Fonts and anti-aliasing render differently on macOS, Windows and Linux, and between browser
builds. A settled screenshot that differs by a few hundred pixels is often the platform, not your
change. So the `visual` rule is a **warning** by default and never critical, while timing and
easing differences, which do not depend on rendering, can be. When baseline and candidate come
from different platforms or browser versions, the comparison adds `PLATFORM_DIFFERS` or
`BROWSER_VERSION_DIFFERS`.

To keep visual comparison useful:

1. Capture the baseline where CI runs ([Baseline management](../ci/baseline-management.md)).
2. Mask content that changes on its own: `privacy.maskSelectors` and `ignore.selectors` for live
   clocks and carousels, `visual.ignoreRegions` for fixed areas.
3. Raise `visual.maxDiffRatio` a little, or turn the rule off: `comparison.severity: { visual: "off" }`.

Inputs, textareas, selects and contenteditable regions are masked in every screenshot and frame by
default (`privacy.maskInputs`). See [Privacy](../configuration/privacy.md).
