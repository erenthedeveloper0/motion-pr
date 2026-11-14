// HTML shells shared by every page. Links are relative (`up` climbs to the site root), so the
// same build works under https://erenthedeveloper0.github.io/motionpr/ and on a local server.
import {
  lockupGeometry,
  GRADIENT_STOPS,
  WORDMARK,
  LOCKUP,
} from "../../../brand/source/motionpr-logo.mjs";
import { escapeHtml } from "./markdown.mjs";

export const SITE = {
  name: "MotionPR",
  url: "https://erenthedeveloper0.github.io/motionpr/",
  repo: "https://github.com/erenthedeveloper0/motionpr",
  npm: "https://www.npmjs.com/package/@erenthedeveloper0/motionpr",
  package: "@erenthedeveloper0/motionpr",
  tagline: "Your code changed. See how your interface moves.",
};

export const ICONS = {
  search:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="7" cy="7" r="4.75"/><path d="m10.5 10.5 3.5 3.5"/></svg>',
  github:
    '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>',
  menu: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path class="m1" d="M2 5h12"/><path class="m2" d="M2 11h12"/></svg>',
  arrow:
    '<svg class="arrow" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M1 7h11M8 3l4 4-4 4"/></svg>',
  chevron:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg>',
  sidebar:
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2"/><path d="M6 3v10"/></svg>',
};

/** The supplied lockup, built from brand/source/motionpr-logo.mjs (never redrawn). */
export function logoSvg(id = "logo") {
  const g = lockupGeometry();
  const markY = -WORDMARK.top - WORDMARK.xHeight / 2 - LOCKUP.markSize / 2;
  const stops = GRADIENT_STOPS.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("");
  return `<svg viewBox="0 0 ${g.width} ${g.height}" role="img" aria-label="MotionPR"><defs><linearGradient id="${id}-g" gradientUnits="userSpaceOnUse" x1="0" y1="${markY + LOCKUP.markSize}" x2="${LOCKUP.markSize}" y2="${markY}">${stops}</linearGradient></defs><path class="logo-mark" data-mark-x="0" data-mark-y="${markY}" data-mark-size="${LOCKUP.markSize}" fill="url(#${id}-g)" d="${g.mark.path}"/><path fill="#F3F1FA" d="${g.wordmark}"/></svg>`;
}

/**
 * The bundle's file names, content-hashed by the build (build.mjs sets them before any page is
 * written). A page therefore always loads the scripts of its own build: a cached page cannot pair
 * with a newer deploy's chunks, and a new deploy is never served an old, cached app.js.
 */
export const ASSETS = { js: "app.js", css: "site.css" };

export function head({
  title,
  description,
  path,
  up,
  type = "website",
  jsonLd = [],
  noindex = false,
  version,
}) {
  const url = SITE.url + path;
  const image = `${SITE.url}assets/brand/motionpr-social-preview.jpg`;
  const ld = jsonLd.length
    ? `<script type="application/ld+json">${JSON.stringify(jsonLd.length === 1 ? jsonLd[0] : jsonLd).replace(/</g, "\\u003c")}</script>`
    : "";
  return `<meta charset="utf-8" />
<script>document.documentElement.classList.add("js");if(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches)document.documentElement.classList.add("is-reduced");</script>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
${noindex ? '<meta name="robots" content="noindex" />' : `<link rel="canonical" href="${url}" />`}
<meta name="theme-color" content="#070709" />
<meta name="color-scheme" content="dark" />
<meta name="mp-root" content="${up}" />
<meta name="mp-version" content="${escapeHtml(version)}" />
<meta property="og:type" content="${type}" />
<meta property="og:site_name" content="MotionPR" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${image}" />
<meta property="og:image:width" content="1280" />
<meta property="og:image:height" content="640" />
<meta property="og:image:alt" content="MotionPR: ${escapeHtml(SITE.tagline)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${image}" />
<link rel="icon" href="${up}favicon.ico" sizes="32x32" />
<link rel="icon" href="${up}favicon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="${up}apple-touch-icon.png" />
<link rel="manifest" href="${up}site.webmanifest" />
<link rel="preload" href="${up}assets/fonts/geist.woff2" as="font" type="font/woff2" crossorigin />
<link rel="stylesheet" href="${up}assets/${ASSETS.css}" />
<script type="module" src="${up}assets/${ASSETS.js}"></script>
${ld}`;
}

const NAV_LINKS = [
  ["docs", "Docs", "docs/"],
  ["demo", "Demo", "demo/"],
  ["playground", "Playground", "playground/"],
  ["report", "Report", "report/"],
];

