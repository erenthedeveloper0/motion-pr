---
title: Browser setup
description: Download the Chromium build MotionPR uses, or point it at a browser you already have.
---

# Browser setup

MotionPR captures with the Chromium build that matches its bundled Playwright version (1.65).
Download it once per machine:

```bash
npx motionpr install
```

On a fresh Linux machine or CI runner, also install the system libraries Chromium needs. This uses
`sudo` (or root):

```bash
npx motionpr install --with-deps
```

| Option         | Effect                                                         |
| -------------- | -------------------------------------------------------------- |
| `--with-deps`  | Also install system libraries (Linux; needs root)              |
| `--only-shell` | Only the headless shell: smaller, but `--headed` will not work |
| `--force`      | Reinstall even if present                                      |
| `--dry-run`    | Print what would be installed                                  |

`npx motionpr doctor` launches the browser once and tells you whether it works.

## Networks, mirrors and caches

The download is Playwright's, so Playwright's environment variables apply:

| Variable                   | Use                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------- |
| `HTTPS_PROXY`              | Download through a proxy                                                              |
| `PLAYWRIGHT_DOWNLOAD_HOST` | Download from a mirror                                                                |
| `PLAYWRIGHT_BROWSERS_PATH` | Install into (and launch from) a custom directory, e.g. a CI cache. Set it both times |

## Using a browser you already have

```ts
// motionpr.config.ts
browser: { channel: "chrome" },                  // an installed Google Chrome
// or
browser: { executablePath: "/path/to/chromium" }, // any Chromium binary
```

`MOTIONPR_BROWSER_PATH` sets `browser.executablePath` from the environment. A different Chromium
build can render fonts and timing slightly differently from the baseline's; captures record the
browser version and the comparison warns (`BROWSER_VERSION_DIFFERS`) when they differ.

## Docker

The official Playwright images (`mcr.microsoft.com/playwright`) already contain the system
libraries, so `npx motionpr install` without `--with-deps` is enough inside them. The browsers an
image ships with only match MotionPR when the image's Playwright version is the same (1.65); this
setup is not covered by MotionPR's own tests.

Next: [Project initialization](project-initialization.md).
