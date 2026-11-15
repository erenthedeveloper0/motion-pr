---
title: Baseline management
description: Approve intended changes, capture baselines where CI runs, and keep baselines small and reviewable.
---

# Baseline management

The baseline is code: it lives in the repository, changes in pull requests, and is reviewed.

## Approving a change

```bash
npx motionpr baseline accept           # the latest capture (asks before replacing)
npx motionpr baseline accept --yes     # in scripts and non-interactive shells
git add .motionpr/baseline
```

`baseline accept` refuses captures with failed scenarios unless you pass `--allow-failed`, and
in a non-interactive shell refuses to replace a baseline without `--yes` (exit `2`).

## Capturing the baseline where CI runs

Animation timing, easing and keyframes are platform-independent. Pixels are not: macOS, Windows
and Linux render fonts differently. When you rely on visual comparison, approve a capture made on
the CI runner itself. The generated workflow uploads only the report, so add an upload of the
capture:

```yaml
- name: Upload MotionPR capture
  if: ${{ always() }}
  uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
  with:
    name: motionpr-capture
    path: .motionpr/captures
    retention-days: 7
```

Then download the `motionpr-capture` artifact from the run, unzip it, and approve the capture
directory it contains (the one with `capture.json`, under its engine's folder):

```bash
npx motionpr baseline accept --from ./motionpr-capture/chromium/20261113-215403-2778 --yes
git add .motionpr/baseline && git commit -m "Update motion baseline from CI"
```

The capture's engine decides which baseline it becomes, so approving a Firefox capture from CI
updates `.motionpr/baseline/firefox/` and nothing else. With a matrix of engines, approve each
engine's capture from its own artifact.

The comparison warns (`PLATFORM_DIFFERS`, `BROWSER_VERSION_DIFFERS`) whenever baseline and
candidate come from different platforms or browser builds, so a mismatch never goes unnoticed.
The alternative that avoids the question entirely is
[comparing against the base branch](pull-request-workflow.md#strategy-b-compare-against-the-base-branch).

## Size

Frames are PNGs, deduplicated by content. A typical interaction checkpoint stores 10–40 frames.
To keep baselines small:

- lower `capture.frames.fps` (30) or `capture.frames.maxFrames` (90);
- use `capture.frames.format: "jpeg"` (smaller; frame divergence then needs PNG and is skipped);
- disable frames where timing data is enough: `{ type: "capture", label: "x", frames: false }`.

Consider Git LFS for `.motionpr/baseline/*/assets/` in repositories with many scenarios. Each
engine adds its own baseline; capture only the engines your users need.

## Several baselines

`output.baseline` is a path relative to `output.directory`, so environments can keep separate
baselines, for example one for reduced motion:

```ts
environments: {
  reduced: { browser: { reducedMotion: "reduce" }, output: { baseline: "baseline-reduced" } },
},
```

See [Baselines](../features/baselines.md) for the directory layout.
