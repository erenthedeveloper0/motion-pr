---
title: Environment variables
description: Every environment variable MotionPR reads, and the Playwright variables that affect the browser download.
---

# Environment variables

| Variable                                                          | Effect                                                                      |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `MOTIONPR_ENV`                                                    | Selects an entry of `config.environments` (same as `--env`)                 |
| `MOTIONPR_BASE_URL`                                               | Overrides `baseURL` (applied after `environments`)                          |
| `MOTIONPR_BROWSER_PATH`                                           | Sets `browser.executablePath` (applied after `environments`)                |
| `CI` (unless `false`), `GITHUB_ACTIONS`, `GITLAB_CI`, `BUILDKITE` | CI mode: non-interactive, no prompts, `run` exits `2` without a baseline    |
| `GITHUB_STEP_SUMMARY`                                             | `run` appends a Markdown summary to this file (disable with `--no-summary`) |
| `GITHUB_SHA`, `GITHUB_HEAD_REF`, `GITHUB_REF_NAME`                | Recorded as the capture's git commit and branch                             |
| `NO_COLOR`, `FORCE_COLOR`                                         | Disable / force coloured output                                             |

## Playwright

`motionpr install` and the browser launch use Playwright, so these apply:

| Variable                   | Effect                                                                |
| -------------------------- | --------------------------------------------------------------------- |
| `HTTPS_PROXY`              | Download Chromium through a proxy                                     |
| `PLAYWRIGHT_DOWNLOAD_HOST` | Download Chromium from a mirror                                       |
| `PLAYWRIGHT_BROWSERS_PATH` | Where Chromium is installed and looked up; set it for install and run |

## In your config

The config file is ordinary JavaScript or TypeScript and can read any variable:

```ts
export default defineConfig({
  baseURL: process.env.APP_URL ?? "http://localhost:3000",
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
  scenarios: [/* … */],
});
```
