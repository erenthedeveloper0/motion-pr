---
title: WebKit
description: Set up and run MotionPR with WebKit, the engine behind Safari — installation, platform requirements, the 30 fps headless frame rate and troubleshooting.
---

# WebKit

WebKit is the engine behind Safari. MotionPR captures with Playwright's WebKit build (WebKit
27.2, build 2388, with Playwright 1.65). Native CSS and Web Animations, the GSAP, Anime.js and
Lenis adapters, and the CLI are tested in it.

It is **not Safari**: Playwright's WebKit is built from the same engine source, without Safari's
own browser layer. It is the closest automatable stand-in, and MotionPR does not drive Safari.

## Setup

```bash
npx motionpr install webkit
npx motionpr install webkit --with-deps     # fresh Linux machine or CI runner (needs root)
npx motionpr doctor --browser webkit
npx motionpr run --browser webkit
```

Approve the first WebKit capture with `npx motionpr baseline accept --browser webkit` and commit
`.motionpr/baseline/webkit`.

## Configuration

```ts
// motionpr.config.ts
browser: { name: "webkit" },          // or keep chromium and pass --browser webkit
```

| Option                   | Applies to WebKit when        |
| ------------------------ | ----------------------------- |
| `browser.executablePath` | `browser.name` is `webkit`    |
| `browser.args`           | `browser.name` is `webkit`    |
| `browser.channel`        | never: WebKit has no channels |

## Platform requirements

- **macOS:** Playwright publishes WebKit builds for recent macOS releases (this version
  downloads a macOS 26 build on Apple silicon). On an older macOS, `install webkit` may not find a
  build; check Playwright's system requirements for its version.
- **Linux:** WebKit needs more system libraries than the other engines (GStreamer, libsoup,
  WOFF2, Wayland and others). `--with-deps` installs them with `apt` on the distributions
  Playwright supports (Ubuntu and Debian releases); elsewhere, use the official Playwright Docker
  images. `--headed` needs a display server.
- **Windows:** Playwright's WebKit runs on Windows, but it is the least mature build and MotionPR's
  CI does not cover Windows.

## Frame rate and timers

Headless WebKit on macOS renders at **30 fps** (one frame every 33 ms), and reports time in 1 ms
steps. Replayed samples and filmstrip frames are unaffected. Live observations are as coarse as a
frame: start offsets, trigger latency and scroll samples. WebKit captures carry
`LOW_FRAME_RATE` (info) and `COARSE_TIMERS` notes that say so, and start offsets are compared with
a two-frame tolerance (`comparison.timing.startToleranceMs`, 34 ms) by default. If you need
tighter start-offset checks, keep them for Chromium and Firefox.

## Troubleshooting

| Message                                                           | Fix                                                                                        |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `WebKit for MotionPR is not installed.`                           | `npx motionpr install webkit`                                                              |
| `WebKit cannot start: the system libraries it needs are missing.` | `npx motionpr install webkit --with-deps` on Ubuntu/Debian, or the Playwright Docker image |
| `install webkit` finds no build for this OS                       | Update the OS, or run WebKit in CI on Ubuntu                                               |
| `No approved webkit baseline.`                                    | `npx motionpr baseline accept --browser webkit`                                            |

## Known differences

- **30 fps headless** (macOS): see above. A WebKit scroll is sampled about half as often as in
  Chromium; peak velocities are derived between moving samples at least 12 ms apart, so they
  stay comparable within WebKit and close to the other engines'.
- **Easing evaluation:** WebKit's `cubic-bezier()` solver lands up to about 0.02 px from
  Chromium's near the endpoints; within WebKit it is deterministic.
- **Sample serialization:** computed `matrix()` values have six decimals instead of Chromium's
  six significant digits. Trajectories are compared as decomposed numbers (`translateX`,
  `scaleX`, …), not as strings.

See [Browser support](support.md).
