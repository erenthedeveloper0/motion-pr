---
title: motionpr doctor
description: Check Node.js, Chromium, the config, output permissions, the baseline, web servers and adapters.
---

# `motionpr doctor`

```bash
npx motionpr doctor [options]
```

Checks, in order: the Node.js version (22.12 or newer), the MotionPR and Playwright versions, the
Chromium binary and an actual browser launch, the config, output-directory permissions, the
baseline, the configured web servers or `baseURL`, and each configured adapter. Every problem is
printed with a fix. Exits `2` when a check fails.

| Option        | Description                   |
| ------------- | ----------------------------- |
| `--no-launch` | Skip the browser launch check |

## Adapters

For each configured adapter (`gsap`, `animejs`, `lenis`), `doctor` reports the installed package
version and whether it is inside the tested range. When the app is reachable, it opens the first
scenario with MotionPR's agent installed and checks that the adapter actually **registered in
the page**. An installed package alone is never reported as working.

## JSON

```bash
npx motionpr doctor --json
```

Each check has a `status` of `ok`, `info`, `warn` or `fail`, a `detail`, and a `fix` when there
is something to do. `ok` is `false` when any check failed. Shortened real output:

```json
{
  "ok": true,
  "checks": [
    { "name": "Node.js", "status": "ok", "detail": "v24.21.0" },
    { "name": "MotionPR", "status": "ok", "detail": "0.1.0-alpha.1" },
    { "name": "Playwright", "status": "ok", "detail": "playwright-core 1.65.0" },
    { "name": "Config", "status": "ok", "detail": "motionpr.config.mjs (1 scenario)" },
    {
      "name": "Web server",
      "status": "info",
      "detail": "http://localhost:4173 not running; MotionPR starts `npm run dev`"
    }
  ]
}
```

Use it as the first step of [Troubleshooting](../advanced/troubleshooting.md).
