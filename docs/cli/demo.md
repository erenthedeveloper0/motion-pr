---
title: motionpr demo
description: Capture the bundled demo app in two versions, compare them and open a real report.
---

# `motionpr demo`

```bash
npx motionpr demo [options]
```

Captures the bundled demonstration app (Halcyon Studio, a fictional design studio) twice — the
baseline variant and a candidate with deliberate motion changes — compares them and opens the
report. It needs Chromium (`npx motionpr install`) but no project and no config.

| Option                 | Description                                                         |
| ---------------------- | ------------------------------------------------------------------- |
| `-o, --output <dir>`   | Where to write the demo output (default: the system temp directory) |
| `-s, --scenario <id>`  | Only some demo scenarios; repeatable                                |
| `--open` / `--no-open` | Open the report (default: when interactive)                         |

## The changes it contains

| Scenario       | Engine            | Change in the candidate                                             |
| -------------- | ----------------- | ------------------------------------------------------------------- |
| navigation     | CSS transition    | panel duration 320 → 560 ms, easing expo-out → ease-in-out          |
| modal          | CSS animation     | dialog entrance easing now overshoots                               |
| work-grid      | WAAPI             | stagger 70 → 120 ms; a decorative glow without an id changes        |
| faq            | CSS transition    | answer reveal gains a 120 ms delay                                  |
| cta-hover      | CSS transition    | hover lift −2 → −6 px with a scale-up                               |
| image-reveal   | CSS animation     | clip-path reveal removed                                            |
| features       | CSS animation     | a new "New" badge animation is added                                |
| gsap-intro     | GSAP              | timeline ease power3.out → back.out(1.7), duration 0.6 s → 0.9 s    |
| anime-services | Anime.js          | stagger 60 → 110 ms                                                 |
| anime-process  | Anime.js timeline | "design" moves from `-=120` to `+=120`; bar 700 → 900 ms            |
| lenis-journal  | Lenis + GSAP      | Lenis `lerp` 0.1 → 0.06; ScrollTrigger parallax starts at "top 70%" |

Every one of these is found, and nothing else is reported: the repository's end-to-end suite
(`e2e/demo-expectations.spec.ts`) checks both. The result is 55 differences: 1 critical, 35
warnings, 18 info and 1 uncertain. The comparison fails on purpose (an animation was removed,
which is critical by default); `demo` itself exits `0`, and with `--json` it prints the `exitCode`
that `run` would have returned (`1`).

```bash
npx @erenthedeveloper0/motionpr@alpha demo                 # without installing anything
npx motionpr demo -s navigation -s gsap-intro --no-open     # two scenarios, print the path
```

The same report is published on the website: [demo report](https://erenthedeveloper0.github.io/motionpr/report/).
