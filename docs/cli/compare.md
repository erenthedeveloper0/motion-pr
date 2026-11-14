---
title: motionpr compare
description: Compare two captures, write comparison.json and diff images, and generate the report.
---

# `motionpr compare`

```bash
npx motionpr compare [options]
```

Compares two captures, writes `comparison.json` (and diff images) and the HTML report. Without
options it compares the latest capture with the baseline.

| Option                       | Description                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `-b, --baseline <capture>`   | `baseline` (default), a capture id, or a directory containing `capture.json` |
| `--current <capture>`        | `latest` (default), a capture id or a directory                              |
| `-o, --output <dir>`         | Comparison output directory (default `.motionpr/comparison`)                 |
| `-t, --threshold <severity>` | Override `comparison.failOn`: `critical`, `warning`, `info`, `never`         |
| `-f, --format <format>`      | `text` (default), `json`, `markdown`                                         |
| `--no-report`                | Skip HTML report generation                                                  |
| `--open`                     | Open the report afterwards                                                   |

`compare` works without a config file when both `--baseline` and `--current` are given; the
default comparison thresholds apply.

## Markdown output

`--format markdown` prints the summary that `run` writes to `$GITHUB_STEP_SUMMARY`. This is the
real output for the [First comparison](../getting-started/first-comparison.md) example:

```markdown
## MotionPR · motion regression detected

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
```
