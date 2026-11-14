# Release checklist

A short list to tick through. The reasons and the exact commands are in
[PUBLISHING.md](PUBLISHING.md).

## Before

- [ ] `main` is checked out, pulled, and `git status` is clean
- [ ] CI passed on the commit being released (Actions → CI)
- [ ] The version is set everywhere: `pnpm version:check` prints `all packages at <version>`
- [ ] `CHANGELOG.md` has a dated `## [<version>] — YYYY-MM-DD` entry that says what changed,
      including every breaking change to the capture format or the API
- [ ] `BUILD_STATUS.md` reflects what was verified for this release
- [ ] Docs mention nothing that is not built, and nothing built is missing from them
      (`pnpm test` runs the documentation checks)

## Prepare

- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm release:prepare` ends with **Ready. Nothing has been published.**
- [ ] The dry run lists only `dist/`, `README.md`, `LICENSE`, `THIRD_PARTY_NOTICES.md`,
      `package.json`, and says `with tag <alpha|beta|next|latest> and public access`

## Publish

- [ ] `git tag -a v<version> -m "v<version>"` and `git push origin v<version>`
- [ ] `npm whoami` is the account that publishes `@erenthedeveloper0` packages, with 2FA on
- [ ] `npm publish ./release/erenthedeveloper0-motionpr-<version>.tgz --access public --tag <tag>`

## After

- [ ] `npm view @erenthedeveloper0/motionpr dist-tags` shows the new version on its tag
- [ ] In an empty directory: `npm install -D @erenthedeveloper0/motionpr@<tag>`, then
      `npx motionpr --version` and `npx motionpr --help`
- [ ] `npx @erenthedeveloper0/motionpr@<tag> demo` runs (needs `npx motionpr install` once)
- [ ] GitHub release created from the tag with the CHANGELOG section, marked pre-release for
      prerelease versions
- [ ] The website deployed (Actions → Pages) and https://erenthedeveloper0.github.io/motion-pr/
      shows the new version in the header
