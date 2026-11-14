# MotionPR build status

Living record of what is implemented and verified. **COMPLETE** means implemented _and_ covered by
tests that ran and passed on the date of the verification log below (macOS arm64, Node.js 24.21,
Chromium 158 from Playwright 1.65, unless a row says otherwise).

Version: **0.1.0-alpha** (first public release, not yet published to npm) · capture schema **2** ·
comparison schema **2**

## Status

| Area                                                                          | Status   | Evidence / notes                                                                                                 |
| ----------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| Configuration, schemas, migrations (v1 → v2)                                  | COMPLETE | `packages/core/tests`, including `migration.test.ts`                                                             |
| Capture engine (native CSS, WAAPI, deterministic replay, filmstrips, privacy) | COMPLETE | `packages/capture/tests` (browser tests)                                                                         |
| Adapter contract (capabilities, ranges, claims, diagnostics, dispose)         | COMPLETE | `packages/core/src/protocol.ts`; exercised by every adapter suite                                                |
| GSAP adapter (`@erenthedeveloper0/motionpr/gsap`)                             | COMPLETE | browser tests; timelines → `TimelineRecord`; `SUPPORTED_GSAP_RANGE` now exported as documented                   |
| GSAP ScrollTrigger                                                            | PARTIAL  | Metadata, live progress trace, progress-vs-scroll comparison; tween values are not sampled                       |
| Anime.js adapter (`@erenthedeveloper0/motionpr/animejs`)                      | COMPLETE | browser tests and unit tests (ease port matches Anime.js 4.5)                                                    |
| Lenis adapter (`@erenthedeveloper0/motionpr/lenis`)                           | COMPLETE | browser tests (auto/external/no RAF, reduced motion, horizontal, stopped, lifecycle)                             |
| Scroll motion (records, settle detection, comparison)                         | COMPLETE | `comparison/tests/scroll.test.ts`, Lenis suite, demo `lenis-journal`                                             |
| Comparison engine (animations, stagger, visual, timelines, scroll)            | COMPLETE | `packages/comparison/tests`                                                                                      |
| Report generator and viewer                                                   | COMPLETE | `packages/report/tests`, `e2e/report.spec.ts`                                                                    |
| CLI (`init install capture compare run baseline report doctor demo`)          | COMPLETE | `packages/cli/tests`; the getting-started flow was also run by hand (below)                                      |
| Demo app (11 scenarios across all engines)                                    | COMPLETE | `e2e/demo-expectations.spec.ts`: every intended change found, no false positives                                 |
| Documentation (61 pages in 8 sections)                                        | COMPLETE | `scripts/tests/docs.test.ts`: exports, steps, commands, config keys, links, nav, config examples, component data |
| Website (`apps/docs`: landing, docs, demo, playground)                        | COMPLETE | `e2e/docs-site.spec.ts` (18 tests, incl. clipped-text and sidebar checks); not deployed until Pages is enabled   |
| Packaging (`pnpm pack:check --install`)                                       | COMPLETE | allowlist, exports, types (skipLibCheck off), clean-project install, `npx motionpr`; also on Node 22.23.5        |
| Manual publishing (`pnpm release:prepare`, PUBLISHING.md)                     | COMPLETE | `npm publish ./release/…tgz --dry-run` passed; the folder-publish guard refuses `npm publish` in `packages/cli`  |
| GitHub: CI, Pages, Dependabot, templates, CODEOWNERS                          | PARTIAL  | Pushed to `main`; repository settings not applied yet ([REPOSITORY_SETUP.md](REPOSITORY_SETUP.md))               |
| Benchmarks (`pnpm bench`)                                                     | COMPLETE | Measurements below (session 2)                                                                                   |
| Example projects (`examples/`)                                                | MISSING  | Planned ([ROADMAP.md](ROADMAP.md)); the demo app and the docs serve as examples                                  |
| Windows                                                                       | MISSING  | Paths handled in code; no CI job                                                                                 |
| Firefox / WebKit                                                              | MISSING  | Chromium only (documented)                                                                                       |
| npm publication                                                               | NOT DONE | Manual, by the maintainer: [PUBLISHING.md](PUBLISHING.md)                                                        |

## Verification log (2026-11-13, final pass before the first push)

