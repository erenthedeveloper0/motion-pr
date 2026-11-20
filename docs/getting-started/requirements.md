---
title: Requirements
description: Node.js, operating systems, disk space and the app you want to test.
---

# Requirements

| Requirement      | Version                                          | Notes                                                                                                                         |
| ---------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Node.js          | 22.12 or newer                                   | `motionpr doctor` checks it. Development and CI of this repository use 24                                                     |
| Operating system | macOS, Linux, Windows                            | Linux machines need system libraries once: `motionpr install --with-deps`                                                     |
| Browser          | Chromium, Firefox or WebKit from Playwright 1.65 | Downloaded by `motionpr install`; Chromium is the default                                                                     |
| Disk space       | 300–600 MB per engine                            | Measured on macOS arm64: Chromium 580 MB (with its headless shell), Firefox 300 MB, WebKit 320 MB. Captures add a few MB each |
| Your app         | anything that runs in a browser                  | MotionPR drives a real page over HTTP(S); it can start your dev server                                                        |

MotionPR runs entirely on your machine or CI runner. It has no account, no backend and no
telemetry.

## Engines

The adapters are optional. A project with only CSS transitions, CSS animations or Web
Animations installs nothing extra.

| Engine   | Supported range | Verified with | Entry point                           |
| -------- | --------------- | ------------- | ------------------------------------- |
| GSAP     | `>=3.12 <4`     | 3.15.1        | `@erenthedeveloper0/motionpr/gsap`    |
| Anime.js | `>=4 <5`        | 4.5.0         | `@erenthedeveloper0/motionpr/animejs` |
| Lenis    | `>=1.1 <2`      | 1.3.27        | `@erenthedeveloper0/motionpr/lenis`   |

"Verified" means covered by automated tests against a real browser in this repository. Versions
inside the range but other than the verified one are expected to work; versions outside it are
reported as _untested_ by `motionpr doctor` and in captures, and MotionPR still runs.

## What has been tested where

This release was verified on macOS (arm64) with Node.js 24 and Playwright 1.65's Chromium,
Firefox and WebKit. The repository's CI runs the same browser suites on Linux, once per engine.
On Windows, CI runs the unit tests, the Chromium browser suites, the demo app and the packaged
CLI; Firefox and WebKit are not covered there. See the
[support matrix](../advanced/support-matrix.md) and [Browser support](../browsers/support.md).

Next: [Installation](installation.md).
