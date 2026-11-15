---
title: Support matrix
description: Browsers, runtimes, engines and platforms MotionPR is tested with, and how many real-browser tests cover each.
---

# Support matrix

| Area                                | Supported                                          | How it is verified                                                                           |
| ----------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Node.js                             | 22.12 or newer                                     | `engines`; `doctor` checks it. Tests run on Node.js 24 (and the package on 22)               |
| Chromium                            | Chrome for Testing 158.0.8127.18 (Playwright 1.65) | Every browser test                                                                           |
| Firefox                             | Firefox 159.0, Playwright build 1572               | Every browser test except the multi-engine CLI runs                                          |
| WebKit                              | WebKit 27.2, Playwright build 2388                 | Every browser test except the multi-engine CLI runs                                          |
| Several engines in one project      | Verified                                           | CLI runs with `--browser all`, per-engine baselines, cross-browser comparison, 0.1 migration |
| Native CSS transitions / animations | Verified in all three engines                      | Capture engine and engine edge-case tests, demo app                                          |
| Web Animations API                  | Verified in all three engines                      | Reversed, cancelled, finished, delayed, keyframed, reused                                    |
| CSS scroll-driven animations        | Metadata only                                      | Progress follows scroll                                                                      |
| GSAP                                | Verified with 3.15.1 (range `>=3.12 <4`)           | 10 browser tests per engine; ScrollTrigger: metadata + live progress                         |
| Anime.js                            | Verified with 4.5.0 (range `>=4 <5`)               | 22 browser tests per engine, unit tests; v3 is not supported                                 |
| Lenis                               | Verified with 1.3.27 (range `>=1.1 <2`)            | 15 browser tests per engine; scroll motion, never replayed                                   |
| macOS                               | Verified (arm64), all three engines                | Development machine                                                                          |
| Linux                               | Covered by the repository's CI, all three engines  | `ubuntu-latest`, one job per engine                                                          |
| Windows                             | Not covered                                        | Paths are handled in code; no CI job yet                                                     |

## Browser tests per engine

The browser suites run once per engine (`MOTIONPR_TEST_BROWSER=firefox pnpm test:integration`);
CI runs Chromium in the main job and Firefox and WebKit in a matrix.

| Suite                                                                                  | Chromium | Firefox | WebKit |
| -------------------------------------------------------------------------------------- | -------: | ------: | -----: |
| Capture engine                                                                         |       14 |      14 |     14 |
| Engine edge cases (transitions, animations, WAAPI, latency, scroll start, determinism) |       15 |      15 |     15 |
| GSAP adapter                                                                           |       10 |      10 |     10 |
| Anime.js adapter                                                                       |       22 |      22 |     22 |
| Lenis adapter                                                                          |       15 |      15 |     15 |
| CLI end to end                                                                         |       15 |      12 |     12 |
| Demo app: every intended change, nothing else (e2e)                                    |       15 |      15 |     15 |

The three CLI tests that only Chromium's run lists start all three engines in one project; they
run once, in the main CI job, where every engine is installed.

"Verified" means covered by automated tests against a real browser in this repository. Outside a
tested range, an adapter reports the engine as _untested_ and keeps running. How the engines
differ, and what is not supported, is in [Browser support](../browsers/support.md).
