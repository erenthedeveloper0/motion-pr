---
title: Browser settings
description: The engine (Chromium, Firefox, WebKit), channels, binaries, flags, viewports, colour scheme, locale, time zone and reduced motion — and where each engine's data is stored.
---

# Browser settings

```ts
// motionpr.config.ts
export default defineConfig({
  baseURL: "http://localhost:3000",
  browser: {
    name: "chromium",
    viewport: { width: 1440, height: 900 },
  },
  scenarios: [{ id: "home" }],
});
```

| Option                      | Default                        | Description                                                                                        |
| --------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------- |
| `browser.name`              | `"chromium"`                   | `"chromium"`, `"firefox"` or `"webkit"`: the engine runs use                                       |
| `browser.channel`           | —                              | An installed browser: Chromium (`"chrome"`, `"msedge"`, …) or Firefox (`"moz-firefox"`, …) channel |
| `browser.executablePath`    | —                              | Binary for the engine in `name` (also `MOTIONPR_BROWSER_PATH`)                                     |
| `browser.headless`          | `true`                         | `--headed` and `--debug` override it                                                               |
| `browser.args`              | `[]`                           | Command-line flags for the engine in `name`                                                        |
| `browser.firefoxUserPrefs`  | —                              | Firefox preferences (`about:config`), whenever Firefox runs                                        |
| `browser.viewport`          | `{ width: 1440, height: 900 }` | Viewport when `viewports` is not set                                                               |
| `browser.viewports`         | —                              | Named viewports; see [Viewports](viewports.md)                                                     |
| `browser.deviceScaleFactor` | `1`                            | Default pixel ratio                                                                                |
| `browser.colorScheme`       | `"light"`                      | `light`, `dark`, `no-preference`                                                                   |
| `browser.locale`            | `"en-US"`                      | Fixed for determinism                                                                              |
| `browser.timezoneId`        | `"UTC"`                        | Fixed for determinism                                                                              |
| `browser.reducedMotion`     | `"no-preference"`              | Set `"reduce"` to capture your reduced-motion variant                                              |
| `browser.userAgent`         | the engine's default           |                                                                                                    |

Every scenario runs in a fresh browser context with service workers blocked, so a cached service
worker cannot serve yesterday's build. The settings apply to every engine.

## Choosing the engine

`browser.name` is the engine every command uses. For one run, `--browser` picks another engine or
several; `MOTIONPR_BROWSER` does the same for every command in a shell or CI job:

| Precedence | Source                   | Example                                                           |
| ---------- | ------------------------ | ----------------------------------------------------------------- |
| 1          | `--browser` (repeatable) | `--browser firefox`, `--browser all`, `--browser chromium,webkit` |
| 2          | `MOTIONPR_BROWSER`       | `MOTIONPR_BROWSER=webkit npx motionpr run`                        |
| 3          | `browser.name`           | `browser: { name: "firefox" }`                                    |

An unknown name is a usage error (exit `2`); `all` means Chromium, Firefox and WebKit, in that
order. MotionPR never falls back to another engine: a requested engine that is not installed is
an error naming the install command.

## Launch settings per engine

Launch settings belong to an engine, so each one applies where it makes sense, also in a run
that uses several engines:

| Setting                    | Used when                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `browser.channel`          | its engine runs: `moz-firefox*` channels for Firefox, every other channel for Chromium |
| `browser.executablePath`   | the engine in `browser.name` runs                                                      |
| `browser.args`             | the engine in `browser.name` runs (flags are engine specific)                          |
| `browser.firefoxUserPrefs` | Firefox runs                                                                           |

With `name: "chromium"`, `channel: "chrome"` and `args: ["--font-render-hinting=none"]`,
`--browser all` runs Google Chrome with that flag, then Playwright's Firefox and WebKit without
it. Engine-specific notes: [Chromium](../browsers/chromium.md), [Firefox](../browsers/firefox.md),
[WebKit](../browsers/webkit.md).

## Where each engine's data goes

Every engine has its own baseline, captures, comparison and report under `output.directory`:

| Path (defaults)                         | Contents                                                     |
| --------------------------------------- | ------------------------------------------------------------ |
| `.motionpr/baseline/<browser>/`         | The approved baseline (commit it)                            |
| `.motionpr/captures/<browser>/<id>/`    | Recent captures; `LATEST`; the newest `output.keep` are kept |
| `.motionpr/comparison/<browser>/`       | `comparison.json` and diff images                            |
| `.motionpr/report/<browser>/index.html` | That engine's report                                         |
| `.motionpr/report/index.html`           | Every engine's report with its result                        |

`output.baseline`, `output.captures` and `output.report` rename the parent directories; the
engine directories are always `chromium`, `firefox` and `webkit`. A cross-browser comparison
writes to `<baseline>-vs-<candidate>` (e.g. `report/chromium-vs-firefox/`). See
[Baselines](../features/baselines.md).

## What captures record

Each capture records the environment it ran in, read from the browser at runtime:
`environment.browser` (`name`, `version`, `headless`, `channel`, `userAgent`), the operating
system (`platform`, `arch`, `osRelease`), the Node.js and Playwright versions, and
`environment.capabilities`: the Web Animations features MotionPR relies on, `timerResolutionMs`,
`frameIntervalMs`, `devicePixelRatio` and `prefersReducedMotion`. Viewport and device scale factor
are recorded per scenario; colour scheme, locale, time zone, reduced motion and the sampling
settings are in `settings`. See [Capture data model](../features/capture-data-model.md).

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
npx motionpr run --env reduced --browser all   # per engine, as always
```

If your app turns smooth scrolling off under reduced motion, `scrollTo` and `wheel` steps still
record what happened (a jump is scroll motion too), and Lenis scroll records carry
`prefersReducedMotion: true`. An animation the app finishes as soon as it creates it
(`el.animate(…).finish()`, a common reduced-motion fallback) is recorded with its timing and
`finishedOnCreation: true`, without samples.
