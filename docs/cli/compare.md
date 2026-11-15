---
title: motionpr compare
description: Compare two captures, write comparison.json and diff images, and generate the report.
---

# `motionpr compare`

```bash
npx motionpr compare [options]
```

Compares two captures, writes `comparison.json` (and diff images) and the HTML report. Without
options it compares the configured engine's latest capture with that engine's baseline. Captures
of two different engines are only compared when you ask for it.

| Option                       | Description                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `-b, --baseline <capture>`   | `baseline` (default), a capture id, or a directory containing `capture.json` |
| `--current <capture>`        | `latest` (default), a capture id or a directory                              |
| `-o, --output <dir>`         | Comparison output directory (default `.motionpr/comparison/<browser>`)       |
| `--browser <name>`           | Engine whose captures are compared; `all` or a list compares each engine     |
| `--against <browser>`        | Compare with another engine's baseline (a cross-browser comparison)          |
| `--cross-browser`            | Allow `--baseline` and `--current` captures of different engines             |
| `-t, --threshold <severity>` | Override `comparison.failOn`: `critical`, `warning`, `info`, `never`         |
| `-f, --format <format>`      | `text` (default), `json`, `markdown`                                         |
| `--no-report`                | Skip HTML report generation                                                  |
| `--open`                     | Open the report afterwards                                                   |

`compare` works without a config file when both `--baseline` and `--current` are given; the
default comparison thresholds apply. With an explicit `--current` capture and no `--browser`,
the candidate's own engine decides which baseline is used.

## Engines

Each engine is compared with its own baseline. Without `--against` or `--cross-browser`, a
baseline and a candidate from two engines are refused:

```text
  ✖ The baseline (.motionpr/baseline/chromium) was captured with Chromium, the candidate with WebKit.
    Each browser has its own baseline. To compare engines on purpose, add --cross-browser: pixel, geometry and scheduling differences are then reported as uncertain.
```

(exit code `2`, `BROWSER_MISMATCH`). A cross-browser comparison compares declared timing and
easing as usual, reports engine-dependent differences as `uncertain`, sets `crossBrowser: true`
in `comparison.json`, and writes to `comparison/<baseline>-vs-<candidate>/` and
`report/<baseline>-vs-<candidate>/`. See
[Cross-browser testing](../browsers/cross-browser-testing.md#comparing-two-engines).

## Markdown output

`--format markdown` prints the summary that `run` writes to `$GITHUB_STEP_SUMMARY`. This is the
real output for the [First comparison](../getting-started/first-comparison.md) example:

```markdown
## MotionPR · Chromium · motion regression detected

| Result                         | Critical | Warning | Uncertain | Info |
| ------------------------------ | -------: | ------: | --------: | ---: |
| ❌ Failed (fail on `critical`) |        1 |       1 |         0 |    1 |

| Scenario               | Status  | Changes |
| ---------------------- | ------- | ------- |
| 🔴 `menu-open@default` | changed | 3       |

<details open><summary>Differences (3)</summary>

- 🔴 **critical** `menu-open@default` › menu-open: css-transition “transform” on menu: Duration 300ms → 600ms (+300ms, +100%)
- 🟠 **warning** `menu-open@default` › menu-open: css-transition “transform” on menu: Easing cubic-bezier(0.16, 1, 0.3, 1) → ease-in-out (max deviation 70% of progress at 27% time)
- 🔵 **info** `menu-open@default` › menu-open: css-transition “transform” on menu: translateX path deviates up to 195.3px at 26% progress

</details>
```

## Examples

```bash
npx motionpr compare                                   # latest vs baseline
npx motionpr compare -t warning                        # fail on warnings too
npx motionpr compare -b ./main --current ./feature --format markdown --no-report
npx motionpr compare --browser all                     # each engine with its own baseline
npx motionpr compare --browser webkit --against chromium   # how WebKit differs from Chromium
```

With several engines, `--format json` prints `{ "kind": "motionpr-comparisons", "comparisons":
[…] }` and the exit code covers all of them (`2` before `1` before `0`).
