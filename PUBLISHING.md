# Publishing

How `@erenthedeveloper0/motionpr` gets to npm. Publishing is **manual**: a person runs the final
command from their own machine. No workflow publishes, no CI job holds an npm credential, and
`scripts/tests/docs.test.ts` fails if a workflow ever mentions `npm publish` or an npm token.

## Where things live

|            |                                                                                                                                                            |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package    | `@erenthedeveloper0/motionpr`, built from `packages/cli`. The only published package; the `@motionpr/*` workspace packages are private and bundled into it |
| npm scope  | `@erenthedeveloper0`, the same scope the Zen packages are published under                                                                                  |
| Registry   | `https://registry.npmjs.org/`                                                                                                                              |
| Dist-tag   | `alpha` for `x.y.z-alpha[.n]`, `beta` for `-beta`, `next` for `-rc`, `latest` only for a plain version (`distTagFor` in `packages/core/src/version.ts`)    |
| Repository | [`github.com/erenthedeveloper0/motion-pr`](https://github.com/erenthedeveloper0/motion-pr): the package's `repository`, `bugs` and `homepage` point here   |
| What ships | `dist/`, `README.md`, `LICENSE`, `THIRD_PARTY_NOTICES.md` and `package.json`, checked against an allowlist by `scripts/pack-check.mjs`                     |

## Why a tarball, and not `npm publish` in a folder

The workspace's `package.json` files use pnpm's `catalog:` and `workspace:` specifiers. `pnpm
pack` rewrites them to real versions; `npm publish` run inside `packages/cli` would not, and would
publish a package nobody can install. So the release is always:

1. `pnpm release:prepare` packs the tarball, installs it into a clean project, runs it, and keeps
   that exact file in `release/`;
2. you publish **that file**.

`packages/cli/package.json` has a `prepublishOnly` guard that stops a folder publish with an
explanation. npm does not run lifecycle scripts when publishing a tarball, so the guard never
gets in the way of the real command.

## The first publish: `0.1.0-alpha`

### 1. One-time account checks

```bash
npm whoami                      # the npm user that publishes the @erenthedeveloper0 packages
npm org ls erenthedeveloper0    # that user is in the organisation, with publish rights
```

npm refuses to publish from an account without two-factor authentication. With 2FA on, `npm
publish` asks for a one-time password (or opens the browser): run it in an interactive terminal.

### 2. A clean, pushed commit with green CI

```bash
git switch main && git pull --ff-only
git status                      # nothing to commit, working tree clean
```

Open the commit's CI run on GitHub (Actions → CI) and check that it passed.

### 3. Prepare and verify

```bash
corepack enable
pnpm install --frozen-lockfile
npx playwright-core install chromium   # the end-to-end gates need it
pnpm release:prepare
```

`release:prepare` checks the version metadata and the dated CHANGELOG entry, builds everything,
runs typecheck, lint, format, unit, integration and end-to-end tests, runs the packaging check with
a clean-project install, writes `release/erenthedeveloper0-motionpr-0.1.0-alpha.tgz`, and asks npm
for a dry run of publishing exactly that file. It publishes nothing. It ends with:

```text
Ready. Nothing has been published.

Publish it yourself, from the repository root, after reading PUBLISHING.md:

  npm publish ./release/erenthedeveloper0-motionpr-0.1.0-alpha.tgz --access public --tag alpha
```

The dry run prints the 37 files and `Publishing to https://registry.npmjs.org/ with tag alpha and
public access (dry-run)`. Read the file list: it is what users will download.

### 4. Tag the release

```bash
git tag -a v0.1.0-alpha -m "v0.1.0-alpha"
git push origin v0.1.0-alpha
```

### 5. Publish

From the repository root:

```bash
npm publish ./release/erenthedeveloper0-motionpr-0.1.0-alpha.tgz --access public --tag alpha
```

- `--access public` is required the first time: scoped packages are private by default.
- `--tag alpha` keeps the prerelease off a range like `^0.1.0`.
- Keep the `./`: without it npm reads `release/<file>` as a GitHub `owner/repo` shorthand and
  tries to clone `github.com/release/…` (seen in a dry run while preparing this release).
- No `--provenance`: npm can only attest provenance from a CI run, and this publish is manual.

### 6. Check what was published

```bash
npm view @erenthedeveloper0/motionpr dist-tags
npm view @erenthedeveloper0/motionpr@0.1.0-alpha dist.integrity

mkdir /tmp/motionpr-check && cd /tmp/motionpr-check && npm init -y
npm install -D @erenthedeveloper0/motionpr@alpha
npx motionpr --version          # 0.1.0-alpha
npx motionpr --help
```

The registry can take a few minutes to answer `npm view` after a first publish (a cached 404);
the tarball itself downloads sooner.

**`latest` follows the first publish.** npm points `latest` at a package's first version whatever
`--tag` says, because every package must have one: after this publish, both `alpha` and `latest`
point at `0.1.0-alpha` (the Zen packages' first publish behaved the same way). Later prereleases
move `alpha` only. To keep `latest` following the alphas, run
`npm dist-tag add @erenthedeveloper0/motionpr@<version> latest` after each one; to leave it on
`0.1.0-alpha`, do nothing.

### 7. The GitHub release

On GitHub: **Releases → Draft a new release**, choose the tag `v0.1.0-alpha`, title `v0.1.0-alpha`,
paste the `## [0.1.0-alpha]` section of [CHANGELOG.md](CHANGELOG.md) under this install line,
tick **Set as a pre-release**, and publish:

````markdown
```bash
npm install -D @erenthedeveloper0/motionpr@alpha
```
````

## Every later release

```bash
pnpm version:set 0.1.0-alpha.1     # every workspace package and MOTIONPR_VERSION
pnpm install                        # refresh pnpm-lock.yaml
# write the CHANGELOG.md entry: "## [0.1.0-alpha.1] — YYYY-MM-DD"
git commit -am "Release 0.1.0-alpha.1"
git push                            # wait for CI to pass
pnpm release:prepare
git tag -a v0.1.0-alpha.1 -m "v0.1.0-alpha.1" && git push origin v0.1.0-alpha.1
npm publish ./release/erenthedeveloper0-motionpr-0.1.0-alpha.1.tgz --access public --tag alpha
```

Then steps 6 and 7 above. `pnpm version:set` refuses anything that is not `x.y.z` or
`x.y.z-alpha|beta|rc[.n]`, and `release:prepare` refuses a version without a dated CHANGELOG
entry.

## A bad version

npm allows unpublishing only within 72 hours and only when nothing depends on the version, and a
version number can never be reused. Deprecate instead, then publish a fix:

```bash
npm deprecate "@erenthedeveloper0/motionpr@0.1.0-alpha.1" "Broken: use 0.1.0-alpha.2"
```

## GitHub repository settings

Description, topics, Pages, the social preview and the branch rule are set once in GitHub's
settings: [REPOSITORY_SETUP.md](REPOSITORY_SETUP.md). What the tarball contains and how that was
checked: [NPM_PACKAGE_AUDIT.md](NPM_PACKAGE_AUDIT.md).

## The documentation website

The website is not published to npm. `.github/workflows/pages.yml` builds it on every push to
`main` and deploys it to GitHub Pages at https://erenthedeveloper0.github.io/motion-pr/, once
Pages is enabled (Settings → Pages → Source: **GitHub Actions**). Until then the workflow's check
job reports that Pages is off and skips the deployment without failing.
