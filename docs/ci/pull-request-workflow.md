---
title: Pull request workflow
description: Review motion changes in pull requests — against a committed baseline, or against the base branch.
---

# Pull request workflow

## Strategy A: a committed baseline

The default. The approved baseline lives in `.motionpr/baseline/` on your main branch.

1. A pull request changes some motion.
2. CI runs `motionpr run --ci` and fails if a difference reaches `comparison.failOn`.
3. The author downloads the report artifact and reviews it.
4. **Regression:** fix the code and push. **Intended:** approve the new capture and commit the
   updated baseline to the same pull request:

   ```bash
   npx motionpr run
   npx motionpr baseline accept --yes
   git add .motionpr/baseline && git commit -m "Update motion baseline: slower menu"
   ```

5. Reviewers see the code change and the baseline change together. CI passes again.

Use this when your baseline can be captured reliably (ideally on Linux, like CI; see
[Baseline management](baseline-management.md)).

## Strategy B: compare against the base branch

No committed baseline: the job captures the base branch and the pull request in the same run,
on the same machine, and compares the two directories. Platform differences disappear because
both captures come from the same runner.

```yaml title=".github/workflows/motionpr.yml (job steps)"
steps:
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
    with:
      ref: ${{ github.event.pull_request.base.sha }}
      path: base
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
    with:
      path: head
  - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
    with:
      node-version: 24
  - run: npm ci && npx motionpr install --with-deps
    working-directory: head
  - run: npm ci && npx motionpr capture -o "$RUNNER_TEMP/base-capture"
    working-directory: base
  - run: npx motionpr capture -o "$RUNNER_TEMP/head-capture"
    working-directory: head
  - run: npx motionpr compare --baseline "$RUNNER_TEMP/base-capture" --current "$RUNNER_TEMP/head-capture" --format markdown >> "$GITHUB_STEP_SUMMARY"
    working-directory: head
```

`capture -o` writes a capture to a directory of your choice, and `compare` accepts two directories
(it needs no config when both are given). These commands were verified locally; this workflow as a
whole is a recipe, not part of MotionPR's own CI. With `--format markdown`, `compare` prints the
summary to stdout; add `-o` and the report options as you need them. The trigger must be
`pull_request` for `github.event.pull_request.base.sha` to exist, and the base branch must already
have MotionPR installed and configured (the first pull request that adds MotionPR has nothing to
compare against).

Use this when baselines would churn (fonts, platform noise) or when you do not want binary
baselines in the repository. It costs two captures per run.

## What to run on

Motion is usually stable enough to run on every pull request. For large suites, filter by
scenario (`--scenario "checkout-*"`) or run MotionPR only when front-end files change
(`on.pull_request.paths`).
