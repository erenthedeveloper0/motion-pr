---
title: Browser setup
description: Download Chromium, Firefox or WebKit for MotionPR, install their system libraries on Linux, or point MotionPR at a browser you already have.
---

# Browser setup

MotionPR captures with Playwright's builds of Chromium, Firefox and WebKit, in the versions that
match its bundled Playwright (1.65). Download the engines you use, once per machine:

```bash
npx motionpr install                     # the engine in browser.name (Chromium by default)
npx motionpr install firefox webkit      # name the engines
npx motionpr install --all               # Chromium, Firefox and WebKit
```

On a fresh Linux machine or CI runner, also install the system libraries the engines need. This
uses `sudo` (or root):

```bash
npx motionpr install --with-deps
npx motionpr install --all --with-deps
```

| Option         | Effect                                                                   |
| -------------- | ------------------------------------------------------------------------ |
| `--all`        | Chromium, Firefox and WebKit                                             |
| `--with-deps`  | Also install system libraries (Linux; needs root)                        |
| `--only-shell` | Chromium only: the headless shell; smaller, but `--headed` will not work |
| `--force`      | Reinstall even if present                                                |
| `--dry-run`    | Print what would be installed                                            |

`npx motionpr doctor` lists which engines are installed and launches the configured one;
`npx motionpr doctor --browser all` launches all three.

## Choosing an engine

Chromium is the default. Use another for one run, for a shell or CI job, or for the project:

```bash
npx motionpr run --browser firefox
MOTIONPR_BROWSER=webkit npx motionpr run
```

```ts
// motionpr.config.ts
browser: { name: "firefox" },
```

Each engine keeps its own baseline: see [Browser support](../browsers/support.md) and
[Cross-browser testing](../browsers/cross-browser-testing.md).

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
browser: { channel: "chrome" },                  // an installed Google Chrome (or "msedge")
// or
browser: { executablePath: "/path/to/chromium" }, // a binary for the engine in browser.name
```

A Chromium channel is used whenever Chromium runs; Playwright's Firefox channels (`moz-firefox`,
…) whenever Firefox runs. `MOTIONPR_BROWSER_PATH` sets `browser.executablePath` from the
environment. A different build can render fonts and timing slightly differently from the
baseline's; captures record the browser version and the comparison warns
(`BROWSER_VERSION_DIFFERS`) when they differ. MotionPR's tests cover Playwright's builds.

## Docker

The official Playwright images (`mcr.microsoft.com/playwright`) already contain the system
libraries of all three engines, so `npx motionpr install` without `--with-deps` is enough inside
them. The browsers an image ships with only match MotionPR when the image's Playwright version is
the same (1.65); this setup is not covered by MotionPR's own tests.

Engine specifics: [Chromium](../browsers/chromium.md), [Firefox](../browsers/firefox.md),
[WebKit](../browsers/webkit.md). Next: [Project initialization](project-initialization.md).
