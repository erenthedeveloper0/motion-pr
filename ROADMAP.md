# Roadmap

What comes after `0.1.0-alpha`, roughly in order. Nothing here is built yet; what is built is in
[the README's Status section](README.md#status) and [Limitations](docs/advanced/limitations.md).
Order changes with what users run into; open an issue to argue for something.

## Towards a beta

1. **Example projects.** Small, runnable projects (plain HTML, React with GSAP, Astro with Lenis)
   with their scenarios and committed baselines, tested in CI like the demo app.
2. **Windows in CI.** Paths are handled in code; nothing runs it on Windows yet.
3. **Scroll-linked tween values.** Sample the values ScrollTrigger animations write at recorded
   scroll positions, so a changed parallax distance is found, not only a moved `start`/`end`.
4. **Nested native scroll containers.** Record scroll motion of overflow containers, not only the
   document scroller, and let `scrollTo`/`wheel` steps target them.
5. **Shadow DOM.** Selectors that pierce shadow roots for replay, with browser tests.
6. **Adapter protocol 2.** Freeze the adapter contract for custom engines before `1.0`, with a
   conformance suite adapters can run.

## Later

- Firefox and WebKit captures, with per-browser baselines.
- Comparing against the base branch as a first-class `motionpr run` mode, not a workflow recipe.
- Report deep links (open a report at a scenario, checkpoint and time).
- Smaller captures: an optional compact JSON format for large suites.
- More engines through adapters: Motion (Framer Motion), Web Components libraries, canvas renderers.
- Versioned documentation on the website, once more than one release is in use.

## Not planned

- A hosted service, accounts or telemetry. MotionPR runs where your code runs.
- Treating uncertain findings as regressions by default.
