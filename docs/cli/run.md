---
title: motionpr run
description: The everyday command — capture, compare with the baseline, write the report, exit with a CI-friendly code.
---

# `motionpr run`

```bash
npx motionpr run [options]
```

1. Load and validate the config.
2. Start configured web servers (or reuse running ones) and wait until they respond.
3. Capture every scenario.
4. Load the baseline.
5. Compare.
6. Generate the report.
7. Print the summary, and append it to `$GITHUB_STEP_SUMMARY` when that variable is set.
8. Exit with `0`, `1` or `2` ([exit codes](../ci/exit-codes.md)).

Servers and the browser are stopped on every path, including failures and Ctrl+C.

Accepts every [`capture`](capture.md) filter (`--scenario`, `--viewport`, `--headed`,
`--no-web-server`, …) plus:

| Option                       | Description                                            |
| ---------------------------- | ------------------------------------------------------ |
| `-t, --threshold <severity>` | Override `comparison.failOn`                           |
| `--open`                     | Open the report afterwards                             |
| `--allow-missing-baseline`   | In CI, exit `0` instead of `2` when no baseline exists |
| `--no-summary`               | Do not write `$GITHUB_STEP_SUMMARY`                    |

## Without a baseline

`run` writes a capture-only report and explains how to approve one. Locally it exits `0`; with
`--ci` (or in a detected CI environment) it exits `2`, because a CI job that compares against
nothing should not pass silently. Pass `--allow-missing-baseline` while you bootstrap.

## Examples

```bash
npx motionpr run                         # the everyday loop
npx motionpr run --open -s menu          # one scenario, then open the report
npx motionpr run --ci                    # what the GitHub workflow runs
npx motionpr run -t never --json         # never fail; machine-readable result
```

The output of a passing and a failing run is shown in
[First comparison](../getting-started/first-comparison.md).
