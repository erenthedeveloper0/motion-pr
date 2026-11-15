---
title: motionpr report
description: Open the most recent report, regenerating it from the latest capture when needed.
---

# `motionpr report`

```bash
npx motionpr report [options]
```

Opens the most recent report. Each engine has its own (`.motionpr/report/<browser>/index.html`);
when more than one engine has a report, `report` opens `.motionpr/report/index.html`, which lists
them all with their results. A missing engine report is regenerated from that engine's latest
capture (and its comparison).

| Option                 | Description                                                        |
| ---------------------- | ------------------------------------------------------------------ |
| `--browser <name>`     | Open (or regenerate) this engine's report instead of the index     |
| `--open` / `--no-open` | Open in the browser (default: when interactive)                    |
| `--regenerate`         | Rebuild the engine's report from its latest capture and comparison |

```bash
npx motionpr report --open                     # the index, or the only engine's report
npx motionpr report --browser webkit --open
npx motionpr report --browser firefox --regenerate
```

`--regenerate` also repairs a report whose HTML file has no data embedded (it shows _Report
unavailable_), for example a bare template that was copied by hand.

What the report shows: [HTML reports](../features/html-reports.md).
