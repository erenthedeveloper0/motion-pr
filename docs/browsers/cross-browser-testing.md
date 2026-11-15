---
title: Cross-browser testing
description: Run one engine or several, keep a baseline per engine, read multi-browser results, compare two engines on purpose, and run it all in CI.
---

# Cross-browser testing

Motion that is right in Chromium can be wrong in Safari or Firefox: a missing feature takes a
fallback path, a transition reverses differently, a smooth-scroll library behaves differently on
fractional scroll positions. MotionPR runs the same scenarios in each engine and compares each
engine with its own approved baseline.

## One engine

```bash
npx motionpr run                        # browser.name from the config (default chromium)
npx motionpr run --browser firefox      # this run only
MOTIONPR_BROWSER=webkit npx motionpr run
```

To make another engine the default for every command, set it in the config:

```ts
// motionpr.config.ts
browser: { name: "firefox" },
```

`--browser` beats `MOTIONPR_BROWSER`, which beats `browser.name`. An unknown name is an error
(exit `2`), and a missing engine is an error that names the install command: MotionPR never
substitutes another browser.

## Several engines

```bash
npx motionpr install --all
npx motionpr run --browser all                # Chromium, Firefox, WebKit
npx motionpr run --browser chromium,webkit    # a list; --browser is also repeatable
```

The engines run one after another, against one web server. Each engine's part of the run is
complete on its own: capture, comparison with that engine's baseline, report. The terminal ends
with one line per engine:

```text
  Browsers
    Chromium  passed      158.0.8127.18 · 20261115-190833-9c1a
    Firefox   regression  159.0 · 20261115-190835-0d4e
    WebKit    passed      27.2 · 20261115-190838-71f2
  Reports .motionpr/report/index.html
```

The exit code covers every engine: `2` if any engine could not run (or, in CI, had no
baseline), otherwise `1` if any engine found a regression, otherwise `0`. When one engine fails
to launch, the others still run and report, and the run still exits `2`.

## Baselines per engine

The first run of an engine has nothing to compare against. Review its report, then approve:

```bash
npx motionpr baseline accept --browser firefox
npx motionpr baseline accept --browser all      # the latest capture of each engine
git add .motionpr/baseline
```

Each engine's baseline lives in `.motionpr/baseline/<browser>/`. Accepting one engine never
changes another; a capture taken with Firefox can only become the Firefox baseline, also when
you pass it with `--from`. `npx motionpr baseline status` lists all three.

When a change is intended in one engine only (a Safari-specific fallback, say), approve that
engine only. The others keep comparing against theirs.

## Reading the results

- **Terminal:** each engine's summary, then the per-engine table above.
- **JSON** (`run --json`): with one engine, the same comparison object as before plus a
  `browser` field. With several: `{ "kind": "motionpr-run", "exitCode", "reportIndex",
"browsers": [{ "browser", "status", "exitCode", "capture", "report", "summary",
"differences", "error" }] }`, where `status` is `passed`, `failed`, `no-baseline` or `error`.
- **Reports:** `.motionpr/report/index.html` lists every engine's report with its result and
  counts; each report is in `.motionpr/report/<browser>/`.
- **Step summary:** in GitHub Actions, one section per engine.

## Environment noise is not a regression

Within one engine, MotionPR's replay is deterministic: the tests capture the same build twice in
each engine and require identical frames and no differences. What still varies is what is
observed live, and each capture records how precisely it could observe:

| Recorded in `environment.capabilities`     | What it explains                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------------------- |
| `timerResolutionMs`                        | Start offsets and scroll timings are quantized to this (1 ms in Firefox and WebKit) |
| `frameIntervalMs`                          | Live observations are as coarse as a frame (33 ms in headless WebKit on macOS)      |
| `devicePixelRatio`, `prefersReducedMotion` | The emulated settings the page actually saw                                         |

Start offsets are compared with `comparison.timing.startToleranceMs` (34 ms, two frames) for this
reason. Motion your app interrupts on a wall-clock timer (a `setTimeout` that cancels or reverses
an animation) is recorded as it happened, and under load the interruption can land at a different
point of the animation; the sampled path of a cancelled animation is therefore compared as
`uncertain`, while its declared timing is compared as usual. Keep the baseline and the candidate on the same platform and engine version; the
comparison warns with `BROWSER_VERSION_DIFFERS` and `PLATFORM_DIFFERS` when they are not.

## Comparing two engines

Sometimes you want to know how two engines differ for the same build. Ask for it explicitly:

```bash
npx motionpr compare --browser webkit --against chromium
npx motionpr compare --baseline ./chromium-capture --current ./firefox-capture --cross-browser
```

Without `--against` or `--cross-browser`, captures of two engines are refused (exit `2`,
`BROWSER_MISMATCH`). In a cross-browser comparison:

- declared timing, easing, iterations, direction, fill, and added or removed motion are compared
  as usual: they describe your code;
- pixel, geometry (trajectory, size), keyframe serialization, start offsets and scroll motion are
  `uncertain`: they describe the engines;
- the result carries `crossBrowser: true` and a `CROSS_BROWSER_COMPARISON` diagnostic, and the
  report goes to `.motionpr/report/<baseline>-vs-<candidate>/`.

Uncertain findings never fail a run unless `comparison.failOnUncertain` is set.

## In CI

A matrix job per engine keeps runs parallel and reports separate:

```yaml
jobs:
  motion:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        browser: [chromium, firefox, webkit]
    steps:
      # checkout, setup-node and install as in docs/ci/github-actions.md
      - run: npx motionpr install ${{ matrix.browser }} --with-deps
      - run: npx motionpr run --ci --browser ${{ matrix.browser }}
      - if: ${{ always() }}
        uses: actions/upload-artifact@<sha> # pin to a commit SHA
        with:
          name: motionpr-report-${{ matrix.browser }}
          path: .motionpr/report
```

Or one job that runs every engine: `npx motionpr install --all --with-deps` and
`npx motionpr run --ci --browser all`. Capture each engine's baseline on the same OS as CI
([Baseline management](../ci/baseline-management.md)).

The full workflow is in [GitHub Actions](../ci/github-actions.md); engine-specific setup is in
[Chromium](chromium.md), [Firefox](firefox.md) and [WebKit](webkit.md).