| Command                                                                                                  | Result                                                                                                           |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `pnpm build`                                                                                             | pass                                                                                                             |
| `pnpm typecheck`                                                                                         | pass                                                                                                             |
| `pnpm lint`                                                                                              | pass                                                                                                             |
| `pnpm format:check`                                                                                      | pass                                                                                                             |
| `pnpm version:check`                                                                                     | pass (`all packages at 0.1.0-alpha`)                                                                             |
| `pnpm test`                                                                                              | pass: 13 files, 223 tests (includes the documentation checks)                                                    |
| `pnpm test:integration`                                                                                  | pass: 5 files, 69 tests (real Chromium: capture engine, adapters, CLI)                                           |
| `pnpm test:e2e`                                                                                          | pass: 43 tests (demo expectations, report viewer, website)                                                       |
| `node scripts/pack-check.mjs --install`                                                                  | pass: 37 files, 730 kB packed; clean-project install, `npx motionpr`, all four entry points, consumer type-check |
| `pack-check --install` on Node 22.23.5                                                                   | pass in the previous session (no Node 22 on this machine now; CI's `package on Node 22` job reruns it)           |
| `npm publish ./release/erenthedeveloper0-motionpr-0.1.0-alpha.tgz --access public --tag alpha --dry-run` | pass: 37 files, "Publishing to https://registry.npmjs.org/ with tag alpha and public access (dry-run)"           |
| `pnpm build:docs`                                                                                        | 61 doc pages, 322 search entries, 65 sitemap URLs                                                                |
| Getting-started flow by hand (tutorial page: `run` → `baseline accept` → change → `run`)                 | previous session: outputs match the docs; exit codes 0, 2 (refused without `--yes`), 1                           |

## GitHub

Repository: [`erenthedeveloper0/motion-pr`](https://github.com/erenthedeveloper0/motion-pr), public,
default branch `main`. It existed and was empty before the first push; history starts with the
release commit, authored by the maintainer's configured Git identity.

| Item                                                     | State                                                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Source, tests, docs, website, brand, community files     | in the repository                                                                          |
| CI (`ci.yml`), Pages (`pages.yml`)                       | in the repository; they run on GitHub after the push (results there, not verified locally) |
| Description, website URL, topics, social preview         | **not set**: no GitHub CLI or API token here; values and commands in REPOSITORY_SETUP.md   |
| GitHub Pages                                             | **not enabled**: the Pages workflow skips deployment until Source is set to GitHub Actions |
| Private vulnerability reporting, Dependabot alerts, rule | **not set**: REPOSITORY_SETUP.md                                                           |
| Release tag `v0.1.0-alpha`                               | **not created**: made at publish time (PUBLISHING.md, step 4)                              |

## Benchmarks (`pnpm bench`, darwin-arm64, Node 24.21, session 2)

| Case                                         | compareCaptures                                     | buildModel | JSON.parse |
| -------------------------------------------- | --------------------------------------------------- | ---------- | ---------- |
| 400 animations (3.7 MB capture)              | 6 ms                                                | 0.7 ms     | 13 ms      |
| 6 000 animations (55 MB capture)             | 61 ms                                               | 8 ms       | 209 ms     |
| 24 000 animations (220 MB capture)           | 227 ms                                              | 22 ms      | 847 ms     |
| scrollMetrics, 100 records × 3 000 samples   | 11 ms                                               |            |            |
| Real demo capture: 57 animations per variant | 1.6 MB JSON (~10 kB per record), report HTML 2.5 MB |            |            |

## Decisions (release preparation)

- **Version reset to `0.1.0-alpha`.** The development versions `0.1.0-alpha.0` and
  `0.2.0-alpha.0` were never tagged or published (`npm view` returned 404, no git tags, no
  commits), so the first public release restarts at `0.1.0-alpha`. Captures written by those builds
  still read (schema 1 and 2 are both supported).
- **`alpha` dist-tag** instead of `next`: `distTagFor()` in `packages/core/src/version.ts` is the
  single rule, used by the CLI's install hints and by `scripts/release-prepare.mjs`.
- **Manual publishing only.** The release workflow, `scripts/publish.mjs` and changesets were
  removed; `publishConfig.provenance` was removed (it fails outside CI). A unit test fails if any
  workflow mentions npm publishing or an npm token.
- **The tarball is what gets published**, because `npm publish` in `packages/cli` would ship
  `catalog:` specifiers. A `prepublishOnly` guard refuses folder publishes; npm does not run it
  for tarballs. The path needs `./` (npm otherwise reads `release/x.tgz` as a GitHub shorthand).
- **Docs restructured** into Overview, Getting started, Core features, Integrations, CLI,
  Configuration, CI/CD and Advanced. `docs/integrations/*` paths were kept because runtime hints
  point at them; other hints were updated.
- **The website shows real data only**: `apps/docs/data/site-data.json` is extracted from a real
  capture of the demo app; the playground and labs run MotionPR's own easing and comparison code
  in the browser and say so.

## Bugs found and fixed (release preparation)

| Bug                                                                                                         | Severity       | Now covered by                                                   |
| ----------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------- |
| `@erenthedeveloper0/motionpr/gsap` did not export `SUPPORTED_GSAP_RANGE`, which the docs and changelog list | Medium         | `pack-check` named-export check, consumer type-check             |
| `publishConfig.provenance: true` would make a manual `npm publish` fail                                     | High (release) | `docs.test.ts` asserts `publishConfig` is `{ access: "public" }` |
| `npm publish release/<file>.tgz` resolves to a GitHub repository, not the file                              | High (release) | `release-prepare.mjs` and PUBLISHING.md use `./release/…`        |
| Capture hint linked a non-existent `docs/reference/browser-support.md`                                      | Low            | hint now links `docs/advanced/support-matrix.md`                 |
| Docs claimed CI uploads the capture; the generated workflow uploads only the report                         | Low            | Baseline management documents the extra upload step              |
| Docs said the generated workflow's Node version follows `init`'s; it is fixed at 24                         | Low            | corrected                                                        |
| API docs said the schema versions were 1 and listed two entry points                                        | Low            | corrected (2; four entry points)                                 |
| `webServer.url` schema comment said "any status below 500"; the code accepts 2xx, 3xx, 400–403              | Low            | comment corrected                                                |

## Website QA (final pass, 2026-11-13)

The production build was served under `/motion-pr/` and driven in Chromium at 1440, 1280, 768 and
390 px (phone emulation with touch), with and without reduced motion: every one of the 65 routes
loaded directly; each landing section, docs page type, the demo and the playground were checked in
screenshots; text clipping was measured on every route at 390 and 768 px; a docs-to-docs
transition was filmed frame by frame; and the site's inspection hook confirmed that leaving a page
leaves no components, ScrollTriggers, frame loops or Lenis instance behind.

| Bug                                                                                                                                                                                                                                                                                                      | Severity | Fix                                                                                          | Now covered by                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| On phones the hero title, lede and install command, the engines panel and the closing CTA were cut off at the right edge: grid columns sized by the long, unbreakable install command and code lines. `scrollWidth` stayed equal to the viewport (the page clips overflow), so the existing check passed | High     | `minmax(0, 1fr)` columns; the install command scrolls inside its pill instead of widening it | phone test now measures clipped text on every checked route (fails with the old CSS) |
| Moving between documentation pages faded the sidebar out and in, and reset its scroll position                                                                                                                                                                                                           | Medium   | only the reading column (article and contents) transitions; the sidebar keeps its scroll     | `between documentation pages the sidebar stays still…` (fails with the old router)   |
| The engine demos inside documentation pages listed the same finding once per element (GSAP: "Duration 600ms → 900ms" twice)                                                                                                                                                                              | Low      | identical findings grouped with an element count                                             | visual check                                                                         |
| Chart labels in the easing lab and scroll chart rendered at ~6 px on phones                                                                                                                                                                                                                              | Low      | larger label sizes in chart units under 560 px                                               | visual check                                                                         |
| The repository identity test mistook the word `CODEOWNERS` in BUILD_STATUS.md for an unfilled owner placeholder, failing `pnpm test`                                                                                                                                                                     | Low      | whole-word match                                                                             | `docs.test.ts`                                                                       |
| A first-generation static page (`apps/docs/src/index.html`, `site.css`, `explainer.js`) was still in the source tree, unused by the build                                                                                                                                                                | Low      | removed                                                                                      | n/a                                                                                  |

Documentation gained live components where a page described them only in prose: the side-by-side
engine demo on the GSAP, Anime.js and Lenis pages (CSS and WAAPI already had it), the
baseline/candidate instrument and a link to the published demo report on HTML reports, and the
differences explorer on Animation identification. 14 of the 61 pages now embed at least one live
component.
