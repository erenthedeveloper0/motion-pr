# Changelog

All notable changes to MotionPR. The public package is `@erenthedeveloper0/motionpr`; the
workspace packages it bundles are versioned with it. Format:
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). MotionPR is an alpha: until `1.0`, any
prerelease may change the capture format or the API, and every such change is listed here.

## [0.2.0-alpha] — 2026-11-15

Firefox and WebKit become supported browser engines next to Chromium, each with its own
baseline. Capture schema and comparison schema stay at version 2: the new fields have defaults,
so 0.1 captures and comparisons read unchanged.

### Added

- **Firefox and WebKit.** `browser.name` accepts `"chromium"`, `"firefox"` and `"webkit"`
  (Playwright 1.65's builds: Chromium 158.0.8127.18, Firefox 159.0, WebKit 27.2). One capture
  pipeline serves all three; the in-page agent uses only Web Animations and DOM features all
  three implement. Native CSS transitions and animations, Web Animations, the GSAP, Anime.js and
  Lenis adapters, and the CLI are tested in each engine, as is the demo app (every intended
  change found, nothing else).
- **Per-browser baselines, captures, comparisons and reports**: `.motionpr/baseline/<browser>/`,
  `captures/<browser>/`, `comparison/<browser>/`, `report/<browser>/`. A run compares each engine
  with its own baseline only; accepting one engine's baseline never touches another's; a capture
  can only become the baseline of the engine it was taken with.
- **Multi-browser runs**: `--browser all` (or `chromium,webkit`, repeatable) on `capture`,
  `compare`, `run` and `baseline accept`. Engines run one after another against one web server;
  the exit code combines them (`2` before `1` before `0`); an engine that fails to launch does not
  stop the others. `report/index.html` lists every engine's report with its result, and the step
  summary has a section per engine. JSON: `{ kind: "motionpr-run", browsers: [...] }`.
- **Cross-browser comparison on request**: `compare --against <browser>` and `--cross-browser`.
  Declared timing and easing are compared as usual; pixel, geometry, keyframe serialization,
  start-offset and scroll differences are `uncertain`; `crossBrowser: true` and a
  `CROSS_BROWSER_COMPARISON` diagnostic mark the result.
- **CLI**: `install [browsers...]` and `install --all`; `--browser` on `capture`, `compare`, `run`,
  `baseline accept`, `report`, `doctor` and `demo`; `MOTIONPR_BROWSER`; `baseline migrate`;
  `baseline status` lists every engine; `doctor` checks every engine's binary and launches the
  selected ones, reporting Web Animations support, timer resolution and frame rate.
- **Launch settings per engine**: Chromium channels (`chrome`, `msedge`) apply to Chromium,
  Firefox channels (`moz-firefox*`) to Firefox, `executablePath` and `args` to the engine in
  `browser.name`, and the new `browser.firefoxUserPrefs` to Firefox.
- **Runtime metadata in every capture**: `environment.browser.channel` and `userAgent`,
  `environment.osRelease`, and `environment.capabilities` (Web Animations features, timer
  resolution, frame interval, device pixel ratio, emulated reduced motion), all read from the
  browser at runtime. `COARSE_TIMERS`, `LOW_FRAME_RATE` and `BROWSER_API_MISSING` diagnostics
  explain how precisely an engine could be observed.
- Comparison diagnostics `CROSS_BROWSER_COMPARISON` and `DEVICE_SCALE_FACTOR_DIFFERS`; error codes
  `BROWSER_MISMATCH` and `BROWSER_DEPENDENCIES_MISSING` (actionable Linux hint).
- Public API: `BROWSER_NAMES`, `parseBrowserSelection`, `browserPaths`, `resolveBaselineDir`,
  `launchBrowser`, `isBrowserInstalled`, `startProjectServers`, `ENGINE_DEPENDENT_CHANGES`,
  `CaptureOptions.browserName`, `CaptureProjectOptions.browserName`, `allowCrossBrowser`, and the
  `BrowserName`, `BrowserPaths` and `BrowserCapabilities` types.
- Documentation: a Browsers section (browser support, cross-browser testing, Chromium, Firefox,
  WebKit) and updated CLI, configuration, CI and reference pages.
- CI runs the browser suites and the demo expectations in Firefox and WebKit, in a matrix next to
  the Chromium job.

### Changed

- **Storage layout.** Captures, comparisons and reports moved into per-engine directories (see
  above). Baselines in the 0.1 layout (`baseline/capture.json`) are still read as the Chromium
  baseline; `motionpr baseline migrate`, or the next `baseline accept`, moves them to
  `baseline/chromium/`. Commit the move. `report/index.html` is now the index of every engine's
  report; each engine's report is `report/<browser>/index.html`.
- `run --json` with one engine adds a `browser` field; `baseline status --json` adds `baselines`
  (per engine) next to `baseline`.
- Terminal output, Markdown summaries and the report's top bar name the engine of each capture.
- `--browser` has no built-in default any more: it falls back to `MOTIONPR_BROWSER`, then to
  `browser.name`.
- Scroll peak velocity is derived between samples observed while the scroller moves, over
  intervals of at least 12 ms. Comparisons of existing Chromium captures can report slightly
  different velocity figures (captures are unchanged).

### Fixed

- Replay seeked clones with times computed from absolute clock readings; float error could land a
  sample just below a `steps()` boundary, which Firefox resolved to the previous step, so the same
  build could sample differently between runs. Seeking now uses window-relative times rounded to
  1 µs, in every engine.
- An animation finished as soon as it was created (`el.animate(…).finish()`, a common
  reduced-motion fallback) was dropped as "started before the interaction" because `finish()`
  back-dates its start. It is now recorded with its timing (`finishedOnCreation`, no samples).
- Scroll settling with fractional scroll positions (Firefox) ended during the slow tail of a Lenis
  ease-out, a few pixels short of the destination; stillness is now judged by the drift over the
  still period.
- Peak scroll velocities derived from two samples 1 ms apart (1 ms timers in Firefox and WebKit)
  reached implausible values ("78 px/ms"), and timing the first move from the re-stamped rest
  sample made the same build's peak velocity differ by up to 90% between WebKit runs.
- With 1 ms timers, a scroller's last still sample and first moved sample can share a timestamp
  (Lenis in WebKit emits both in one millisecond). The moved one was kept as the rest position, so
  the same build's scroll seemed to start a frame's distance later (a false "Scroll starts at"
  warning, 87 px in the demo). The rest sample is now always one from before the movement.
- Firefox returns keyframe offsets in single precision (`0.4000000059604645`); offsets are rounded
  to 6 decimals.
- Trigger latency was measured from a checkpoint window's first interaction instead of the one
  that caused the motion. In "scrollIntoView, waitForAnimations, click" it included the settle wait,
  so two runs of the same build could differ by over 100 ms on a loaded machine (seen in WebKit on
  CI). It is now measured from the last interaction before the motion, which is also the recorded
  `window.trigger`. Latencies are compared only when both captures name the same trigger, so
  baselines from 0.1 do not report a latency change.
- Sampled path and end-value differences of an animation the app cancelled mid-way were graded
  like any other; where a cancelled animation stopped depends on when the cancel ran (a timer under
  load), so they are now `uncertain`. Declared timing changes stay definite.
- The report artifacts page listed a `comparison.json` in the report directory; it lives in
  `.motionpr/comparison/<browser>/`.

### Known limitations

- Only Playwright's builds are tested; WebKit is Playwright's WebKit, not Safari. Installed
  browsers work through `browser.channel` / `executablePath` but are not covered by tests.
- Engines in a multi-browser run run sequentially. Windows is not covered by CI for any engine.
- Headless WebKit renders at 30 fps on macOS and Firefox and WebKit report time in 1 ms steps, so
  live observations (start offsets, scroll samples) are coarser there.
- Cross-browser comparisons are investigative: engine-dependent differences are always
  `uncertain`.

## [0.1.0-alpha.1] — 2026-11-14

The project moved to [`github.com/erenthedeveloper0/motionpr`](https://github.com/erenthedeveloper0/motionpr)
and its website to [`erenthedeveloper0.github.io/motionpr`](https://erenthedeveloper0.github.io/motionpr/).
No change to the capture format, the API or the CLI's behaviour.

### Fixed

- The package's homepage, repository and issue links, the README's links and images, and the
  documentation links printed by the CLI point to the new addresses. In `0.1.0-alpha` they still
  point to `motion-pr`, and its website links no longer resolve.

## [0.1.0-alpha] — 2026-11-13

The first public release, published on npm's `alpha` dist-tag.

Two development versions came before it, `0.1.0-alpha.0` and `0.2.0-alpha.0`. Neither was
published or tagged, so this release collects their work and the version starts again at
`0.1.0-alpha`. Captures written by those builds (capture schema 1 and 2) are read and migrated.

### Added

- **Capture engine.** An in-page agent, injected before the app's scripts, that discovers CSS
  transitions, CSS animations and Web Animations (`document.getAnimations()` every frame and a
  wrapped `Element.prototype.animate`), waits for motion to settle, and replays each checkpoint
  window deterministically: native animations through paused clones, engines with callbacks
  muted. It samples computed styles, decomposed transforms and boxes, renders content-addressed
  filmstrip frames and a settled screenshot, and restores every animation afterwards.
- **Records** for the three kinds of motion: `AnimationRecord` (time → value),
  `TimelineRecord` (GSAP and Anime.js timelines with labels) and `ScrollMotionRecord` (time →
  position, recorded live, never replayed), with per-field provenance (`declared`, `observed`,
  `inferred`, `unavailable`) and correlations between scroll and animations.
- **GSAP adapter** (`@erenthedeveloper0/motionpr/gsap`): tweens, timelines, labels, staggers,
  keyframes, repeats, reversed playback and time scale; GSAP's own ease functions sampled, so any
  ease (CustomEase included) is compared exactly; ScrollTrigger animations as metadata plus a live
  progress trace; `dispose()` and `getDiagnostics()`.
- **Anime.js v4 adapter** (`@erenthedeveloper0/motionpr/animejs`): `wrapAnimate`, `wrapTimeline`,
  `wrapWaapi`, `track`, `dispose`. Per-target records for staggers (function values recorded
  transparently), timelines with labels, custom eases sampled without invented names, and
  `waapi.animate()` animations recorded once.
- **Lenis adapter** (`@erenthedeveloper0/motionpr/lenis`): `motionprLenis.attach(lenis)` records
  `actualScroll`, `animatedScroll`, `targetScroll`, velocity, direction and state without driving,
  reconfiguring or destroying Lenis.
- **Comparison engine.** Three-pass matching (exact, element, fuzzy); timing, easing curves (65
  samples, `compareEasingSamples`), iterations, direction, playback rate, fill, keyframe values,
  sampled trajectories, opacity and size; stagger intervals; timeline duration, repeat, speed and
  labels; scroll position, settle duration, normalized curve, peak velocity, overshoot and lag;
  scroll-linked progress at the same scroll position; pixelmatch of settled screenshots and
  per-frame divergence. Severities from named, overridable rules; low-confidence matches and
  incomplete data reported as `uncertain`.
- **Report viewer.** One offline HTML file: side by side, overlay, onion skin with motion paths,
  wipe, difference and pixel-diff modes; a shared timeline with delays, durations and easing
  curves, frame divergence, scroll and timeline lanes; an inspector with timing tables, easing
  curves and sampled values; a differences explorer with engine filters; keyboard navigation and
  a command menu; Markdown export.
- **CLI.** `init` (framework, package-manager and engine detection; optional GitHub workflow with
  SHA-pinned actions), `install`, `capture`, `compare`, `run`, `baseline accept|status`, `report`,
  `doctor` (including whether each adapter registers in the page) and `demo`. JSON and Markdown
  output, `$GITHUB_STEP_SUMMARY`, exit codes `0`/`1`/`2`, clean shutdown on Ctrl+C.
- **Scenario steps** for navigation, clicks, hovers, pointer moves, typing, key presses, instant
  and smooth scrolling (`scrollTo`, Lenis-aware), real wheel input, and waiting for animations or
  for scroll to settle.
- **Public API**: `defineConfig`, `loadConfig`, `captureProject`, `compareDirs`,
  `compareCaptures`, `writeReport`, easing and value helpers, schemas and types.
- **Demo app** with eleven deliberate motion changes across native CSS, WAAPI, GSAP, Anime.js and
  Lenis, captured by `motionpr demo`.
- **Website** (static, GitHub Pages) built on a real capture of the demo app: a landing page whose
  hero replays one animation's baseline and candidate on one clock, a scroll-driven walk through
  capture → analyze → compare → inspect → report, and the full differences explorer; 61
  documentation pages with search and live components embedded in them (engine demos, timelines,
  easing and scroll laboratories); an interactive demo of the demo app's two variants and its
  report; and a playground that grades changes with MotionPR's own comparison code in the
  browser. Soft navigation between pages, choreographed transitions, and full support for
  reduced motion and keyboard use.

### Security

- Capture and comparison files are validated when read, including asset ids and paths, so a
  capture downloaded from CI cannot make MotionPR read or write outside its directory.
- Reports embed data as inert JSON and render all text as text; they load nothing remote.
- Filled values are never written to captures or reports; inputs are masked in screenshots; query
  values in recorded URLs are redacted by default. MotionPR sends no telemetry.

[0.2.0-alpha]: https://github.com/erenthedeveloper0/motionpr/releases/tag/v0.2.0-alpha
[0.1.0-alpha.1]: https://github.com/erenthedeveloper0/motionpr/releases/tag/v0.1.0-alpha.1
[0.1.0-alpha]: https://github.com/erenthedeveloper0/motionpr/releases/tag/v0.1.0-alpha
