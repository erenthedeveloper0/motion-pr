---
title: Viewports
description: Run every scenario at several screen sizes and pixel ratios.
---

# Viewports

Without `browser.viewports`, every scenario runs once at `browser.viewport` (1440 × 900), and its
key ends in `@default`. With named viewports, each scenario runs once per viewport, each time in a
fresh browser context:

```ts
browser: {
  viewports: [
    { name: "desktop", width: 1440, height: 900 },
    { name: "tablet", width: 834, height: 1112, deviceScaleFactor: 2 },
    { name: "mobile", width: 390, height: 844, deviceScaleFactor: 3 },
  ],
},
```

| Field               | Rules                                                        |
| ------------------- | ------------------------------------------------------------ |
| `name`              | Letters, digits, `.`, `_`, `-`; used in keys (`menu@mobile`) |
| `width`             | 100 – 7680 CSS px                                            |
| `height`            | 100 – 4320 CSS px                                            |
| `deviceScaleFactor` | 0.5 – 4 (default `browser.deviceScaleFactor`, 1)             |

## Per scenario

```ts
scenarios: [
  { id: "menu", viewports: ["mobile"], steps: [/* … */] },            // only on mobile
  { id: "hero", steps: [{ type: "capture", label: "loaded" }] },      // every viewport
],
```

## From the command line

```bash
npx motionpr run --viewport mobile          # --project is an alias
npx motionpr run --viewport desktop --viewport mobile
```

Scenario keys combine id and viewport (`menu@mobile`), and baseline and candidate are matched by
that key. Adding a viewport therefore adds scenarios (`scenario-added`, info); removing one removes
them (`scenario-removed`, critical).

Higher pixel ratios make sharper frames and larger captures: a `deviceScaleFactor` of 2 stores four
times the pixels per frame.
