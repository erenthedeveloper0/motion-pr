---
title: Capture serialization
description: The capture.json and comparison.json formats, schema versions, migrations and validation of untrusted files.
---

# Capture serialization

A capture is a directory with `capture.json` and `assets/` (content-addressed PNG/JPEG frames
and screenshots, `assets/<sha256 prefix>.png`). The JSON is validated with the schemas in
`@motionpr/core` (`captureBundleSchema`, `comparisonResultSchema`) whenever it is read.

**Current versions:** capture schema **2**, comparison schema **2**, report schema 1.

```text
CaptureBundle
├─ environment, settings, configHash
├─ assets: { "<id>.png": { file: "assets/<id>.png", width, height, bytes } }
└─ scenarios[]: ScenarioResult
   ├─ adapters[]: AdapterStatus        (id, engineVersion, supportedRange, versionStatus, status, capabilities, diagnostics)
   ├─ steps[], diagnostics[]
   └─ checkpoints[]: Checkpoint
      ├─ window (origin, trigger, latency, end, capped)
      ├─ animations[]: AnimationRecord (type, source, driver, provenance, parent, timing,
      │                                  properties, samples[]: FrameSample, progressTrace, …)
      ├─ timelines[]: TimelineRecord   (duration, iterations, labels, children, …)
      ├─ scrollMotion[]: ScrollMotionRecord (axis, wrapper, config, samples[]: ScrollSample, …)
      ├─ correlations[]: { scroll, animation, kind: "scroll-linked" | "overlap", overlapMs }
      └─ frames[], screenshot
```

Field-level documentation lives in the schema source (`packages/core/src/schema/*.ts`), where
every field has a comment.

## Comparison result

`comparison.json` (`kind: "motionpr-comparison"`, schema version 2):

```text
ComparisonResult
├─ baseline, candidate        capture refs: id, createdAt, motionprVersion, browser, platform, configHash
├─ failOn, failOnUncertain
├─ summary                    status (passed | failed), highestSeverity, counts per severity,
│                             scenario and animation counts
├─ scenarios[]: ScenarioComparison
│  └─ checkpoints[]: CheckpointComparison
│     ├─ animations[]         AnimationComparison: status, match, changes[], easing analysis
│     ├─ stagger[], timelines[], scroll[]
│     ├─ visual               pixelmatch result of the settled screenshots
│     ├─ frameDivergence[]    per-frame pixel ratio
│     └─ latency
├─ differences[]              flat, report-friendly list: severity, category, title, detail, source
└─ assets, diagnostics
```

Each `Change` carries `kind`, `before`, `after`, `delta`, `unit`, `measurement`, `severity`,
`message` and the `rule` that graded it. `differences` is the same information flattened for
lists, filters and the Markdown summary; it is what `--json` consumers usually read.

## Provenance

Records carry `provenance`, a map from field name to how the value was obtained: `declared`
(public API or parameters), `observed` (measured while the page ran), `inferred` (derived from
other values) or `unavailable` (not public; MotionPR did not guess).

## Versioning and migrations

Readers accept older versions and migrate them in memory (`CAPTURE_MIGRATIONS`,
`COMPARISON_MIGRATIONS`). Version 1 → 2 adds `driver`, `provenance`, `parent` and
`progressTrace` to animations, `timelines`, `scrollMotion` and `correlations` to checkpoints and
`adapters` to scenarios; v1 files contain no such data, so the new collections start empty.
Files newer than the installed MotionPR are rejected with an actionable error.

## Untrusted input

Captures may come from CI artifacts of pull requests. Asset ids and paths are validated
(`^[A-Za-z0-9_-]+\.(png|jpe?g)$`, `assets/<id>`), so a capture cannot make MotionPR read or write
outside its directory. Reports embed data as inert JSON (`<` escaped), never as code.
