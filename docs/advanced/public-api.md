---
title: Public API
description: The JavaScript and TypeScript API of @erenthedeveloper0/motionpr — configuration, capture, comparison, reports, easing.
---

# Public API

`@erenthedeveloper0/motionpr` has four entry points:

| Import                                | Runs in                | Purpose                                                          |
| ------------------------------------- | ---------------------- | ---------------------------------------------------------------- |
| `@erenthedeveloper0/motionpr`         | Node.js ≥ 22.12        | Configuration helpers and the engine the CLI uses                |
| `@erenthedeveloper0/motionpr/gsap`    | the browser (your app) | The GSAP adapter; see [GSAP](../integrations/gsap.md)            |
| `@erenthedeveloper0/motionpr/animejs` | the browser (your app) | The Anime.js adapter; see [Anime.js](../integrations/animejs.md) |
| `@erenthedeveloper0/motionpr/lenis`   | the browser (your app) | The Lenis adapter; see [Lenis](../integrations/lenis.md)         |

Everything is ESM with bundled type declarations.

## Configuration

### `defineConfig(config)`

Identity function that gives `motionpr.config.ts` types and completion. Accepts a
`MotionprConfig` object or a `ConfigFactory` (`({ env, ci }) => MotionprConfig | Promise<…>`).

### `defineScenario(scenario)` / `defineSteps(steps)`

Identity helpers for declaring a `ScenarioConfig` or a `Step[]` in separate modules.

### `loadConfig(options?)`

```ts
const { config, file, rootDir, paths } = await loadConfig({ cwd, config, env, overrides });
```

`LoadConfigOptions`: `cwd`, `config` (explicit path), `env`, `overrides`.
Finds and loads the config file (TypeScript via jiti), evaluates function configs, applies
`environments`, `MOTIONPR_BASE_URL`/`MOTIONPR_BROWSER_PATH` and `overrides`, and validates.
Returns a `LoadedConfig`. Throws `ConfigError`.

### `resolveConfig(input, options?)`

Validates a raw config object and applies defaults. Returns a `ResolvedConfig`. Options:
`{ file, env, envVars, overrides }`.

## Running captures and comparisons

### `captureProject(loaded, options?)`

The `motionpr capture` behaviour: starts `webServer`s, runs all scenarios, writes the capture to
`.motionpr/captures/<browser>/<id>`, marks it that engine's latest and prunes old captures.
Returns a `ProjectCapture` (`{ bundle, dir }`). `CaptureProjectOptions`: `browserName`,
`scenarios`, `viewports`, `headless`, `debug`, `outputDir`, `webServer`, `signal`, `onEvent`,
`serverLogger`, `onServers`.

### `startProjectServers(loaded, options?)`

Starts the configured web servers once (for several captures, e.g. one per engine) and returns
`{ stop() }`, or `null` when none are configured or `enabled` is `false`. Pass
`webServer: false` to `captureProject` while they run.

### `runCapture(options)`

Lower level: captures with an already resolved config into `outputDir` without managing servers.
`CaptureOptions`: `config`, `rootDir`, `outputDir`, `browserName` (`chromium`, `firefox` or
`webkit`; default `config.browser.name`), `scenarios`, `viewports`, `headless`, `debug`,
`signal`, `onEvent`, `id`, `browser` (reuse a Playwright `Browser`; its engine is used, and a
different `browserName` throws `BROWSER_MISMATCH`). Returns a `CaptureOutcome`.
`onEvent` receives `CaptureEvent`s (`scenario:start`, `step`, `checkpoint`, `scenario:end`,
`diagnostic`, `browser`, `debug`).

### `compareDirs(options)` and `compareCaptures(options)`

```ts
const { result } = await compareDirs({
  baselineDir,
  candidateDir,
  config: config.comparison,
  outputDir,
});
const result = await compareCaptures({
  baseline: { dir, bundle },
  candidate: { dir, bundle },
  config,
  outputDir,
});
```

`compareDirs` (`CompareDirsOptions`) reads both capture directories; `compareCaptures`
(`CompareOptions`) takes loaded bundles. Both return a `ComparisonResult` and write
`comparison.json` plus diff images when `outputDir` is set.

