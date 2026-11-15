---
title: motionpr install
description: Download the Chromium, Firefox or WebKit build that matches MotionPR's bundled Playwright version.
---

# `motionpr install`

```bash
npx motionpr install [browsers...] [options]
```

Downloads Playwright's builds of the given engines in the versions that match the bundled
Playwright (1.65), once per machine, then checks that each one is in place.

| Argument / option | Description                                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `browsers...`     | `chromium`, `firefox`, `webkit` (default: the config's `browser.name`, or `MOTIONPR_BROWSER`, or Chromium without a config) |
| `--all`           | Chromium, Firefox and WebKit                                                                                                |
| `--with-deps`     | Also install system libraries (Linux; needs root)                                                                           |
| `--only-shell`    | Chromium only: the headless shell (smaller; `--headed` will not work)                                                       |
| `--force`         | Reinstall even if present                                                                                                   |
| `--dry-run`       | Print what would be installed                                                                                               |

An unknown engine name exits `2`. When the download fails, or an engine is still missing
afterwards, the command exits `2` and prints the usual causes: no network or a proxy
(`HTTPS_PROXY`, or `PLAYWRIGHT_DOWNLOAD_HOST` for a mirror), missing system libraries on Linux
(`--with-deps`), and a read-only cache (`PLAYWRIGHT_BROWSERS_PATH`). See
[Browser setup](../getting-started/browser-setup.md).

```bash
npx motionpr install                       # the configured engine (Chromium by default)
npx motionpr install firefox webkit        # several engines
npx motionpr install --all --with-deps     # every engine on a fresh Linux machine or CI runner
npx motionpr install webkit --dry-run      # what would be downloaded, and where
```

On Linux, `--with-deps` installs each engine's libraries with `apt`; WebKit needs the most. The
engines' requirements are in [Chromium](../browsers/chromium.md), [Firefox](../browsers/firefox.md)
and [WebKit](../browsers/webkit.md).
