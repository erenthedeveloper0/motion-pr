import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MOTIONPR_VERSION } from "@motionpr/core";

/**
 * Summary of one engine's report, written next to its `index.html` as `summary.json`. The
 * report index (`report/index.html`) is built from these, so it lists every engine that has a
 * report, also those not run this time.
 */
export interface BrowserReportSummary {
  kind: "motionpr-report-summary";
  /** Directory name under the report directory: `firefox`, or `chromium-vs-firefox`. */
  key: string;
  /** Engine and version, e.g. `Firefox 159.0` (or `Chromium 158 → Firefox 159`). */
  browser: string;
  /** `passed` / `failed` (compared), `capture-only` (no baseline yet). */
  status: "passed" | "failed" | "capture-only";
  counts: { critical: number; warning: number; uncertain: number; info: number } | null;
  scenarios: number;
  captureId: string;
  generatedAt: string;
}

export const REPORT_SUMMARY_FILE = "summary.json";
const KEY = /^[a-z0-9]+(?:-vs-[a-z0-9]+)?$/;

export async function writeBrowserReportSummary(
  reportDir: string,
  summary: Omit<BrowserReportSummary, "kind">,
): Promise<void> {
  const value: BrowserReportSummary = { kind: "motionpr-report-summary", ...summary };
  await writeFile(join(reportDir, REPORT_SUMMARY_FILE), `${JSON.stringify(value, null, 2)}\n`);
}

function isSummary(value: unknown): value is BrowserReportSummary {
  const v = value as Partial<BrowserReportSummary> | null;
  return (
    typeof v === "object" &&
    v !== null &&
    v.kind === "motionpr-report-summary" &&
    typeof v.key === "string" &&
    KEY.test(v.key) &&
    typeof v.browser === "string" &&
    (v.status === "passed" || v.status === "failed" || v.status === "capture-only") &&
    typeof v.captureId === "string" &&
    typeof v.generatedAt === "string" &&
    typeof v.scenarios === "number"
  );
}

/** Reads every `<reportRoot>/<key>/summary.json`, sorted by key. Ignores anything malformed. */
export async function readBrowserReportSummaries(
  reportRoot: string,
): Promise<BrowserReportSummary[]> {
  let names: string[];
  try {
    names = await readdir(reportRoot);
  } catch {
    return [];
  }
  const out: BrowserReportSummary[] = [];
  for (const name of names.sort()) {
    if (!KEY.test(name)) continue;
    try {
      const json: unknown = JSON.parse(
        await readFile(join(reportRoot, name, REPORT_SUMMARY_FILE), "utf8"),
      );
      if (isSummary(json) && json.key === name) out.push(json);
    } catch {
      // no summary: not a report directory
    }
  }
  return out;
}

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const STATUS: Record<BrowserReportSummary["status"], [string, string]> = {
  passed: ["Within thresholds", "ok"],
  failed: ["Regression", "critical"],
  "capture-only": ["No baseline yet", "muted"],
};

/**
 * Writes `<reportRoot>/index.html`: one row per engine report with its result and counts. Plain
 * static HTML with inline styles: offline, no scripts, every value escaped.
 */
export async function writeBrowserIndex(options: {
  reportRoot: string;
  project: string;
}): Promise<{ indexPath: string; entries: BrowserReportSummary[] }> {
  const entries = await readBrowserReportSummaries(options.reportRoot);
  const rows = entries
    .map((e) => {
      const [label, tone] = STATUS[e.status];
      const counts = e.counts
        ? (["critical", "warning", "uncertain", "info"] as const)
            .filter((k) => e.counts![k] > 0)
            .map((k) => `<span class="n ${k}">${e.counts![k]} ${k}</span>`)
            .join("") || `<span class="n muted">no differences</span>`
        : `<span class="n muted">capture only</span>`;
      return `<a class="row" href="./${e.key}/index.html">
  <span class="engine">${esc(e.browser)}</span>
  <span class="status ${tone}">${esc(label)}</span>
  <span class="counts">${counts}</span>
  <span class="meta">${e.scenarios} scenario${e.scenarios === 1 ? "" : "s"} · ${esc(e.captureId)} · ${esc(e.generatedAt.slice(0, 16).replace("T", " "))} UTC</span>
</a>`;
    })
    .join("\n");
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>MotionPR reports · ${esc(options.project)}</title>
<style>
:root{--ink:#0b0b0e;--panel:#13131a;--line:#22222c;--g4:#6c6b7c;--g3:#8f8da0;--g2:#b4b2c3;--paper:#f3f1fa;--ok:#6fd6a8;--critical:#f2667a;--warning:#f3c96b;--uncertain:#d59ce8;--info:#68d6e8}
*{box-sizing:border-box}
body{margin:0;background:var(--ink);color:var(--paper);font:14px/1.5 "Geist Variable","Geist",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:860px;margin:0 auto;padding:48px 16px}
h1{font-size:20px;font-weight:500;letter-spacing:-.02em;margin:0 0 4px}
p{color:var(--g3);margin:0 0 28px}
.row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 16px;padding:16px 18px;margin-bottom:10px;border:1px solid var(--line);border-radius:10px;background:var(--panel);color:inherit;text-decoration:none}
.row:hover,.row:focus-visible{border-color:var(--g4);outline:none}
.engine{font-weight:500}
.status{justify-self:end;font-size:12px;padding:2px 10px;border-radius:999px;white-space:nowrap}
.status.ok{color:var(--ok);background:rgba(111,214,168,.1)}
.status.critical{color:var(--critical);background:rgba(242,102,122,.12)}
.status.muted{color:var(--g2);background:rgba(255,255,255,.06)}
.counts{display:flex;flex-wrap:wrap;gap:10px;font:12px ui-monospace,"Geist Mono",Menlo,monospace}
.n.critical{color:var(--critical)}.n.warning{color:var(--warning)}.n.uncertain{color:var(--uncertain)}.n.info{color:var(--info)}.n.muted{color:var(--g3)}
.meta{grid-column:1/-1;color:var(--g4);font:12px ui-monospace,"Geist Mono",Menlo,monospace;overflow-wrap:anywhere}
footer{margin-top:28px;color:var(--g4);font-size:12px}
</style>
</head>
<body>
<main>
<h1>${esc(options.project)}</h1>
<p>One report per browser engine. Each engine is compared with its own baseline.</p>
${rows || `<p>No reports yet.</p>`}
<footer>MotionPR ${esc(MOTIONPR_VERSION)}</footer>
</main>
</body>
</html>
`;
  const indexPath = join(options.reportRoot, "index.html");
  await writeFile(indexPath, html);
  return { indexPath, entries };
}