Captures of two engines throw `BROWSER_MISMATCH` unless you pass `allowCrossBrowser: true`. The
result then has `crossBrowser: true`, and changes of the kinds in `ENGINE_DEPENDENT_CHANGES`
(`start`, `trajectory`, `size`, `keyframes` and the scroll kinds), visual changes and trigger
latency are graded `uncertain`, unless `comparison.severity` sets their rule explicitly.

### `exitCodeFor(result)`

`0` when the comparison is within thresholds, `1` otherwise.

### `writeReport(options)` and `generateReport(options)`

`writeReport` (`WriteReportOptions`) writes the HTML report with the bundled viewer:

```ts
await writeReport({
  outputDir,
  candidate: { dir, bundle },
  baseline: { dir, bundle },
  comparison: { dir, result },
});
```

`generateReport` (`GenerateReportOptions`) is the same with an explicit `template` string. Both
return a `GeneratedReport` (`{ indexPath, assets, bytes }`).

### `startWebServers(servers, options)`

Starts `webServer` entries and waits for readiness; returns `{ urls, stop() }`.

### `installBrowsers(options?)`

Runs Playwright's installer for the given engines (`{ browsers, withDeps, onlyShell, force,
dryRun }`; `browsers` defaults to `["chromium"]`); resolves to the exit code.

### `launchBrowser(config, options?)` / `isBrowserInstalled(name, options?)`

`launchBrowser` starts one engine (`{ browserName, headless }`, default `config.browser.name`)
with the launch settings that belong to it, and throws `BROWSER_NOT_INSTALLED`,
`BROWSER_DEPENDENCIES_MISSING` or `BROWSER_LAUNCH_FAILED` with an actionable hint; it never
starts another engine instead. `isBrowserInstalled` tells whether Playwright's build of an
engine is downloaded (for headless Chromium, the headless shell counts).

## Browsers and storage

| Export                                   | Description                                                                               |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| `BROWSER_NAMES`                          | `["chromium", "firefox", "webkit"]`                                                       |
| `BrowserName`                            | `"chromium" \| "firefox" \| "webkit"`                                                     |
| `parseBrowserSelection(value, fallback)` | `--browser` values (names, comma lists, `all`) → `BrowserName[]`; throws on unknown names |
| `browserPaths(paths, browser)`           | `BrowserPaths`: an engine's `baseline`, `captures`, `comparison` and `report` directories |
| `resolveBaselineDir(paths, browser)`     | The engine's approved baseline (`{ dir, legacy }`), also in the 0.1 layout, or `null`     |
| `BrowserCapabilities`                    | The type of `environment.capabilities`                                                    |
| `ENGINE_DEPENDENT_CHANGES`               | Change kinds graded `uncertain` in a cross-browser comparison                             |

```ts
import {
  browserPaths,
  loadConfig,
  parseBrowserSelection,
  captureProject,
} from "@erenthedeveloper0/motionpr";

