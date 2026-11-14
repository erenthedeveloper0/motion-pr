---
title: Configuration file
description: motionpr.config.ts — formats, defineConfig, factories, environments, path resolution and validation.
---

# Configuration file

MotionPR reads `motionpr.config.ts` from the working directory (also `.mts`, `.cts`, `.js`,
`.mjs`, `.cjs`; pass another path with `--config`). TypeScript configs need no build step: they
are loaded with jiti. Relative paths in the config resolve from the config file's directory.

```ts
import { defineConfig } from "@erenthedeveloper0/motionpr";

export default defineConfig({
  baseURL: "http://localhost:3000",
  scenarios: [{ id: "home", steps: [{ type: "capture", label: "loaded" }] }],
});
```

`defineConfig` only adds types and editor completion. Without TypeScript, `// @ts-check` in a
`.mjs` config gives the same checks.

## Sections

| Section                        | Page                                                                                                           |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `baseURL`, `project`, `output` | below                                                                                                          |
| `scenarios`                    | [Scenarios](scenarios.md)                                                                                      |
| `webServer`                    | [Web server](web-server.md)                                                                                    |
| `browser`                      | [Browser settings](browser.md), [Viewports](viewports.md)                                                      |
| `capture`                      | [Sampling](sampling.md)                                                                                        |
| `comparison`                   | [Comparison thresholds](comparison.md)                                                                         |
| `identity`, `ignore`           | [Ignore rules](ignore-rules.md)                                                                                |
| `privacy`                      | [Privacy](privacy.md)                                                                                          |
| `adapters`                     | [Combining adapters](../integrations/combining-adapters.md), [Custom adapters](../advanced/custom-adapters.md) |
| `environments`                 | below                                                                                                          |

## Top level

| Option         | Type                              | Default             | Description                                                                   |
| -------------- | --------------------------------- | ------------------- | ----------------------------------------------------------------------------- |
| `baseURL`      | `string`                          | —                   | Base for scenario paths (http/https). Falls back to the first `webServer.url` |
| `scenarios`    | `Scenario[]`                      | required            | At least one; see [Scenarios](scenarios.md)                                   |
| `project.name` | `string`                          | `package.json` name | Shown in reports                                                              |
| `webServer`    | `WebServer \| WebServer[]`        | —                   | Servers to start before capturing                                             |
| `adapters`     | `{ name, script?, required? }[]`  | `[]`                | Engine adapters expected in the page                                          |
| `environments` | `Record<string, Partial<Config>>` | —                   | Overrides selected with `--env` or `MOTIONPR_ENV`                             |

## `output`

| Option             | Default       | Description                                                |
| ------------------ | ------------- | ---------------------------------------------------------- |
| `output.directory` | `".motionpr"` | Root for all MotionPR data, relative to the config file    |
| `output.baseline`  | `"baseline"`  | Approved baseline (relative to `directory`). Commit it     |
| `output.captures`  | `"captures"`  | Recent captures                                            |
| `output.report`    | `"report"`    | Generated report                                           |
| `output.keep`      | `5`           | Captures kept; older ones are deleted (never the baseline) |

## Factories

The default export can also be a function, sync or async. It receives `{ env, ci }`:

```ts
export default defineConfig(({ env, ci }) => ({
  baseURL: env === "staging" ? "https://staging.example.com" : "http://localhost:3000",
  capture: { concurrency: ci ? 2 : 1 },
  scenarios: [/* … */],
}));
```

## Environments

```ts
export default defineConfig({
  baseURL: "http://localhost:3000",
  scenarios: [/* … */],
  environments: {
    staging: { baseURL: "https://staging.example.com" },
    mobile: { browser: { viewport: { width: 390, height: 844 } } },
  },
});
```

```bash
npx motionpr run --env staging --no-web-server    # or MOTIONPR_ENV=staging
```

An environment is deep-merged over the base config: objects merge key by key, arrays and other
values replace, and `undefined` values are ignored (so an environment cannot unset an option; use
a CLI flag such as `--no-web-server` instead). Then `MOTIONPR_BASE_URL` and
`MOTIONPR_BROWSER_PATH` apply, if set ([Environment variables](environment-variables.md)).

## Validation

Configs are validated when loaded. Errors name the file and the exact option path, and list every
problem at once:

```text
  ✖ Invalid MotionPR config in motionpr.config.mjs.
      scenarios[0].steps[0].selector  selector must not be empty
      comparison.failOn  Invalid option: expected one of "critical"|"warning"|"info"|"never"
```

The rules are strict on purpose: unknown step types, empty selectors, duplicate checkpoint labels
within a scenario and ids with spaces are errors, not warnings.
