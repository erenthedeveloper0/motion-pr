---
title: Capture data model
description: Captures, scenarios, checkpoints and the three kinds of motion record, with a real example.
---

# Capture data model

A capture is a directory: `capture.json` plus `assets/`, a folder of PNG (or JPEG) frames and
screenshots named by content hash. The JSON is validated against the schemas in `@motionpr/core`
whenever it is read; the field-level reference is in
[Capture serialization](../advanced/capture-serialization.md).

```text
CaptureBundle                    schemaVersion 2, motionprVersion, environment, settings, configHash
└─ scenarios[]                   one per scenario × viewport: status, steps, adapters, diagnostics
   └─ checkpoints[]              one per capture/screenshot step, matched across captures by label
      ├─ window                  origin, trigger, latency, end, capped
      ├─ animations[]            AnimationRecord     time → value
      ├─ timelines[]             TimelineRecord      GSAP / Anime.js sequencing
      ├─ scrollMotion[]          ScrollMotionRecord  time → position
      ├─ correlations[]          scroll ↔ animation  scroll-linked | overlap
      ├─ frames[]                filmstrip: { time, asset }
      └─ screenshot              settled state, used for visual comparison
```

## Environment

Every capture records where it was taken, as the browser and the system report it at runtime
(never copied from the configuration). This is the `environment` of a real Firefox capture of the
demo app:

```json
{
  "browser": {
    "name": "firefox",
    "version": "159.0",
    "headless": true,
    "channel": null,
    "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:159.0) Gecko/20100101 Firefox/159.0"
  },
  "platform": "darwin",
  "arch": "arm64",
  "osRelease": "25.5.0",
  "node": "v24.21.0",
  "playwright": "1.65.0",
  "ci": false,
  "capabilities": {
    "documentGetAnimations": true,
    "elementAnimate": true,
    "cssTransitionInterface": true,
    "cssAnimationInterface": true,
    "transitionRunEvent": true,
    "pseudoElementEffects": true,
    "scrollTimeline": true,
    "viewTimeline": true,
    "timerResolutionMs": 1,
    "frameIntervalMs": 16.66,
    "devicePixelRatio": 1,
    "prefersReducedMotion": false
  }
}
```

`capabilities` are measured in the first captured page: the Web Animations features MotionPR
relies on, the smallest step of `performance.now()` and the median frame interval. They explain
how precisely live observations could be made in that engine (see
[Browser support](../browsers/support.md#how-the-engines-differ)); captures that lack a required
feature get a `BROWSER_API_MISSING` error. `settings` holds the colour scheme, locale, time zone,
reduced-motion setting and sampling options; each scenario holds its viewport and device scale
factor. Captures written before 0.2 have `capabilities: null`.

## AnimationRecord

One element animated over time. This is the record of the menu from
[First capture](../getting-started/first-capture.md), shortened (24 samples become one):

```json
{
  "id": "motionpr-id:menu::css-transition::transform",
  "type": "css-transition",
  "source": "native",
  "driver": "css",
  "name": "transform",
  "element": {
    "key": "motionpr-id:menu",
    "method": "motionpr-id",
    "confidence": "high",
    "selector": "[data-motionpr-id=\"menu\"]",
    "tag": "nav"
  },
  "startTime": 0,
  "timing": {
    "duration": 300,
    "delay": 0,
    "iterations": 1,
    "direction": "normal",
    "fill": "backwards",
    "playbackRate": 1,
    "easing": {
      "value": "cubic-bezier(0.16, 1, 0.3, 1)",
      "kind": "css",
      "scope": "effect",
      "samples": ["… 65 values …"]
    }
  },
  "properties": [{ "property": "transform", "from": "translateX(-100%)", "to": "translateX(0px)" }],
  "samples": [
    {
      "windowTime": 65.217,
      "progress": 0.2174,
      "iterationProgress": 0.780739,
      "values": { "transform": "matrix(1, 0, 0, 1, -61.3931, 0)" },
      "numeric": {
        "translateX": -61.3931,
        "translateY": 0,
        "scaleX": 1,
        "scaleY": 1,
        "rotate": 0,
        "opacity": 1
      },
      "box": { "x": -61.393, "y": 0, "width": 280, "height": 900 }
    }
  ],
  "completeness": { "status": "complete", "reasons": [] }
}
```

| Field                   | Meaning                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `id`                    | `<element key>::<type>::<name>`: the matching key ([identification](animation-identification.md))    |
| `type`                  | `css-transition`, `css-animation`, `web-animation`, `gsap`, `animejs`, `custom`                      |
| `source` / `driver`     | Who observed it (`native`, `gsap`, `animejs`, …) and what renders it (`css`, `waapi`, `javascript`)  |
| `startTime`             | Local time zero relative to the window origin, in ms (frame-quantized)                               |
| `timing.easing.samples` | The eased output at 65 evenly spaced inputs: the curve itself, for any easing an engine can evaluate |
| `samples[]`             | Computed values, decomposed transform and border box at `capture.samples` times during replay        |
| `completeness`          | `complete`, `partial` or `metadata-only`, with reasons. Partial data is compared as `incomplete`     |
| `provenance`            | Per field: `declared`, `observed`, `inferred` or `unavailable` (adapters fill this in)               |
| `parent`                | The `TimelineRecord` this animation belongs to                                                       |
| `progressTrace`         | Live progress of scroll-linked animations (GSAP ScrollTrigger), window-relative                      |

## TimelineRecord

A GSAP or Anime.js timeline: `duration`, `iterations`, `direction`, `playbackRate`, `progress`,
`labels` (name and time in ms) and `children` (ids of its animation records, in start order).
Comparisons report timeline duration and repeat changes, labels that moved, appeared or
disappeared, and reordered label sequences.

## ScrollMotionRecord

How one scroller moved: an id (`lenis:window:vertical`), the `source` (`lenis` or `native`), the
axis, the wrapper element (null for the document), the engine options that shape the motion
(`lerp`, `duration`, …; scalars only), and samples of `actualScroll`, `animatedScroll`,
`targetScroll`, `progress`, `velocity`, `direction`, `isScrolling` and `isStopped` on the window
clock. It is never replayed; see [Lenis](../integrations/lenis.md).

## Correlations

When an animation runs while a scroller moves, the checkpoint lists a correlation:
`scroll-linked` when the engine declares that the animation follows scroll (CSS scroll timelines,
ScrollTrigger), `overlap` with the overlap in ms otherwise. An overlap is an observation in time,
not a claim that the scroll caused the animation.

## Assets

Frames and screenshots are content-addressed (`assets/<hash prefix>.png`), so a frame in which
nothing moved is stored once however often it occurs. Asset ids and paths are validated when a
capture is read, so a capture downloaded from CI cannot point outside its directory.
