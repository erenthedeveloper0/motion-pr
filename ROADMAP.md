# Roadmap

What comes after `0.3.0-alpha`, roughly in order. Nothing under "Towards a beta" or "Later" is
built yet; what is built is in [the changelog](CHANGELOG.md) and
[Limitations](docs/advanced/limitations.md). Order changes with what users run into; open an
issue to argue for something.

## Done

- **Stable ScrollTrigger positions under native smooth scrolling** (unreleased, after
  `0.3.0-alpha`). Where a ScrollTrigger animation runs in the scroll is compared from the
  `start`/`end` positions ScrollTrigger resolved, and its `scrub` and `toggleActions` as scroll
  settings, instead of relating two live recordings; two runs of one build now agree in Chromium,
  Firefox and WebKit. Captures without positions keep the progress comparison. See
  [GSAP: ScrollTrigger](docs/integrations/gsap.md#scrolltrigger).
- **Windows in CI** (`0.3.0-alpha`). The unit tests, the Chromium
  browser suites, the demo app's expectations and the packaged CLI run on `windows-latest`.
  Firefox and WebKit on Windows are not covered yet.
- **Scroll-linked tween values** (`0.3.0-alpha`). GSAP ScrollTrigger
  animations are sampled at the progress the scroll reached and compared at the same progress, so
  a changed parallax distance is found, not only a moved `start`/`end`. Repeating ScrollTrigger
  animations stay timing-only. See [GSAP: ScrollTrigger](docs/integrations/gsap.md#scrolltrigger).
- **Firefox and WebKit captures, with per-browser baselines** (`0.2.0-alpha`). Chromium, Firefox
  and WebKit through one capture pipeline; baselines, captures, comparisons and reports per
  engine; `--browser all`; explicit cross-browser comparison; every browser suite and the demo
  app's expectations run in each engine. See [Browser support](docs/browsers/support.md).

## Towards a beta

1. **Example projects.** Small, runnable projects (plain HTML, React with GSAP, Astro with Lenis)
   with their scenarios and committed baselines, tested in CI like the demo app.
2. **Nested native scroll containers.** Record scroll motion of overflow containers, not only the
   document scroller, and let `scrollTo`/`wheel` steps target them.
3. **Shadow DOM.** Selectors that pierce shadow roots for replay, with browser tests.
4. **Adapter protocol 2.** Freeze the adapter contract for custom engines before `1.0`, with a
   conformance suite adapters can run.

## Later

- Engines in parallel within one `--browser all` run (today they run one after another; a CI
  matrix runs them in parallel).
- Comparing against the base branch as a first-class `motionpr run` mode, not a workflow recipe.
- Report deep links (open a report at a scenario, checkpoint and time).
- Smaller captures: an optional compact JSON format for large suites.
- More engines through adapters: Motion (Framer Motion), Web Components libraries, canvas renderers.
- Versioned documentation on the website, once more than one release is in use.

## Not planned

- A hosted service, accounts or telemetry. MotionPR runs where your code runs.
- Treating uncertain findings as regressions by default.
