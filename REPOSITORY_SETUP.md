# Repository setup

How [`github.com/erenthedeveloper0/motion-pr`](https://github.com/erenthedeveloper0/motion-pr) is
set up: what is in the repository, what lives in GitHub's settings, and why the metadata says what
it says. npm publishing is a separate, manual process: [PUBLISHING.md](PUBLISHING.md).

## In the repository

| File                                             | Purpose                                                                                      |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `README.md`                                      | Landing page on GitHub; also the package README on npm                                       |
| `LICENSE`, `THIRD_PARTY_NOTICES.md`              | MIT, and the licences of vendored code (demo app engines, fonts)                             |
| `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`          | How to build, test and propose changes (DCO sign-off); community standards                   |
| `SECURITY.md`, `SUPPORT.md`                      | Private vulnerability reporting; where to ask questions                                      |
| `CHANGELOG.md`, `ROADMAP.md`, `BUILD_STATUS.md`  | Release notes; what is planned; what is built and verified                                   |
| `ARCHITECTURE.md`, `docs/`                       | Design and the full documentation (also rendered on the website)                             |
| `PUBLISHING.md`, `RELEASE_CHECKLIST.md`          | The manual npm release                                                                       |
| `NPM_PACKAGE_AUDIT.md`, `REPOSITORY_SETUP.md`    | What the package contains; this file                                                         |
| `.github/workflows/ci.yml`                       | Quality gates on pushes and pull requests: build, typecheck, lint, format, tests, packaging  |
| `.github/workflows/pages.yml`                    | Builds the website with a fresh report of the demo app and deploys it to GitHub Pages        |
| `.github/ISSUE_TEMPLATE/`                        | Bug report and feature request forms; blank issues off; security and docs links              |
| `.github/PULL_REQUEST_TEMPLATE.md`, `CODEOWNERS` | Review checklist; every file owned by `@erenthedeveloper0`                                   |
| `.github/dependabot.yml`                         | Weekly grouped updates for actions and npm; engine and Playwright majors excluded on purpose |

No workflow publishes to npm or holds an npm credential (`scripts/tests/docs.test.ts` fails if one
does). Every action is pinned to a commit SHA, and both workflows start from
`permissions: contents: read`; only the Pages deploy job adds `pages: write` and `id-token: write`
(GitHub's own deployment token for Pages, unrelated to npm).

## Repository state

| Item                            | State                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| Repository                      | Public, created by the maintainer before the first push                                     |
| Default branch                  | `main`                                                                                      |
| First push                      | The full source, tests, docs, website and community files (see `git log`)                   |
| Description, website, topics    | **Not set yet**: apply the values below (no GitHub CLI or API token was available)          |
| Social preview                  | **Not set yet**: upload `brand/social/motionpr-social-preview.jpg`                          |
| GitHub Pages                    | **Off until enabled**: the Pages workflow reports this and skips deployment without failing |
| Private vulnerability reporting | **Off until enabled**                                                                       |

## Settings to apply (one time)

These live in GitHub's settings, not in the repository.

| Setting                         | Where                                            | Value                                                                                                                                                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Description                     | Code tab → ⚙ next to **About**                   | `Animation regression testing for the web: capture CSS, WAAPI, GSAP, Anime.js and Lenis motion in Chromium, diff it against a baseline in CI, and review it frame by frame. Open source, no telemetry! 🎞️`                                                                                   |
| Website                         | same dialog                                      | `https://erenthedeveloper0.github.io/motion-pr/`                                                                                                                                                                                                                                             |
| Topics                          | same dialog                                      | `animation` `animation-testing` `regression-testing` `visual-regression-testing` `motion-design` `web-animations` `css-animations` `gsap` `animejs` `lenis` `smooth-scroll` `easing` `playwright` `chromium` `testing-tools` `developer-tools` `github-actions` `ci` `frontend` `typescript` |
| Social preview                  | Settings → General → Social preview              | upload `brand/social/motionpr-social-preview.jpg` (1280 × 640)                                                                                                                                                                                                                               |
| Pages                           | Settings → Pages → Build and deployment → Source | **GitHub Actions**, then run Actions → Pages → Run workflow                                                                                                                                                                                                                                  |
| Private vulnerability reporting | Settings → Security → Advisories                 | **Enable** (SECURITY.md and the issue form link to it)                                                                                                                                                                                                                                       |
| Dependabot                      | Settings → Security → Dependabot                 | enable alerts and security updates                                                                                                                                                                                                                                                           |
| Features                        | Settings → General → Features                    | keep Issues on; Wiki and Projects off (the docs are the wiki)                                                                                                                                                                                                                                |
| Branch rule for `main`          | Settings → Rules → Rulesets → New branch ruleset | target `main`; block force pushes and deletions; require the status checks `build, test and package` and `package on Node 22`                                                                                                                                                                |

With the GitHub CLI (`gh auth login` first), everything but the social preview and the ruleset:

```bash
gh repo edit erenthedeveloper0/motion-pr \
  --description "Animation regression testing for the web: capture CSS, WAAPI, GSAP, Anime.js and Lenis motion in Chromium, diff it against a baseline in CI, and review it frame by frame. Open source, no telemetry! 🎞️" \
  --homepage "https://erenthedeveloper0.github.io/motion-pr/" \
  --add-topic animation,animation-testing,regression-testing,visual-regression-testing,motion-design \
  --add-topic web-animations,css-animations,gsap,animejs,lenis,smooth-scroll,easing \
  --add-topic playwright,chromium,testing-tools,developer-tools,github-actions,ci,frontend,typescript \
  --enable-wiki=false --enable-projects=false
gh api -X POST repos/erenthedeveloper0/motion-pr/pages -f build_type=workflow
gh api -X PUT repos/erenthedeveloper0/motion-pr/private-vulnerability-reporting
gh workflow run pages.yml --repo erenthedeveloper0/motion-pr
```

## Why this metadata

Discoverability on GitHub comes from the description, the topics and the README's opening; on
search engines, from the website's titles, descriptions and structured data. None of it states
numbers that are not measured: no stars, downloads or adoption.

- **Description.** Leads with the category people search for ("animation regression testing"),
  names every supported engine (people search by library), says where it runs and what it does,
  and ends in the style of the maintainer's other repositories.
- **Topics.** Twenty, GitHub's maximum. Category (`animation-testing`, `regression-testing`,
  `visual-regression-testing`), engines (`gsap`, `animejs`, `lenis`, `web-animations`,
  `css-animations`, `smooth-scroll`), concepts (`easing`, `motion-design`), tooling
  (`playwright`, `chromium`, `github-actions`, `ci`, `testing-tools`, `developer-tools`) and
  stack (`frontend`, `typescript`). Each is an existing, populated topic.
- **README.** Opens with the brand banner (the tagline), a one-line explanation, badges that
  state facts only (CI status, the npm version on the `alpha` tag, Node.js range, browser,
  telemetry, licence), links to the website, documentation and demo, an alpha notice, then the
  four commands that get a project running.
- **Website** (`apps/docs`). Every page has its own `<title>` and meta description, a canonical
  URL, Open Graph and Twitter card tags with the brand's social image, and JSON-LD
  (`SoftwareApplication` and `SoftwareSourceCode` on the home page, `TechArticle` and
  `BreadcrumbList` on documentation pages). `sitemap.xml` lists all 65 pages and `robots.txt`
  points to it.
- **Social preview.** The brand's own 1280 × 640 image; GitHub uses it for link previews of the
  repository.
