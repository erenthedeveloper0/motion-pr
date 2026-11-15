import { browserLabel, captureBrowser } from "./browsers.ts";
import type { CaptureBundle } from "./schema/capture.ts";
import type { ComparisonResult, Severity } from "./schema/comparison.ts";

/** Escapes text for Markdown tables/HTML (labels come from the captured page). */
export function mdEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

const MD_ICON: Record<Severity, string> = {
  critical: "🔴",
  warning: "🟠",
  uncertain: "🟣",
  info: "🔵",
};

/** GitHub-flavoured Markdown summary (used for $GITHUB_STEP_SUMMARY and --format markdown). */
export function comparisonMarkdown(
  result: ComparisonResult,
  options: { artifactName?: string; capture?: CaptureBundle } = {},
): string {
  const s = result.summary;
  const failed = s.status === "failed";
  const lines: string[] = [];
  const engines = result.crossBrowser
    ? `${browserLabel(result.baseline.browserName)} → ${browserLabel(result.candidate.browserName)} (cross-browser)`
    : browserLabel(result.candidate.browserName);
  lines.push(
    `## MotionPR · ${mdEscape(engines)} · ${failed ? "motion regression detected" : s.highestSeverity ? "motion changes within thresholds" : "no motion changes"}`,
  );
  lines.push("");
  lines.push("| Result | Critical | Warning | Uncertain | Info |");
  lines.push("|---|---:|---:|---:|---:|");
  lines.push(
    `| ${failed ? "❌ Failed" : "✅ Passed"} (fail on \`${result.failOn}\`) | ${s.counts.critical} | ${s.counts.warning} | ${s.counts.uncertain} | ${s.counts.info} |`,
  );
  lines.push("");
  lines.push("| Scenario | Status | Changes |");
  lines.push("|---|---|---|");
  for (const sc of result.scenarios) {
    const diffs = result.differences.filter((d) => d.scenarioKey === sc.key);
    const icon = sc.severity ? MD_ICON[sc.severity] : "✅";
    lines.push(`| ${icon} \`${mdEscape(sc.key)}\` | ${sc.status} | ${diffs.length} |`);
  }
  lines.push("");
  const top = result.differences.slice(0, 50);
  if (top.length) {
    lines.push(
      `<details${failed ? " open" : ""}><summary>Differences (${result.differences.length})</summary>`,
    );
    lines.push("");
    for (const d of top) {
      lines.push(
        `- ${MD_ICON[d.severity]} **${d.severity}** \`${mdEscape(d.scenarioKey)}\`${d.checkpoint ? ` › ${mdEscape(d.checkpoint)}` : ""}: ${mdEscape(d.title)}${d.measurement !== "measured" ? ` _(${d.measurement})_` : ""}`,
      );
    }
    if (result.differences.length > top.length)
      lines.push(`- …and ${result.differences.length - top.length} more in the report`);
    lines.push("");
    lines.push("</details>");
    lines.push("");
  }
  lines.push(
    `<sub>Baseline \`${mdEscape(result.baseline.id)}\` (${mdEscape(result.baseline.browser)}, ${mdEscape(result.baseline.platform)}) → current \`${mdEscape(result.candidate.id)}\` (${mdEscape(result.candidate.browser)}, ${mdEscape(result.candidate.platform)}). ${options.artifactName ? `Download the \`${mdEscape(options.artifactName)}\` artifact and open \`index.html\` for the interactive report.` : ""}</sub>`,
  );
  return `${lines.join("\n")}\n`;
}

export function captureMarkdown(bundle: CaptureBundle, note: string): string {
  const lines = [
    `## MotionPR · ${mdEscape(browserLabel(captureBrowser(bundle)))} · capture only`,
    "",
    note,
    "",
    "| Scenario | Status | Checkpoints | Animations |",
    "|---|---|---:|---:|",
  ];
  for (const s of bundle.scenarios) {
    lines.push(
      `| \`${mdEscape(s.key)}\` | ${s.status} | ${s.checkpoints.length} | ${s.checkpoints.reduce((n, c) => n + c.animations.length, 0)} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}
