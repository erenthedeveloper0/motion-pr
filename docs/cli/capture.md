---
title: motionpr capture
description: Capture the configured scenarios without comparing them.
---

# `motionpr capture`

```bash
npx motionpr capture [options]
```

Starts the configured web servers, captures the scenarios and stores the capture in
`.motionpr/captures/<id>`, marked as the latest. Captures beyond `output.keep` (5) are removed,
oldest first; the baseline is never touched. Exits `2` if any scenario failed.

| Option                | Description                                                            |
| --------------------- | ---------------------------------------------------------------------- |
| `-s, --scenario <id>` | Only matching scenario ids; repeatable, comma lists and `*` globs work |
| `--viewport <name>`   | Only these viewports; repeatable                                       |
| `--project <name>`    | Alias of `--viewport`                                                  |
| `--browser <name>`    | `chromium` (the only supported browser in this release)                |
| `--headed`            | Show the browser window                                                |
| `--debug`             | Headed, with verbose capture details                                   |
| `--no-web-server`     | Do not start configured web servers                                    |
| `-o, --output <dir>`  | Write the capture to `<dir>` instead                                   |

## Examples

```bash
npx motionpr capture                               # every scenario, every viewport
npx motionpr capture -s "checkout-*" --viewport mobile
npx motionpr capture --headed -s menu              # watch it run
npx motionpr capture -o ./captures/main            # a capture directory you choose
```

A capture directory written with `-o` can be compared directly:
`npx motionpr compare --baseline ./captures/main --current ./captures/feature`.
