---
title: Firefox
description: Set up and run MotionPR with Firefox — installation, preferences, Linux libraries, timer resolution, fractional scrolling and troubleshooting.
---

# Firefox

MotionPR captures with Playwright's Firefox build (Firefox 159.0, build 1572, with Playwright
1.65). Native CSS and Web Animations, the GSAP, Anime.js and Lenis adapters, and the CLI are
tested in it.

## Setup

```bash
npx motionpr install firefox
npx motionpr install firefox --with-deps    # fresh Linux machine or CI runner (needs root)
npx motionpr doctor --browser firefox
npx motionpr run --browser firefox
```

The first Firefox run has no baseline to compare against: review the report, then
`npx motionpr baseline accept --browser firefox` and commit `.motionpr/baseline/firefox`.

## Configuration

```ts
// motionpr.config.ts
browser: {
  name: "firefox",                    // or keep chromium and pass --browser firefox
  firefoxUserPrefs: {                 // about:config preferences, used whenever Firefox runs
    "privacy.reduceTimerPrecision": false,
  },
},
```

| Option                     | Applies to Firefox when                                                            |
| -------------------------- | ---------------------------------------------------------------------------------- |
| `browser.firefoxUserPrefs` | always (also when Firefox runs through `--browser`)                                |
| `browser.channel`          | it is a Firefox channel (`moz-firefox`, `moz-firefox-beta`, `moz-firefox-nightly`) |
| `browser.executablePath`   | `browser.name` is `firefox`                                                        |
| `browser.args`             | `browser.name` is `firefox`                                                        |

The `moz-firefox` channels drive an installed Firefox through Playwright; MotionPR passes them
through but its tests cover only Playwright's build.

## Timer resolution

Firefox reports `performance.now()` and event times in 1 ms steps (a privacy protection).
Replayed samples and frames are unaffected, but live observations (start offsets, trigger latency,
scroll timings) are quantized to 1 ms, and each Firefox capture carries a `COARSE_TIMERS` note.

Setting `"privacy.reduceTimerPrecision": false` in `firefoxUserPrefs` brings the resolution to
0.02 ms (measured with Playwright's build). Use the same preferences for the baseline and every
later run: they are part of the configuration hash, and a changed hash is reported as
`CONFIG_DIFFERS`.

## Platform dependencies

- **macOS, Windows:** nothing beyond the download.
- **Linux:** `--with-deps` installs the libraries Firefox needs (GTK 3, `libdbus-glib`, X11 and
  audio libraries) with `apt`; it needs root or `sudo`. The official Playwright Docker images
  already contain them.

## Troubleshooting

| Message                                                            | Fix                                                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `Firefox for MotionPR is not installed.`                           | `npx motionpr install firefox`                                                  |
| `Firefox cannot start: the system libraries it needs are missing.` | `npx motionpr install firefox --with-deps` (Linux, root)                        |
| `No approved firefox baseline.`                                    | `npx motionpr baseline accept --browser firefox`                                |
| Only Chromium has a baseline                                       | Baselines are per engine; see [Cross-browser testing](cross-browser-testing.md) |

## Known differences

- **Fractional scroll positions.** Firefox reports `scrollY` with sub-pixel precision; Chromium
  and WebKit round to whole pixels. Scroll settling is judged by the drift over the still period,
  so the slow tail of a Lenis ease-out is waited for in every engine.
- **Start times before the input event.** Firefox stamps animations created by a click at the
  frame time, which can precede the click's timestamp: trigger latencies are about 0 ms.
- **Single-precision keyframe offsets.** `getKeyframes()` returns `0.4000000059604645` for
  `40%`; MotionPR rounds offsets to 6 decimals.

See [Browser support](support.md).
