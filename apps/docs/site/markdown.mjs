// Markdown → HTML for the documentation pages.
//
// Extensions (all degrade gracefully on GitHub, where the same files are read as plain Markdown):
//   ```ts title="file.ts" {2,4-6}     code block with a title and highlighted lines
//   <!-- tabs --> … <!-- /tabs -->     consecutive code blocks become tabs (labelled by title)
//   <!-- motionpr:NAME key="value" --> an interactive component (invisible on GitHub)
//   > [!NOTE] / [!TIP] / [!IMPORTANT] / [!WARNING] / [!CAUTION]   GitHub alerts → callouts
import { Marked } from "marked";
import { createHighlighter } from "shiki";
import { BRAND_THEME } from "./theme.mjs";

export function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

/** GitHub-compatible heading ids, so #anchors written for GitHub work on the site too. */
export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z]+;|&#\d+;/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s/g, "-");
}

export function frontmatter(source) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(source);
  const meta = {};
  if (m)
    for (const line of m[1].split("\n")) {
      const i = line.indexOf(":");
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  return { meta, body: m ? source.slice(m[0].length) : source };
}

const LANGS = ["ts", "js", "bash", "json", "yaml", "html", "css", "text", "markdown", "diff"];
const LABEL = {
  ts: "TypeScript",
  js: "JavaScript",
  bash: "Shell",
  json: "JSON",
  yaml: "YAML",
  html: "HTML",
  css: "CSS",
  text: "Text",
  markdown: "Markdown",
  md: "Markdown",
  diff: "Diff",
};
const ALIAS = {
  sh: "bash",
  shell: "bash",
  yml: "yaml",
  typescript: "ts",
  javascript: "js",
  md: "markdown",
  txt: "text",
  plain: "text",
};

let highlighter;
async function getHighlighter() {
  highlighter ??= await createHighlighter({
    themes: [BRAND_THEME],
    langs: LANGS.filter((l) => l !== "text"),
  });
  return highlighter;
}

function parseInfo(info = "") {
  const lang = (info.trim().split(/\s+/)[0] || "text").toLowerCase();
  const title = /title="([^"]*)"/.exec(info)?.[1] ?? null;
  const lines = new Set();
  const range = /\{([\d,\s-]+)\}/.exec(info)?.[1];
  if (range)
    for (const part of range.split(",")) {
      const [a, b] = part.split("-").map((n) => Number(n.trim()));
      for (let i = a; i <= (b || a); i++) lines.add(i);
    }
  return { lang: ALIAS[lang] ?? lang, title, lines };
}

