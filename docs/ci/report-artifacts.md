---
title: Report artifacts
description: Download, open and share the report a CI run produced.
---

# Report artifacts

`motionpr run` writes one report per engine to `.motionpr/report/`:

```text
.motionpr/report/
├── index.html         every engine's report, with its result and counts
└── chromium/          (and firefox/, webkit/ for the engines you ran)
    ├── index.html     the viewer with both captures and the comparison embedded
    ├── summary.json   the result the index lists
    └── assets/        frames, screenshots and diff images
```

The comparison itself (`comparison.json`) is in `.motionpr/comparison/<browser>/`.

The generated workflow uploads that directory as the `motionpr-report` artifact on every run,
including failed ones, and keeps it for 14 days.

## Open a downloaded report

1. Open the workflow run in the **Actions** tab.
2. Download **motionpr-report** under _Artifacts_ and unzip it.
3. Open `index.html` in a browser, and pick an engine.

The report is self-contained: it loads nothing from the network and works from `file://`. Keep
each engine's `assets/` next to its `index.html`. With a matrix of engines, each job uploads its
own artifact (e.g. `motionpr-report-firefox`).

## What to look at

The run page's summary already lists every difference with its severity. The report adds the
frames, the timelines and the curves. See [HTML reports](../features/html-reports.md).

## Size and retention

A report embeds both captures' data; frames stay separate files. The demo app's report (11
scenarios, 57 animations per variant) is about 2.5 MB of HTML plus its frames. Lower
`retention-days` or upload only on failure (`if: ${{ failure() }}`) if storage matters.

## Publishing reports

Reports are static files, so any static host can serve them. They contain screenshots of your
app: publish them only where you would publish those.
