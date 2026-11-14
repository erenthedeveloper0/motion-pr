---
title: motionpr report
description: Open the most recent report, regenerating it from the latest capture when needed.
---

# `motionpr report`

```bash
npx motionpr report [options]
```

Opens the most recent report (`.motionpr/report/index.html`), regenerating it from the latest
capture (and its comparison) when it does not exist.

| Option                 | Description                                               |
| ---------------------- | --------------------------------------------------------- |
| `--open` / `--no-open` | Open in the browser (default: when interactive)           |
| `--regenerate`         | Rebuild the report from the latest capture and comparison |

`--regenerate` also repairs a report whose HTML file has no data embedded (it shows _Report
unavailable_), for example a bare template that was copied by hand.

What the report shows: [HTML reports](../features/html-reports.md).
