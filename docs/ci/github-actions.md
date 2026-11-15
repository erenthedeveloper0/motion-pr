---
title: GitHub Actions
description: The least-privilege workflow motionpr init --github writes, and what each step does.
---

# GitHub Actions

```bash
npx motionpr init --github
```

writes `.github/workflows/motionpr.yml`. This is the file it generated for an npm project:

```yaml title=".github/workflows/motionpr.yml"
# MotionPR: animation regression checks.
# See https://github.com/erenthedeveloper0/motionpr/blob/main/docs/ci/github-actions.md
# Third-party actions are pinned to full commit SHAs; Dependabot can keep them updated.
name: MotionPR

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  motion:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      # Installs the engine in browser.name; list engines to install more (e.g. chromium firefox).
      - name: Install the browser for MotionPR
        run: npx motionpr install --with-deps
      - name: Run MotionPR
        run: npx motionpr run --ci
      - name: Upload MotionPR report
        if: ${{ always() }}
        uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
        with:
          name: motionpr-report
          path: .motionpr/report
          if-no-files-found: ignore
          retention-days: 14
```

With pnpm it adds `pnpm/action-setup` and runs `pnpm install --frozen-lockfile` and
`pnpm exec motionpr`; with yarn, `yarn install --frozen-lockfile` and `yarn motionpr`. The
workflow uses Node.js 24; change `node-version` if your project needs another.

## What each step does

| Step                           | Notes                                                                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `motionpr install --with-deps` | The engine in `browser.name` (Chromium by default) plus its system libraries on the Ubuntu runner                                                             |
| `motionpr run --ci`            | Captures, compares with the committed `.motionpr/baseline/<browser>`, writes the report, appends the summary to `$GITHUB_STEP_SUMMARY`, exits `0`, `1` or `2` |
| Upload report                  | Runs even when the previous step failed (`always()`), so a regression always comes with its report                                                            |

The summary on the run page is the Markdown shown in
[motionpr compare](../cli/compare.md#markdown-output). The job fails on exit `1` (a difference
reached `comparison.failOn`) and `2` (an error, or no baseline yet; pass
`--allow-missing-baseline` while bootstrapping).

## Several browsers

Run each engine as its own job, so they run in parallel and report separately. `fail-fast: false`
keeps one engine's regression from cancelling the others:

```yaml
jobs:
  motion:
    name: motion (${{ matrix.browser }})
    runs-on: ubuntu-latest
    timeout-minutes: 20
    strategy:
      fail-fast: false
      matrix:
        browser: [chromium, firefox, webkit]
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npx motionpr install ${{ matrix.browser }} --with-deps
      - run: npx motionpr run --ci --browser ${{ matrix.browser }}
      - if: ${{ always() }}
        uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
        with:
          name: motionpr-report-${{ matrix.browser }}
          path: .motionpr/report
          if-no-files-found: ignore
          retention-days: 14
```

Or keep one job: `npx motionpr install --all --with-deps` and `npx motionpr run --ci --browser all`
(the engines run one after another; the step summary has a section per engine, and
`.motionpr/report/index.html` lists every engine's report). Every engine needs its own committed
baseline in `.motionpr/baseline/<browser>/`. WebKit needs the most system libraries; the Ubuntu
runners Playwright supports install them with `--with-deps`. See
[Cross-browser testing](../browsers/cross-browser-testing.md).

## Next

- [Pull request workflow](pull-request-workflow.md): two ways to set up the comparison.
- [Baseline management](baseline-management.md): approving changes, capturing on Linux.
- [Report artifacts](report-artifacts.md): downloading and opening reports.
- [Security](security.md): why `contents: read` and `pull_request` are enough.
