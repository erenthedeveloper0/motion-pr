---
title: motionpr capture
description: Capture the configured scenarios without comparing them.
---

# `motionpr capture`

```bash
npx motionpr capture [options]
```

Starts the configured web servers, captures the scenarios and stores the capture in
`.motionpr/captures/<browser>/<id>`, marked as that engine's latest. Captures beyond
`output.keep` (5) are removed per engine, oldest first; baselines are never touched. Exits `2` if
any scenario failed, or if a requested engine is not installed (nothing is captured then).

| Option                | Description                                                            |
| --------------------- | ---------------------------------------------------------------------- |
| `-s, --scenario <id>` | Only matching scenario ids; repeatable, comma lists and `*` globs work |
| `--viewport <name>`   | Only these viewports; repeatable                                       |
| `--project <name>`    | Alias of `--viewport`                                                  |
| `--browser <name>`    | `chromium`, `firefox`, `webkit` or `all`; repeatable, comma lists work |
| `--headed`            | Show the browser window                                                |
| `--debug`             | Headed, with verbose capture details                                   |
| `--no-web-server`     | Do not start configured web servers                                    |
| `-o, --output <dir>`  | Write the capture to `<dir>` instead (`<dir>/<browser>` for several)   |

## Examples

```bash
npx motionpr capture                               # every scenario, every viewport
npx motionpr capture -s "checkout-*" --viewport mobile
npx motionpr capture --headed -s menu              # watch it run
npx motionpr capture -o ./captures/main            # a capture directory you choose
npx motionpr capture --browser firefox             # one capture, with Firefox
npx motionpr capture --browser all                 # one capture per engine, one after another
```

Without `--browser`, the engine is `MOTIONPR_BROWSER` or the config's `browser.name`. The capture
records the engine and the version the browser reported (`environment.browser`), and what the
engine supports (`environment.capabilities`); see [Browser settings](../configuration/browser.md).

A capture directory written with `-o` can be compared directly:
`npx motionpr compare --baseline ./captures/main --current ./captures/feature`.
