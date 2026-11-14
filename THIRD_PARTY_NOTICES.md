# Third-party notices

The `@erenthedeveloper0/motionpr` npm package **bundles** the following third-party code. Runtime dependencies
installed from npm (`playwright-core`, `zod`, `commander`, `@clack/prompts`, `jiti`,
`picocolors`, `pixelmatch`, `pngjs`) are not bundled and keep their own licenses.

The browser entry points `@erenthedeveloper0/motionpr/gsap`, `@erenthedeveloper0/motionpr/animejs` and `@erenthedeveloper0/motionpr/lenis` contain only
MotionPR code; they do not include GSAP, Anime.js or Lenis.

## In the report viewer (`dist/viewer/index.html`, copied into every generated report)

| Component                       | License                                                              |
| ------------------------------- | -------------------------------------------------------------------- |
| React, React DOM, scheduler     | MIT, Copyright (c) Meta Platforms, Inc. and affiliates               |
| GSAP (core)                     | GSAP Standard "No Charge" License, https://gsap.com/standard-license |
| Geist, Geist Mono fonts         | SIL Open Font License 1.1, Copyright (c) Vercel                      |
| Tailwind CSS (generated styles) | MIT, Copyright (c) Tailwind Labs, Inc.                               |

## In the demonstration app (`dist/demo-app/`, used by `motionpr demo`)

| Component                   | License                                                              |
| --------------------------- | -------------------------------------------------------------------- |
| GSAP core and ScrollTrigger | GSAP Standard "No Charge" License, https://gsap.com/standard-license |
| Anime.js 4.5.0              | MIT, Copyright (c) Julian Garnier                                    |
| Lenis 1.3.27                | MIT, Copyright (c) darkroom.engineering                              |
| Geist, Geist Mono fonts     | SIL Open Font License 1.1, Copyright (c) Vercel                      |

The demo's "Halcyon Studio" content is fictional.

## In the website (`apps/docs`, not part of the npm package)

| Component                                  | License                                                              |
| ------------------------------------------ | -------------------------------------------------------------------- |
| GSAP core, ScrollTrigger, Flip, CustomEase | GSAP Standard "No Charge" License, https://gsap.com/standard-license |
| Lenis 1.3.27                               | MIT, Copyright (c) darkroom.engineering                              |
| Anime.js 4.5.0                             | MIT, Copyright (c) Julian Garnier                                    |
| Shiki (build time only)                    | MIT, Copyright (c) Pine Wu, Anthony Fu                               |
| Geist, Geist Mono fonts                    | SIL Open Font License 1.1, Copyright (c) Vercel                      |