export function header({ up, active, version }) {
  const links = NAV_LINKS.map(
    ([key, label, href]) =>
      `<a href="${up}${href}"${key === "report" ? ' data-router="off"' : ""}${active === key ? ' aria-current="page"' : ""} data-nav="${key}">${label}</a>`,
  ).join("");
  return `<a class="skip-link" href="#main">Skip to content</a>
<div class="playhead" aria-hidden="true"><div class="playhead__bar"></div><div class="playhead__head"></div></div>
<header class="site-header" data-persist>
  <div class="site-header__inner">
    <a class="brand-link" href="${up}" aria-label="MotionPR home">${logoSvg("hdr")}</a>
    <span class="brand-version" title="Current release">v${escapeHtml(version)}</span>
    <nav class="primary-nav" aria-label="Primary">${links}<span class="primary-nav__marker" aria-hidden="true"></span></nav>
    <div class="header-actions">
      <button type="button" class="search-trigger" data-search-open aria-haspopup="dialog" aria-label="Search the documentation">${ICONS.search}<span class="search-trigger__text">Search docs</span><kbd>⌘K</kbd></button>
      <a class="github-link" href="${SITE.repo}" aria-label="MotionPR on GitHub" rel="noopener">${ICONS.github}</a>
      <button type="button" class="icon-button menu-button" data-menu-toggle aria-expanded="false" aria-controls="mobile-nav" aria-label="Open menu">${ICONS.menu}</button>
    </div>
  </div>
</header>
<nav class="mobile-nav" id="mobile-nav" aria-label="Mobile" hidden data-persist>
  <ul class="mobile-nav__primary">
    <li><a href="${up}">Home</a></li>
    ${NAV_LINKS.map(([key, label, href]) => `<li><a href="${up}${href}"${key === "report" ? ' data-router="off"' : ""}>${label}</a></li>`).join("")}
    <li><a href="${SITE.repo}" rel="noopener">GitHub</a></li>
  </ul>
</nav>
<div class="search-dialog" role="dialog" aria-modal="true" aria-label="Search the documentation" hidden data-persist>
  <div class="search-dialog__backdrop" data-search-close></div>
  <div class="search-dialog__panel">
    <label class="search-dialog__field">${ICONS.search}<span class="sr-only">Search</span><input type="search" placeholder="Search the docs: easing, baseline, Lenis…" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="search-results" aria-autocomplete="list" /></label>
    <ul class="search-results" id="search-results" role="listbox" aria-label="Results"></ul>
    <div class="search-dialog__foot"><span><kbd>↑</kbd><kbd>↓</kbd> to move</span><span><kbd>↵</kbd> to open</span><span><kbd>esc</kbd> to close</span></div>
  </div>
</div>
<div class="sr-only" aria-live="polite" aria-atomic="true" data-route-announcer data-persist></div>`;
}

export function footer({ up, version }) {
  return `<footer class="site-footer">
  <div class="site-footer__inner">
    <div class="site-footer__brand">
      <a class="brand-link" href="${up}" aria-label="MotionPR home">${logoSvg("ftr")}</a>
      <p>${escapeHtml(SITE.tagline)}</p>
      <p class="label">v${escapeHtml(version)} · MIT licence · no telemetry</p>
    </div>
    <nav class="site-footer__cols" aria-label="Footer">
      <div><p class="label">Learn</p><a href="${up}docs/overview/introduction/">Introduction</a><a href="${up}docs/getting-started/installation/">Installation</a><a href="${up}docs/features/motion-comparison/">Motion comparison</a><a href="${up}docs/ci/github-actions/">GitHub Actions</a></div>
      <div><p class="label">Explore</p><a href="${up}demo/">Interactive demo</a><a href="${up}playground/">Playground</a><a href="${up}report/" data-router="off">Demo report</a><a href="${up}docs/cli/overview/">CLI reference</a></div>
      <div><p class="label">Project</p><a href="${SITE.repo}" rel="noopener">GitHub</a><a href="${SITE.npm}" rel="noopener">npm</a><a href="${SITE.repo}/blob/main/CHANGELOG.md" rel="noopener">Changelog</a><a href="${SITE.repo}/blob/main/ROADMAP.md" rel="noopener">Roadmap</a></div>
    </nav>
  </div>
  <p class="site-footer__legal">Built by <a href="https://github.com/erenthedeveloper0" rel="noopener">Eren Sümer</a>. GSAP, Anime.js and Lenis belong to their respective authors; MotionPR is an independent project, not affiliated with them.</p>
</footer>`;
}

export function document({ headHtml, body, layout, page, up, version, active }) {
  return `<!doctype html>
<html lang="en" data-layout="${layout}" data-page="${escapeHtml(page)}">
<head>
${headHtml}
</head>
<body>
${header({ up, active, version })}
<div class="shell" data-shell data-layout="${layout}" data-page="${escapeHtml(page)}">
${body}
</div>
</body>
</html>
`;
}
