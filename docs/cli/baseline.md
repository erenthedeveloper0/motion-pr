---
title: motionpr baseline
description: Approve a capture as the baseline, or show the current one.
---

# `motionpr baseline`

## `motionpr baseline accept`

```bash
npx motionpr baseline accept [options]
```

Approves a capture as the new baseline. It prints the capture being approved and the baseline it
replaces, asks for confirmation when a baseline exists, and replaces the directory atomically
(copied to a staging directory, then renamed).

| Option             | Description                                                                   |
| ------------------ | ----------------------------------------------------------------------------- |
| `--from <capture>` | `latest` (default), a capture id, or a directory (e.g. a downloaded artifact) |
| `-y, --yes`        | Confirm replacing an existing baseline (required when not interactive)        |
| `--allow-failed`   | Approve even if some scenarios failed                                         |

In a non-interactive shell, replacing an existing baseline without `--yes` is refused:

```text
  ✖ Refusing to replace the approved baseline without confirmation.
    Re-run with --yes to confirm (this is deliberate: baselines are never overwritten silently).
```

(exit code `2`). Captures with failed scenarios are refused unless you pass `--allow-failed`.

## `motionpr baseline status`

```bash
npx motionpr baseline status
```

```text
◐ motionpr 0.1.0-alpha  ·  baseline status

  Baseline  20261113-215354-f7d6 · 1 scenarios · 1 checkpoints · 1 animations · darwin · Chromium 158.0.8127.18
  Created   2026-11-13T21:53:56.501Z
  Location  .motionpr/baseline
```

See [Baselines](../features/baselines.md) and [Baseline management](../ci/baseline-management.md).
