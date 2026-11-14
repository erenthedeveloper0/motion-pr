# npm package audit

What `@erenthedeveloper0/motionpr@0.1.0-alpha` contains, what it deliberately leaves out, and how
that was checked. This file documents the distribution; it lives in the repository and is **not**
part of the package.

Audited on 2026-11-13 against `release/erenthedeveloper0-motionpr-0.1.0-alpha.tgz`, the tarball
`pnpm release:prepare` produced (sha1 `4aa977638615cb2a516dcd79782da46ceadf6732`). Rebuilding
produces a new tarball; rerun the commands at the end before publishing.

## Identity

|                 |                                                                                   |
| --------------- | --------------------------------------------------------------------------------- |
| Name            | `@erenthedeveloper0/motionpr` (the only published package)                        |
| Version         | `0.1.0-alpha`, dist-tag `alpha`                                                   |
| Registry        | `https://registry.npmjs.org/`, `publishConfig: { "access": "public" }`            |
| npm status      | not published (`npm view` returns 404 on 2026-11-13)                              |
| Built from      | `packages/cli`, bundling the private workspace packages `@motionpr/*`             |
| Node.js         | `engines.node: ">=22.12.0"`                                                       |
| License         | MIT (`LICENSE`), third-party notices for bundled code in `THIRD_PARTY_NOTICES.md` |
| Install command | `npm install -D @erenthedeveloper0/motionpr@alpha`                                |
| CLI             | `bin: { "motionpr": "./dist/bin.js" }`, run as `npx motionpr`                     |

## Contents: 37 files, 747.3 kB packed, 2.4 MB unpacked

The `files` allowlist in `packages/cli/package.json` is `dist`, `README.md`, `LICENSE` and
`THIRD_PARTY_NOTICES.md` (npm adds `package.json`). `scripts/pack-check.mjs` compares the packed
file list against its own expected list and fails on anything extra.

| Path                                             | Purpose                                                                                        |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `dist/bin.js`                                    | The `motionpr` command                                                                         |
| `dist/index.js`, `dist/index.d.ts`               | Node API: `defineConfig`, `loadConfig`, `compareCaptures`, types, `MOTIONPR_VERSION`           |
| `dist/api-*.js`, `dist/src-*.js`                 | Shared chunks (capture engine, comparison, report generator)                                   |
| `dist/gsap.js`, `dist/gsap.d.ts`                 | `@erenthedeveloper0/motionpr/gsap`: browser adapter, no dependencies                           |
| `dist/animejs.js`, `dist/animejs.d.ts`           | `@erenthedeveloper0/motionpr/animejs`: browser instrumentation, does not bundle Anime.js       |
| `dist/lenis.js`, `dist/lenis.d.ts`               | `@erenthedeveloper0/motionpr/lenis`: browser adapter, does not bundle Lenis                    |
| `dist/*.js.map`                                  | Source maps (stack traces point at real source lines)                                          |
| `dist/viewer/index.html`                         | The offline report viewer, inlined into every generated report                                 |
| `dist/demo-app/**`                               | The demo app for `npx motionpr demo`, with its vendored GSAP, Anime.js and Lenis (see notices) |
| `README.md`, `LICENSE`, `THIRD_PARTY_NOTICES.md` | Copied from the repository root at build time                                                  |

## Left out on purpose

| Not in the package                                                                                                                        | Where it is instead               |
| ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| TypeScript sources and the private `@motionpr/*` workspace packages                                                                       | repository (`packages/`), bundled |
| Tests, fixtures, benchmarks, e2e specs                                                                                                    | repository                        |
| Documentation sources (`docs/`) and the website (`apps/docs`)                                                                             | repository, GitHub Pages          |
| BUILD_STATUS, ROADMAP, CHANGELOG, PUBLISHING, RELEASE_CHECKLIST, this file, REPOSITORY_SETUP, ARCHITECTURE, CONTRIBUTING, community files | repository                        |
| Brand source files (`brand/`)                                                                                                             | repository                        |
| Release and maintenance scripts (`scripts/`)                                                                                              | repository                        |
| `.github/` (workflows, templates), editor and lint configuration                                                                          | repository                        |

## Dependencies

Exact versions, written by `pnpm pack` from the workspace catalog. No `catalog:` or `workspace:`
specifier survives into the tarball (checked by `pack-check`).

| Runtime dependency | Version | Why                                                                      |
| ------------------ | ------- | ------------------------------------------------------------------------ |
| `playwright-core`  | 1.65.0  | Drives Chromium; no browser download on install (`npx motionpr install`) |
| `commander`        | 15.1.0  | Command-line parsing                                                     |
| `@clack/prompts`   | 1.9.0   | Interactive `init` and the `baseline accept` confirmation                |
| `picocolors`       | 1.1.1   | Terminal colour                                                          |
| `jiti`             | 2.7.0   | Loads `motionpr.config.ts` without a build step                          |
| `zod`              | 4.6.7   | Validates configuration and capture files                                |
| `pixelmatch`       | 8.0.0   | Settled-screenshot comparison                                            |
| `pngjs`            | 7.0.0   | PNG decoding for the pixel comparison                                    |

Optional peer dependencies, needed only by the adapter that uses them: `gsap ^3.12.0`,
`animejs ^4.0.0`, `lenis ^1.1.0`. Installing MotionPR never installs an animation library.

The published manifest still lists `devDependencies` (including the private `@motionpr/*`
names). npm never installs a dependency's `devDependencies`, so consumers are unaffected.

## Lifecycle scripts

The packed manifest has `build` and `typecheck` only: no `install`, `postinstall` or `prepare`
script runs on a user's machine. The `prepublishOnly` guard in the workspace manifest (it refuses
`npm publish` inside `packages/cli`) does not reach the tarball.

## Verification (2026-11-13)

| Check                                                                                        | Result                                                                                       |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `pnpm release:prepare --skip-tests` (build, `pack-check --install`, `npm publish --dry-run`) | pass                                                                                         |
| Allowlist                                                                                    | 37 files, nothing outside `dist/` and the three root files                                   |
| Clean-project install of the tarball                                                         | pass; `npx motionpr` resolves the installed bin and prints `0.1.0-alpha`                     |
| Entry points                                                                                 | `.`, `./gsap`, `./animejs`, `./lenis` resolve through the exports map; named exports checked |
| Types                                                                                        | a consumer project type-checks against the published declarations (`skipLibCheck` off)       |
| Version agreement                                                                            | `MOTIONPR_VERSION` and `package.json` both `0.1.0-alpha`                                     |
| Dry run                                                                                      | `Publishing to https://registry.npmjs.org/ with tag alpha and public access (dry-run)`       |
| Registry                                                                                     | `@erenthedeveloper0/motionpr` not found (404): the name is free, nothing was published       |

Rerun before publishing:

```bash
pnpm release:prepare                                  # all gates, including the test suites
tar -tzf release/erenthedeveloper0-motionpr-0.1.0-alpha.tgz
npm publish ./release/erenthedeveloper0-motionpr-0.1.0-alpha.tgz --access public --tag alpha --dry-run
```
