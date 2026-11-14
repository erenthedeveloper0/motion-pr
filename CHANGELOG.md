# Changelog

All notable changes to MotionPR. The public package is `@erenthedeveloper0/motionpr`; the
workspace packages it bundles are versioned with it. Format:
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). MotionPR is an alpha: until `1.0`, any
prerelease may change the capture format or the API, and every such change is listed here.

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

[0.1.0-alpha]: https://github.com/erenthedeveloper0/motion-pr/releases/tag/v0.1.0-alpha
