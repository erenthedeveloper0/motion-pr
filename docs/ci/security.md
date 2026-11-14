---
title: Security
description: Least-privilege permissions, fork pull requests, pinned actions and untrusted captures.
---

# Security

## Permissions

The generated workflow needs only `contents: read`. It posts nothing to the pull request and uses
no token beyond the default read-only one; the step summary shows the result on the run page.
Do not add `pull-requests: write` just to comment.

## Pull requests from forks

Use the `pull_request` trigger. For pull requests from forks it gives the job no secrets and a
read-only token. Do **not** switch to `pull_request_target` to get write access: that would run
the fork's code (your app, its scenarios, its `motionpr.config.ts`) with your repository's
privileges and secrets.

## Your config is code

`motionpr.config.ts` is executed, and scenarios drive your app in a real browser. Treat a config
from an untrusted source like any script from that source.

## Pinned actions

Third-party actions in the generated workflow are pinned to full commit SHAs, not tags, because a
tag can be moved. Keep them current with Dependabot (`package-ecosystem: github-actions`).

## Untrusted captures

Captures can come from CI artifacts of pull requests. When MotionPR reads one:

- `capture.json` and `comparison.json` are validated against their schemas;
- asset ids and paths are validated (`^[A-Za-z0-9_-]+\.(png|jpe?g)$`, `assets/<id>`), so a capture
  cannot make MotionPR read or write outside its directory;
- reports embed data as inert JSON (`<` escaped) and render all text as text; they never execute
  data from captures and load nothing from the network.

## Data

MotionPR sends no telemetry and uploads nothing. See [Privacy](../configuration/privacy.md).

Report a vulnerability privately: [SECURITY.md](../../SECURITY.md).
