---
title: motionpr install
description: Download the Chromium build that matches MotionPR's bundled Playwright version.
---

# `motionpr install`

```bash
npx motionpr install [options]
```

Downloads the Chromium build that matches the bundled Playwright version (1.65), about 150 MB, once
per machine.

| Option         | Description                                                 |
| -------------- | ----------------------------------------------------------- |
| `--with-deps`  | Also install system libraries (Linux; needs root)           |
| `--only-shell` | Only the headless shell (smaller; `--headed` will not work) |
| `--force`      | Reinstall even if present                                   |
| `--dry-run`    | Print what would be installed                               |

When the download fails, the command prints the usual causes: no network or a proxy
(`HTTPS_PROXY`, or `PLAYWRIGHT_DOWNLOAD_HOST` for a mirror) and a read-only cache
(`PLAYWRIGHT_BROWSERS_PATH`). See [Browser setup](../getting-started/browser-setup.md).

```bash
npx motionpr install                 # macOS, Windows, or Linux with libraries present
npx motionpr install --with-deps     # fresh Linux machine or CI runner
```