const loaded = await loadConfig();
for (const browserName of parseBrowserSelection("all", loaded.config.browser.name)) {
  const { dir } = await captureProject(loaded, { browserName });
  console.log(browserName, dir, browserPaths(loaded.paths, browserName).baseline);
}
```

## Reading data

### `readCaptureBundle(dir)` / `parseCaptureBundle(json, source?)`

Read and validate `capture.json` (with migrations); throw `SchemaError` with issue paths.

### `readComparisonResult(dir)` / `parseComparisonResult(json, source?)`

The same for `comparison.json`.

### `CAPTURE_SCHEMA_VERSION`, `COMPARISON_SCHEMA_VERSION`

Current format versions (both `2`). See [Capture serialization](capture-serialization.md).

### `animationInterval(record)`

Window-relative interval of an `AnimationRecord` (`start`, `windowStart`, `windowEnd`,
`activeStart`, `activeEnd`, `infinite`), handling delay, iterations and reversed playback.

## Easing and values

| Function                      | Description                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| `parseCssEasing(value)`       | Parses any CSS easing (`linear`, keywords, `cubic-bezier()`, `steps()`, `step-start/end`, `linear()`) |
| `evaluateCssEasing(value, x)` | Output progress at input `x` (matches Chromium to 1e-4)                                               |
| `sampleEasing(value, count?)` | Evenly spaced samples (default 65)                                                                    |
| `compareEasingSamples(a, b)`  | Max/mean deviation, where it occurs, overshoot flags                                                  |
| `decomposeTransform(value)`   | `matrix()`/`matrix3d()` → translate, scale, rotate, skew                                              |

## Errors

| Class           | When                                                              |
| --------------- | ----------------------------------------------------------------- |
| `MotionprError` | Base class: `code` (`MotionprErrorCode`) and an actionable `hint` |
| `ConfigError`   | Config not found, failed to load, or invalid (`file`, `issues`)   |
| `SchemaError`   | Invalid or newer capture/comparison files (`issues`)              |

## Constants

- `MOTIONPR_VERSION`: the package version.
- `SEVERITY_RULES`: rule names accepted by `comparison.severity`.

## Types

Configuration: `MotionprConfig` (input), `ResolvedConfig` (with defaults), `ConfigContext`,
`ConfigFactory`, `ScenarioConfig`, `Step`, `StepType`, `WebServerConfig`, `ViewportConfig`,
`ComparisonConfig`, `SeverityRule`, `SeverityOverride`, `IgnoreRegion`, `BrowserName`,
`BrowserPaths`, `BrowserCapabilities`.

Capture data: `CaptureBundle`, `ScenarioResult`, `Checkpoint`, `AnimationRecord`, `FrameSample`,
`FilmstripFrame`, `ElementIdentity`, `EasingDescriptor`, `Timing`, `PropertyTrack`, `Diagnostic`.

Comparison data: `ComparisonResult`, `ScenarioComparison`, `CheckpointComparison`,
`AnimationComparison`, `Change`, `ChangeKind`, `Difference`, `Severity`, `Measurement`.

Report: `ReportData`. Errors: `MotionprErrorCode`.

Adapters: `MotionprAdapter`, `AdapterAnimation`; see [Custom adapters](custom-adapters.md).

## Example: a custom CI step

```ts
import {
  loadConfig,
  captureProject,
  compareDirs,
  writeReport,
  exitCodeFor,
} from "@erenthedeveloper0/motionpr";

const loaded = await loadConfig();
const capture = await captureProject(loaded, { scenarios: ["checkout-*"] });
const { result, baseline } = await compareDirs({
  baselineDir: loaded.paths.baseline,
  candidateDir: capture.dir,
  config: loaded.config.comparison,
  outputDir: `${loaded.paths.data}/comparison`,
});
await writeReport({
  outputDir: loaded.paths.report,
  candidate: capture,
  baseline: { dir: loaded.paths.baseline, bundle: baseline },
  comparison: { dir: `${loaded.paths.data}/comparison`, result },
});
process.exitCode = exitCodeFor(result);
```

## Motion record types (schema v2)

| Export                                                                            | Description                                                                      |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `TimelineRecord`                                                                  | A GSAP/Anime.js timeline in a checkpoint: duration, iterations, labels, children |
| `ScrollMotionRecord`, `ScrollSample`                                              | How a scroller (Lenis or native) moved, sample by sample                         |
| `MotionCorrelation`                                                               | An animation that ran while a scroller moved (`scroll-linked` or `overlap`)      |
| `Provenance`                                                                      | `declared` / `observed` / `inferred` / `unavailable`, per recorded field         |
| `AdapterStatus`                                                                   | Adapter health recorded per scenario                                             |
| `ScrollComparison`, `ScrollMetrics`, `TimelineComparison`                         | Comparison results for scroll and timelines                                      |
| `AdapterTimeline`, `AdapterScrollTrack`, `AdapterCapability`, `AdapterDiagnostic` | Adapter contract types for custom adapters                                       |
| `SUPPORTED_ENGINE_RANGES`                                                         | Tested version ranges of the first-party adapters (`gsap`, `animejs`, `lenis`)   |
