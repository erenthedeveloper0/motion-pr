---
title: Custom adapters
description: Teach MotionPR about another animation engine with the MotionprAdapter contract.
---

# Custom adapters

MotionPR sees CSS animations, CSS transitions and Web Animations natively, and GSAP, Anime.js and
Lenis through its first-party adapters. For any other engine (a custom tween library, a canvas
renderer) you can write an adapter. The first-party adapters in `packages/adapters/` are the
reference implementations: `gsap` for replayable tweens and timelines, `animejs` for
instrumenting an engine at creation time, `lenis` for scroll motion.

**Status:** the adapter interface is versioned (`PROTOCOL_VERSION = 1`) but still alpha; it may
change before 1.0.

## Interface

An adapter is an object that implements `MotionprAdapter` and registers itself with the in-page
agent:

```ts
import type { MotionprAdapter, AdapterAnimation } from "@erenthedeveloper0/motionpr";

const adapter: MotionprAdapter = {
  name: "my-engine",
  beginWindow() {
    /* a checkpoint just finished: forget animations that already ended */
  },
  collect(): AdapterAnimation[] {
    return runningAnimations.map((a) => ({
      id: a.id,
      name: a.label ?? null,
      target: a.element, // one entry per animated element
      startTime: a.startedAt, // performance.now() of local time zero (before delay)
      duration: a.duration, // ms per iteration
      delay: a.delay,
      iterations: a.repeat ?? 1, // Infinity for endless
      direction: "normal",
      playbackRate: 1,
      easing: { value: a.easeName, samples: sampleEase(a.ease) }, // 65 samples of 0..1
      properties: ["transform", "opacity"],
      playState: a.done ? "finished" : "running",
      samplable: true, // true if seek() can render it
    }));
  },
  isAnimating: () => runningAnimations.some((a) => !a.done),
  beginReplay() {
    /* pause everything and remember state */
  },
  seek(timeMs) {
    /* synchronously render every collected animation at performance-clock time timeMs */
  },
  endReplay() {
    /* restore the state saved in beginReplay */
  },
};

window.__MOTIONPR_AGENT__?.registerAdapter(adapter);
```

## Optional members

| Member                                            | Purpose                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------ |
| `version`, `supportedRange`                       | Engine version and the range you test against (shown in captures and `doctor`) |
| `capabilities`                                    | What the adapter can do, for diagnostics                                       |
| `beginWindow()`                                   | A checkpoint finished: forget animations that already ended                    |
| `isAnimating()`                                   | `true` while a tracked finite animation plays (used for settling)              |
| `beginReplay()`, `seek(t)`, `endReplay()`         | Deterministic replay; without them records are metadata only                   |
| `seekProgress(id, progress)`                      | Scroll-linked animations (since `0.3.0-alpha`), see below                      |
| `collectTimelines()`                              | `TimelineRecord`s: duration, labels, children                                  |
| `collectScroll()`, `scrollStates()`, `scrollTo()` | Scroll motion, settle detection, and the `scrollTo` step                       |
| `claims(animation)`                               | Mark native `Animation` objects your engine created, so they are recorded once |
| `diagnostics()`                                   | Health messages shown in captures and reports                                  |

The agent also has `unregisterAdapter(adapter)`; call it from your own `dispose()`.

### Scroll-linked animations

An animation whose progress follows scroll has no start time: report `startTime: null`,
`timeline: "scroll"` and its live progress as `progressTrace` (`{ t, progress }` on the
`performance.now()` clock, one entry per change). To have its values sampled (since
`0.3.0-alpha`), also report `scrollRange: { from, to }`, the part of that progress (0..1) during
which this animation is active, keep `samplable: true`, and implement
`seekProgress(id, progress)`: render animation `id` at that progress, synchronously and without
callbacks. The agent calls it between `beginReplay()` and `endReplay()`, after `seek()`, at evenly
spaced progress values between the lowest and highest progress in the trace. In `seek(t)`, render
it at the progress it showed at time `t`.

If your engine resolves where in the scroll the animation runs, report it as `scrollLink`
(since `0.4.0-alpha`; type `AdapterScrollLink`):

```ts
scrollLink: {
  start: 400, // scroll position (CSS px) where progress is 0
  end: 1300, // … where progress is 1
  axis: "vertical",
  scroller: null, // the scroll container element; null for the document
  scrub: 0, // 0: follows the scroll; ms of smoothing; null: plays once triggered
  toggleActions: null, // with scrub: null, e.g. "play none none reverse"
},
```

Comparisons then report a moved start or end, and changed `scrub` or `toggleActions`, from these
values instead of relating `progressTrace` to the recorded scroll, which depends on how each
run's scroll was scheduled. Without it, progress at the same scroll position is compared.

## Rules that keep captures trustworthy

- Report times on the `performance.now()` clock.
- `seek()` must render **synchronously** and must not fire your engine's callbacks.
- `endReplay()` must restore exactly what `beginReplay()` changed.
- If something cannot be observed precisely, add a sentence to `notes`; the record is then marked
  _partial_ in reports instead of looking complete.
- Do nothing when `window.__MOTIONPR_AGENT__` is absent (production).

## Loading the adapter

Either import it in your app (like `@erenthedeveloper0/motionpr/gsap`), or let MotionPR inject it before your page
scripts:

```ts
adapters: [{ name: "my-engine", script: "./motion/my-engine-adapter.js", required: true }],
```

`required: true` emits an error diagnostic if the adapter did not register in a captured page.
