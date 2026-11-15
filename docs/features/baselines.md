---
title: Baselines
description: The approved capture every run is compared against — where it lives, how it is approved, and how to keep it small.
---

# Baselines

The **baseline** is an approved capture that later runs are compared against. Every browser
engine has its own: they live in `.motionpr/baseline/<browser>/` (the parent is configurable with
`output.baseline`) and are meant to be committed.

```text
.motionpr/
├── baseline/              ← approved captures (commit this)
│   ├── chromium/
│   │   ├── capture.json
│   │   └── assets/        ← content-addressed PNG frames and screenshots
│   ├── firefox/
│   └── webkit/
├── captures/              ← recent captures (git-ignored, the newest `output.keep` per engine)
│   ├── chromium/
│   │   ├── 20261113-130103-aae2/
│   │   └── LATEST
│   └── firefox/ …
├── comparison/<browser>/  ← last comparison.json + diff images (git-ignored)
└── report/                ← generated HTML reports (git-ignored)
    ├── index.html         ← every engine's report, with its result
    └── <browser>/index.html
```

## One baseline per engine

Engines render, lay out and schedule motion differently, so a capture is only compared with a
baseline of the same engine. A Firefox run never reads the Chromium baseline; without a Firefox
baseline it writes a capture-only report and tells you how to approve one. Approving the Firefox
baseline never changes the Chromium one. To compare two engines on purpose, see
[Cross-browser testing](../browsers/cross-browser-testing.md#comparing-two-engines).

Baselines from MotionPR 0.1 sit directly in `.motionpr/baseline/` (`capture.json`, `assets/`).
They are still read, as the baseline of the engine that took them (always Chromium), and
`npx motionpr baseline migrate` (or the next `baseline accept`) moves them into
`baseline/chromium/`.

## Approving

```bash
npx motionpr baseline accept                 # approve the latest capture
npx motionpr baseline accept --browser firefox   # the latest Firefox capture
npx motionpr baseline accept --browser all       # the latest capture of every engine
npx motionpr baseline accept --from <id>      # a specific capture id from .motionpr/captures
npx motionpr baseline accept --from ./artifact/capture   # a directory, e.g. a downloaded CI artifact
```

`baseline accept`:

- prints the capture being approved and the baseline it replaces;
- asks for confirmation when a baseline exists (in non-interactive shells it refuses unless you
  pass `--yes`, so a script can never overwrite a baseline by accident);
- refuses captures with failed scenarios unless you pass `--allow-failed`;
- replaces the directory atomically (copy to a staging directory, then rename).

`npx motionpr baseline status` shows every engine's baseline. A capture becomes the baseline of
the engine it was taken with (`environment.browser.name`), whatever its directory is called.

## When to update

Update the baseline when a motion change is **intended**: review the report, then accept and commit
the new baseline in the same pull request as the code change. Reviewers see the baseline diff
next to the code that caused it.

## Where to capture the baseline

Animation data (timing, easing, keyframes, transforms) is platform-independent. Pixels are not:
fonts render differently on macOS, Windows and Linux, and differently in each engine. MotionPR
keeps these apart: visual changes are warnings by default, baselines are per engine, and the
comparison warns when baseline and candidate come from different platforms or browser versions.

For the least noise, capture the baseline where CI runs: upload the capture from CI as an
artifact, download it, and approve that directory (`baseline accept --from <dir>`). The steps are
in [Baseline management](../ci/baseline-management.md).

## Size

Captures store frames as PNG, deduplicated by content (frames where nothing moves are stored once).
A typical interaction checkpoint is 10–40 frames of 40–100 KB. To keep baselines small:

- lower `capture.frames.fps` (default 30) or `capture.frames.maxFrames` (default 90);
- set `capture.frames.format: "jpeg"` (smaller, but frame-by-frame pixel divergence then needs PNG
  and is skipped);
- disable frames for checkpoints where timing data is enough: `{ type: "capture", label: "x", frames: false }`.
