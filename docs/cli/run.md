---
title: motionpr run
description: The everyday command — capture, compare with the baseline, write the report, exit with a CI-friendly code.
---

# `motionpr run`

```bash
npx motionpr run [options]
```

1. Load and validate the config, and check that the selected engines are installed.
2. Start configured web servers (or reuse running ones) and wait until they respond.
3. For each engine: capture every scenario, load that engine's baseline, compare, and generate
   its report in `.motionpr/report/<browser>/`.
4. Write `.motionpr/report/index.html`, which lists every engine's report.
5. Print the summary, and append it to `$GITHUB_STEP_SUMMARY` when that variable is set.
6. Exit with `0`, `1` or `2` ([exit codes](../ci/exit-codes.md)).

Servers and browsers are stopped on every path, including failures and Ctrl+C.

Accepts every [`capture`](capture.md) filter (`--scenario`, `--viewport`, `--headed`,
`--no-web-server`, …) plus:

| Option                       | Description                                            |
| ---------------------------- | ------------------------------------------------------ |
| `--browser <name>`           | `chromium`, `firefox`, `webkit` or `all`; repeatable   |
| `-t, --threshold <severity>` | Override `comparison.failOn`                           |
| `--open`                     | Open the report afterwards                             |
| `--allow-missing-baseline`   | In CI, exit `0` instead of `2` when no baseline exists |
| `--no-summary`               | Do not write `$GITHUB_STEP_SUMMARY`                    |

## Without a baseline

`run` writes a capture-only report and explains how to approve one. Locally it exits `0`; with
`--ci` (or in a detected CI environment) it exits `2`, because a CI job that compares against
nothing should not pass silently. Pass `--allow-missing-baseline` while you bootstrap. Baselines
are per engine: a Firefox run never compares against the Chromium baseline.

## Several engines

`--browser all` (or a list such as `--browser chromium,webkit`) runs the engines one after
another against the same web server. Each engine is captured, compared with its own baseline and
reported on its own; the run ends with one line per engine and the path of the report index. The
exit code covers every engine: `2` if one could not run (or, in CI, had no baseline), otherwise
`1` if one found a regression, otherwise `0`. An engine that fails to launch does not stop the
others, but the run still exits `2`.

With `--json` and several engines the output is
`{ "kind": "motionpr-run", "exitCode", "reportIndex", "browsers": [ … ] }`; with one engine it is
the comparison (or `{ "status": "no-baseline" }`) with a `browser` field. See
[Cross-browser testing](../browsers/cross-browser-testing.md).

## Examples

```bash
npx motionpr run                         # the everyday loop
npx motionpr run --open -s menu          # one scenario, then open the report
npx motionpr run --ci                    # what the GitHub workflow runs
npx motionpr run -t never --json         # never fail; machine-readable result
npx motionpr run --browser firefox       # Firefox, against the Firefox baseline
npx motionpr run --ci --browser all      # every engine, each against its own baseline
```

The output of a passing and a failing run is shown in
[First comparison](../getting-started/first-comparison.md).
