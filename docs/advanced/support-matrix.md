---
title: Support matrix
description: Browsers, runtimes, engines and platforms MotionPR is tested with.
---

# Support matrix

| Area                                | Supported                                | How it is verified                                           |
| ----------------------------------- | ---------------------------------------- | ------------------------------------------------------------ |
| Node.js                             | 22.12 or newer                           | `engines`; `doctor` checks it. Tests run on Node.js 24       |
| Browser                             | Chromium (Playwright 1.65)               | Every browser test. Firefox and WebKit are not supported yet |
| Native CSS transitions / animations | Verified                                 | Capture engine browser tests, demo app                       |
| Web Animations API                  | Verified                                 | Including `animate()` and reused animations                  |
| CSS scroll-driven animations        | Metadata only                            | Progress follows scroll                                      |
| GSAP                                | Verified with 3.15.1 (range `>=3.12 <4`) | 10 browser tests; ScrollTrigger: metadata + live progress    |
| Anime.js                            | Verified with 4.5.0 (range `>=4 <5`)     | 22 browser tests, 51 unit tests; v3 is not supported         |
| Lenis                               | Verified with 1.3.27 (range `>=1.1 <2`)  | 15 browser tests; scroll motion, never replayed              |
| macOS                               | Verified (arm64)                         | Development machine                                          |
| Linux                               | Covered by the repository's CI           | `ubuntu-latest`                                              |
| Windows                             | Not covered                              | Paths are handled in code; no CI job yet                     |

"Verified" means covered by automated tests against a real browser in this repository. Outside a
tested range, an adapter reports the engine as _untested_ and keeps running.
