---
title: Browser settings
description: Channel, binary, headless mode, colour scheme, locale, time zone and reduced motion.
---

# Browser settings

| Option                      | Default                        | Description                                           |
| --------------------------- | ------------------------------ | ----------------------------------------------------- |
| `browser.name`              | `"chromium"`                   | Only Chromium is supported in this release            |
| `browser.channel`           | —                              | Use an installed channel, e.g. `"chrome"`             |
| `browser.executablePath`    | —                              | Custom browser binary (also `MOTIONPR_BROWSER_PATH`)  |
| `browser.headless`          | `true`                         | `--headed` and `--debug` override it                  |
| `browser.args`              | `[]`                           | Extra Chromium flags                                  |
| `browser.viewport`          | `{ width: 1440, height: 900 }` | Viewport when `viewports` is not set                  |
| `browser.viewports`         | —                              | Named viewports; see [Viewports](viewports.md)        |
| `browser.deviceScaleFactor` | `1`                            | Default pixel ratio                                   |
| `browser.colorScheme`       | `"light"`                      | `light`, `dark`, `no-preference`                      |
| `browser.locale`            | `"en-US"`                      | Fixed for determinism                                 |
| `browser.timezoneId`        | `"UTC"`                        | Fixed for determinism                                 |
| `browser.reducedMotion`     | `"no-preference"`              | Set `"reduce"` to capture your reduced-motion variant |
| `browser.userAgent`         | Chromium default               |                                                       |

Every scenario runs in a fresh browser context with service workers blocked, so a cached service
worker cannot serve yesterday's build.

## Determinism

Locale and time zone are fixed so that dates, number formats and anything derived from them
render the same on every machine. Leave them at their defaults unless your motion depends on
them. Captures record the settings they used (`settings` in `capture.json`) and a hash of the
configuration; the comparison adds a `CONFIG_DIFFERS` note when the two hashes differ.

## Reduced motion

Your reduced-motion styles are motion too. Capture them as a separate environment, with its own
baseline directory:

```ts
environments: {
  reduced: {
    browser: { reducedMotion: "reduce" },
    output: { baseline: "baseline-reduced" },
  },
},
```

```bash
npx motionpr run --env reduced
```

If your app turns smooth scrolling off under reduced motion, `scrollTo` and `wheel` steps still
record what happened (a jump is scroll motion too), and Lenis scroll records carry
`prefersReducedMotion: true`.
