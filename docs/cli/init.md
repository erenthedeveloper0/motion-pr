---
title: motionpr init
description: Create motionpr.config.ts (and optionally a GitHub Actions workflow) with a guided setup.
---

# `motionpr init`

```bash
npx motionpr init [options]
```

Creates a commented `motionpr.config.ts` (`.mjs` in projects without TypeScript) and
`.motionpr/.gitignore`. It detects the framework, the dev command, the package manager and the
animation engines in `package.json`. What it detects and writes is described in
[Project initialization](../getting-started/project-initialization.md).

| Option                             | Description                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `-y, --yes`                        | Use the detected defaults without prompting                                 |
| `--force`                          | Replace an existing config                                                  |
| `--base-url <url>`                 | URL of the app under test                                                   |
| `--command <cmd>` / `--no-command` | Command that starts the app / configure no web server                       |
| `--github`                         | Also write `.github/workflows/motionpr.yml` (actions pinned to commit SHAs) |
| `--no-example`                     | Do not add an example scenario                                              |

Existing files are never overwritten without confirmation (or `--force`).

## Examples

```bash
npx motionpr init                                         # guided
npx motionpr init --yes --github                          # defaults + CI workflow
npx motionpr init --base-url http://localhost:8080 --command "npm start"
```

The workflow `--github` writes is shown in [GitHub Actions](../ci/github-actions.md).
