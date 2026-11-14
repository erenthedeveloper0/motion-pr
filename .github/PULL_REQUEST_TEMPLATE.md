## What and why

<!-- The problem this solves. Link the issue. -->

## How it was verified

- [ ] `pnpm build && pnpm typecheck && pnpm lint && pnpm format:check`
- [ ] `pnpm test` (unit tests and the documentation checks)
- [ ] `pnpm test:integration` (capture engine, adapter or CLI changes)
- [ ] `pnpm test:e2e` (anything visible in the report viewer, the demo app or the website)
- [ ] `pnpm pack:check --install` (anything that changes what ships to npm)

## Conventions (CONTRIBUTING.md)

- [ ] A bug fix comes with a regression test that failed before the fix
- [ ] Compatibility claims in the docs are backed by real-browser tests
- [ ] Uncertain findings stay `uncertain`; nothing new can turn them into a failure by default
- [ ] Adapters use public APIs only and leave engines exactly as they found them
- [ ] A schema change bumps the schema version and adds a migration
- [ ] Docs and `CHANGELOG.md` updated

Commits are signed off (`git commit -s`): see CONTRIBUTING.md.
