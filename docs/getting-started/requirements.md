---
title: Requirements
description: Node.js, operating systems, disk space and the app you want to test.
---

# Requirements

| Requirement      | Version                         | Notes                                                                     |
| ---------------- | ------------------------------- | ------------------------------------------------------------------------- |
| Node.js          | 22.12 or newer                  | `motionpr doctor` checks it. Development and CI of this repository use 24 |
| Operating system | macOS, Linux, Windows           | Linux machines need system libraries once: `motionpr install --with-deps` |
| Browser          | Chromium from Playwright 1.65   | Downloaded by `motionpr install` (about 150 MB), or an installed Chrome   |
| Disk space       | about 300 MB                    | Mostly Chromium. Captures add a few MB each (PNG frames, deduplicated)    |
| Your app         | anything that runs in a browser | MotionPR drives a real page over HTTP(S); it can start your dev server    |

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

This release was verified on macOS (arm64) with Node.js 24 and Chromium from Playwright 1.65.
The repository's CI runs the same suites on Linux. Windows paths are handled in code but no CI job
runs on Windows yet. See the [support matrix](../advanced/support-matrix.md).

Next: [Installation](installation.md).