function parseAttrs(text) {
  const attrs = {};
  for (const m of text.matchAll(/([a-zA-Z][\w-]*)(?:="([^"]*)")?/g)) attrs[m[1]] = m[2] ?? "true";
  return attrs;
}

const CALLOUTS = {
  NOTE: "Note",
  TIP: "Tip",
  IMPORTANT: "Important",
  WARNING: "Warning",
  CAUTION: "Caution",
};

/**
 * Renders one Markdown document. `resolveLink(href)` rewrites relative links (or returns null
 * to keep them); `resolveImage(src)` rewrites image sources and returns { src, width, height }.
 */
export async function renderMarkdown(body, { resolveLink, resolveImage }) {
  const hl = await getHighlighter();
  const toc = [];
  const components = [];
  const ids = new Map();
  let codeIndex = 0;
  let tabsIndex = 0;
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading({ tokens, depth, text }) {
        const inner = this.parser.parseInline(tokens);
        let id = slugify(text);
        const n = ids.get(id) ?? 0;
        ids.set(id, n + 1);
        if (n) id = `${id}-${n}`;
        if (depth === 1)
          return `<h1 id="${id}" tabindex="-1" data-reveal="title"><span class="h1-inner">${inner}</span></h1>\n`;
        if (depth <= 3) toc.push({ id, depth, text: inner.replace(/<[^>]+>/g, "") });
        return `<h${depth} id="${id}"><a class="h-anchor" href="#${id}" aria-label="Link to this section"><span aria-hidden="true">#</span></a>${inner}</h${depth}>\n`;
      },
      code({ text, lang: info }) {
        const { lang, title, lines } = parseInfo(info);
        const known = LANGS.includes(lang) && lang !== "text";
        let html = known
          ? hl.codeToHtml(text, {
              lang,
              theme: BRAND_THEME.name,
              transformers: [
                {
                  line(node, line) {
                    if (lines.has(line)) this.addClassToHast(node, "hl");
                  },
                },
              ],
            })
          : `<pre class="shiki" tabindex="0"><code>${text
              .split("\n")
              .map(
                (l, i) =>
                  `<span class="line${lines.has(i + 1) ? " hl" : ""}">${escapeHtml(l)}</span>`,
              )
              .join("\n")}</code></pre>`;
        // Colours come from the stylesheet's tokens, not inline background styles.
        html = html.replace(/<pre class="shiki[^"]*" style="[^"]*"/, '<pre class="shiki"');
        const id = `code-${++codeIndex}`;
        const label = LABEL[lang] ?? lang;
        const isTerminal = lang === "bash" || (lang === "text" && /^\s*[◐$]/.test(text));
        return `<figure class="code${isTerminal ? " code--terminal" : ""}" data-lang="${escapeHtml(lang)}"${title ? ` data-title="${escapeHtml(title)}"` : ""}>
<figcaption class="code-head"><span class="code-title">${escapeHtml(title ?? label)}</span>${title ? `<span class="code-lang">${escapeHtml(label)}</span>` : ""}<button type="button" class="copy" data-copy="${id}" aria-label="Copy code${title ? `: ${escapeHtml(title)}` : ""}"><span class="copy-label">Copy</span></button></figcaption>
<div class="code-body" id="${id}">${html}</div>
</figure>\n`;
      },
      html({ text }) {
        const directive = /^<!--\s*motionpr:([a-z-]+)\s*(.*?)\s*-->\s*$/s.exec(text.trim());
        if (directive) {
          const [, name, rest] = directive;
          const attrs = parseAttrs(rest);
          components.push(name);
          const data = Object.entries(attrs)
            .map(
              ([k, v]) =>
                ` data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${escapeHtml(v)}"`,
            )
            .join("");
          return `<div class="mp-component" data-component="${name}"${data}><p class="mp-component__fallback">Interactive ${escapeHtml(name.replace(/-/g, " "))}: needs JavaScript.</p></div>\n`;
        }
        if (/^<!--\s*tabs\s*-->$/.test(text.trim())) return "<!--TABS-OPEN-->";
        if (/^<!--\s*\/tabs\s*-->$/.test(text.trim())) return "<!--TABS-CLOSE-->";
        if (/^<!--[\s\S]*-->$/.test(text.trim())) return "";
        return text;
      },
      blockquote({ tokens, text }) {
        const alert = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*\n?/.exec(text);
        if (alert) {
          const kind = alert[1];
          const inner = marked.parse(text.slice(alert[0].length));
          return `<aside class="callout callout--${kind.toLowerCase()}" role="note"><p class="callout-title">${CALLOUTS[kind]}</p>${inner}</aside>\n`;
        }
        return `<blockquote>${this.parser.parse(tokens)}</blockquote>\n`;
      },
      table(token) {
        const head = token.header
          .map(
            (cell, i) =>
              `<th${token.align[i] ? ` style="text-align:${token.align[i]}"` : ""}>${this.parser.parseInline(cell.tokens)}</th>`,
          )
          .join("");
        const rows = token.rows
          .map(
            (row) =>
              `<tr>${row.map((cell, i) => `<td${token.align[i] ? ` style="text-align:${token.align[i]}"` : ""}>${this.parser.parseInline(cell.tokens)}</td>`).join("")}</tr>`,
          )
          .join("\n");
        return `<div class="table-wrap" tabindex="0" role="region" aria-label="Table"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>\n`;
      },
      link({ href, title, tokens }) {
        const inner = this.parser.parseInline(tokens);
        const external = /^https?:/.test(href);
        const resolved = resolveLink(href);
        const target = resolved ?? href;
        const isExternal = external && resolved === null;
        return `<a href="${escapeHtml(target)}"${title ? ` title="${escapeHtml(title)}"` : ""}${isExternal ? ' class="external" rel="noopener"' : ""}>${inner}</a>`;
      },
      image({ href, title, text }) {
        const img = resolveImage(href);
        return `<figure class="figure"><img src="${escapeHtml(img.src)}" alt="${escapeHtml(text)}"${img.width ? ` width="${img.width}" height="${img.height}"` : ""} loading="lazy" decoding="async" />${title || text ? `<figcaption>${escapeHtml(title || text)}</figcaption>` : ""}</figure>`;
      },
    },
  });
  let html = await marked.parse(body);
  // <p><figure> is invalid: unwrap images that were the only thing in their paragraph.
  html = html.replace(/<p>(<figure class="figure">[\s\S]*?<\/figure>)<\/p>/g, "$1");
  html = html.replace(/<!--TABS-OPEN-->([\s\S]*?)<!--TABS-CLOSE-->/g, (_, inner) => {
    const figures = [...inner.matchAll(/<figure class="code[^"]*"[\s\S]*?<\/figure>/g)].map(
      (m) => m[0],
    );
    if (figures.length < 2) return inner;
    const group = `tabs-${++tabsIndex}`;
    const labels = figures.map((f, i) => /data-title="([^"]*)"/.exec(f)?.[1] ?? `Tab ${i + 1}`);
    const tabs = labels
      .map(
        (l, i) =>
          `<button type="button" role="tab" id="${group}-t${i}" aria-controls="${group}-p${i}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${l}</button>`,
      )
      .join("");
    const panels = figures
      .map(
        (f, i) =>
          `<div role="tabpanel" id="${group}-p${i}" aria-labelledby="${group}-t${i}"${i ? " hidden" : ""}>${f}</div>`,
      )
      .join("");
    return `<div class="code-tabs" data-component="code-tabs"><div class="code-tabs__list" role="tablist" aria-label="Equivalent commands"><span class="code-tabs__indicator" aria-hidden="true"></span>${tabs}</div>${panels}</div>\n`;
  });
  html = html.replace(/<!--TABS-(OPEN|CLOSE)-->/g, "");
  return { html, toc, components };
}

/** Plain text of a Markdown body for the search index (code blocks and HTML removed). */
export function plainText(body) {
  return body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_>#|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
