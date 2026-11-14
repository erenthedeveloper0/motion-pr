---
title: Baselines
description: The approved capture every run is compared against — where it lives, how it is approved, and how to keep it small.
---

# Baselines

The **baseline** is an approved capture that later runs are compared against. It lives in
`.motionpr/baseline/` (configurable with `output.baseline`) and is meant to be committed.

```text
.motionpr/
├── baseline/          ← approved capture (commit this)
│   ├── capture.json
│   └── assets/        ← content-addressed PNG frames and screenshots
├── captures/          ← recent captures (git-ignored, the newest `output.keep` are kept)
│   ├── 20261113-130103-aae2/
│   └── LATEST
├── comparison/        ← last comparison.json + diff images (git-ignored)
└── report/            ← generated HTML report (git-ignored)
```

## Approving

```bash
npx motionpr baseline accept                 # approve the latest capture
npx motionpr baseline accept --from <id>      # a specific capture id from .motionpr/captures
npx motionpr baseline accept --from ./artifact/capture   # a directory, e.g. a downloaded CI artifact
```

`baseline accept`:

- prints the capture being approved and the baseline it replaces;
- asks for confirmation when a baseline exists (in non-interactive shells it refuses unless you
  pass `--yes`, so a script can never overwrite a baseline by accident);
- refuses captures with failed scenarios unless you pass `--allow-failed`;
- replaces the directory atomically (copy to a staging directory, then rename).

`npx motionpr baseline status` shows the current baseline.

## When to update

Update the baseline when a motion change is **intended**: review the report, then accept and commit
the new baseline in the same pull request as the code change. Reviewers see the baseline diff
next to the code that caused it.

## Where to capture the baseline

Animation data (timing, easing, keyframes, transforms) is platform-independent. Pixels are not:
fonts render differently on macOS, Windows and Linux. MotionPR keeps these apart: visual changes
are warnings by default, and the comparison warns when baseline and candidate come from different
platforms or browser versions.

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
