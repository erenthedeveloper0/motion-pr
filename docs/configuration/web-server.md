---
title: Web server
description: Let MotionPR start your app before capturing, wait for it, and stop it afterwards.
---

# Web server

```ts
webServer: {
  command: "npm run dev",
  url: "http://localhost:3000",
  reuseExistingServer: !process.env.CI,
},
```

| Option                | Default          | Description                                                                         |
| --------------------- | ---------------- | ----------------------------------------------------------------------------------- |
| `command`             | required         | Shell command, e.g. `"npm run dev"`                                                 |
| `url`                 | required         | Polled until it answers with 2xx, 3xx or 400–403                                    |
| `cwd`                 | config directory | Working directory of the command                                                    |
| `env`                 | —                | Extra environment variables                                                         |
| `reuseExistingServer` | `false`          | Use a server already answering on `url` instead of failing                          |
| `timeout`             | `60000`          | Startup timeout (ms)                                                                |
| `stdout`              | `"ignore"`       | `"pipe"` prints server output (with `--verbose`); output is always shown on failure |

`webServer` can also be an array: servers start in order (an API before the front end), and all of
them must become ready.

## Lifecycle

- If something already answers on `url` and `reuseExistingServer` is `false`, MotionPR stops with
  _Something is already serving …_ rather than start a second server on a busy port.
- If the command exits before `url` is ready, or `timeout` passes, the error includes the last lines
  of the server's output.
- Servers are stopped when MotionPR finishes, fails or is interrupted: the whole process tree gets
  SIGTERM, then SIGKILL after 5 s.
- `--no-web-server` skips starting servers for one run.

## Production builds

Motion in development builds can differ from production (dev-only CSS, unminified engines,
React's double effects). For baselines that match what users get, capture a production build:

```ts
webServer: {
  command: "npm run build && npm run preview",
  url: "http://localhost:4173",
  timeout: 180_000,
},
```
