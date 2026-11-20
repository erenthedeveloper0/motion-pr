---
title: Chromium
description: Set up and run MotionPR with Chromium — the default engine — including the headless shell, installed Chrome or Edge, flags, Linux libraries and troubleshooting.
---

# Chromium

Chromium is MotionPR's default engine. It is Playwright's Chrome for Testing build
(158.0.8127.18 with Playwright 1.65), and every MotionPR feature is tested in it.

## Setup

```bash
npx motionpr install                  # Chromium, unless browser.name says otherwise
npx motionpr install chromium         # explicitly
npx motionpr install chromium --with-deps   # fresh Linux machine or CI runner (needs root)
npx motionpr doctor --browser chromium
```

Headless runs use Chromium's **headless shell**, a smaller build. `--only-shell` installs only
that; `--headed` and `--debug` then do not work.

## Configuration

```ts
// motionpr.config.ts
browser: {
  name: "chromium",                 // the default
  channel: "chrome",                // optional: an installed Google Chrome (or "msedge", …)
  args: ["--font-render-hinting=none"], // optional: Chromium command-line flags
},
```

| Option                   | Applies to Chromium when                                        |
| ------------------------ | --------------------------------------------------------------- |
| `browser.channel`        | it is a Chromium channel (`chrome`, `chrome-beta`, `msedge`, …) |
| `browser.executablePath` | `browser.name` is `chromium`                                    |
| `browser.args`           | `browser.name` is `chromium`                                    |

A channel or binary other than Playwright's build can render fonts and schedule frames slightly
differently from the baseline's; captures record the browser version, and the comparison warns
(`BROWSER_VERSION_DIFFERS`) when two versions differ. MotionPR's tests cover Playwright's build.

## Platform dependencies

- **macOS, Windows:** nothing beyond the download.
- **Linux:** `--with-deps` installs the system libraries Chromium needs (NSS, ATK, GBM and
  others) with `apt`, which needs root or `sudo`. Inside the official Playwright Docker images
  (`mcr.microsoft.com/playwright`) they are already present.

## Troubleshooting

| Message                                                             | Fix                                                       |
| ------------------------------------------------------------------- | --------------------------------------------------------- |
| `Chromium for MotionPR is not installed.`                           | `npx motionpr install chromium`                           |
| `Chromium cannot start: the system libraries it needs are missing.` | `npx motionpr install chromium --with-deps` (Linux, root) |
| `Could not launch Chromium: …` with a channel                       | Install that browser, or remove `browser.channel`         |
| `--headed` fails after `install --only-shell`                       | `npx motionpr install chromium` (the full build)          |

`npx motionpr doctor --browser chromium` launches Chromium once, checks the Web Animations API
and reports its timer resolution and frame rate.

## Known limitations

- Chromium's `scrollY` is a whole number of pixels, so smooth-scroll curves are slightly
  stepped compared with Firefox's fractional positions. Compare Chromium with Chromium.
- **`behavior: "smooth"` on Windows.** Chromium on Windows animates smooth scrolls only when the
  system's animation effects are on. On GitHub's `windows-latest` runners they are off: a
  `scrollTo` step, or the page's own `scrollTo({ behavior: "smooth" })` and CSS
  `scroll-behavior: smooth`, jumps instead. A `scrollTo` step still records the jump as scroll
  motion; a jump the page makes after a click is a state change, not scroll motion. Scrolling
  that the page animates itself (Lenis, or a carousel writing `scrollLeft` each frame) is not
  affected. Capture baselines on the platform where they are compared.

See [Browser support](support.md) and [Cross-browser testing](cross-browser-testing.md).
