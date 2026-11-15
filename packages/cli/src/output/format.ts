import {
  browserLabel,
  captureBrowser,
  type CaptureBundle,
  type ComparisonResult,
  type Difference,
  type Severity,
} from "@motionpr/core";
import type { Terminal } from "./terminal.ts";

const SEVERITY_ORDER: Severity[] = ["critical", "warning", "uncertain", "info"];

export function severityIcon(t: Terminal, severity: Severity | null): string {
  const s = t.symbols;
  switch (severity) {
    case "critical":
      return t.c.red(s.fail);
    case "warning":
      return t.c.yellow(s.warn);
    case "uncertain":
      return t.c.magenta(s.uncertain);
    case "info":
      return t.tech(s.info);
    default:
      return t.c.green(s.ok);
  }
}

function countsLine(t: Terminal, counts: Record<Severity, number>): string {
  const parts: string[] = [];
  if (counts.critical) parts.push(t.c.red(`${counts.critical} critical`));
  if (counts.warning)
    parts.push(t.c.yellow(`${counts.warning} warning${counts.warning === 1 ? "" : "s"}`));
  if (counts.uncertain) parts.push(t.c.magenta(`${counts.uncertain} uncertain`));
  if (counts.info) parts.push(t.tech(`${counts.info} info`));
  return parts.join(t.c.dim(" · ")) || t.c.dim("no differences");
}

/** Human-readable comparison summary for the terminal. */
export function printComparison(
  t: Terminal,
  result: ComparisonResult,
  options: { reportPath?: string; maxPerScenario?: number } = {},
): void {
  const max = options.maxPerScenario ?? 4;
  const engine = (ref: ComparisonResult["baseline"]) =>
    `${browserLabel(ref.browserName)} ${ref.browser.slice(ref.browser.indexOf(" ") + 1)}`;
  t.write(
    `  ${t.c.dim("Baseline")} ${result.baseline.id} ${t.c.dim(`(${engine(result.baseline)})`)}  ${t.c.dim(t.symbols.arrow)}  ${t.c.dim("Current")} ${result.candidate.id} ${t.c.dim(`(${engine(result.candidate)})`)}`,
  );
  if (result.crossBrowser)
    t.write(
      `  ${t.c.magenta("Cross-browser comparison:")} ${t.c.dim("pixel, geometry, start-offset and scroll differences are uncertain.")}`,
    );
  t.write();
  const byScenario = new Map<string, Difference[]>();
  for (const d of result.differences)
    byScenario.set(d.scenarioKey, [...(byScenario.get(d.scenarioKey) ?? []), d]);
  const width = Math.min(40, Math.max(...result.scenarios.map((s) => s.key.length), 10));
  for (const s of result.scenarios) {
    const diffs = byScenario.get(s.key) ?? [];
    const counts = { critical: 0, warning: 0, info: 0, uncertain: 0 };
    for (const d of diffs) counts[d.severity]++;
    const status =
      s.status === "unchanged"
        ? t.c.dim("unchanged")
        : s.status === "added"
          ? t.c.dim("new scenario")
          : countsLine(t, counts);
    t.write(`  ${severityIcon(t, s.severity)} ${s.key.padEnd(width)}  ${status}`);
    const sorted = [...diffs].sort(
      (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
    );
    for (const d of sorted.slice(0, max)) {
      t.write(
        `      ${severityIcon(t, d.severity)} ${t.c.dim(d.checkpoint ? `${d.checkpoint}: ` : "")}${truncate(d.title, 110)}`,
      );
    }
    if (sorted.length > max)
      t.write(`      ${t.c.dim(`+${sorted.length - max} more in the report`)}`);
  }
  const a = result.summary.animations;
  t.write();
  t.write(
    `  ${t.c.dim(`${a.matched} matched · ${a.changed} changed · ${a.added} added · ${a.removed} removed · ${a.unchanged} unchanged`)}`,
  );
  for (const d of result.diagnostics) t.warn(`${d.message}${d.hint ? t.c.dim(` ${d.hint}`) : ""}`);
  const failed = result.summary.status === "failed";
  t.write();
  t.write(
    `  ${t.c.bold("Result")}  ${failed ? t.c.red(t.c.bold("FAILED")) : t.c.green(t.c.bold("PASSED"))}  ${t.c.dim(`fail on: ${result.failOn}${result.failOnUncertain ? " + uncertain" : ""}`)}  ${countsLine(t, result.summary.counts)}`,
  );
  if (options.reportPath) t.write(`  ${t.c.bold("Report")}  ${t.tech(options.reportPath)}`);
}

export function printCaptureSummary(t: Terminal, bundle: CaptureBundle, dir: string): void {
  const passed = bundle.scenarios.filter((s) => s.status === "passed").length;
  const animations = bundle.scenarios.reduce(
    (n, s) => n + s.checkpoints.reduce((m, c) => m + c.animations.length, 0),
    0,
  );
  const checkpoints = bundle.scenarios.reduce((n, s) => n + s.checkpoints.length, 0);
  const warnings = bundle.scenarios.flatMap((s) => s.diagnostics).filter((d) => d.level !== "info");
  t.write();
  t.write(
    `  ${t.c.bold("Captured")}  ${passed}/${bundle.scenarios.length} scenarios · ${checkpoints} checkpoints · ${animations} animations · ${Object.keys(bundle.assets).length} unique frames`,
  );
  t.write(`  ${t.c.bold("Capture")}   ${t.tech(dir)} ${t.c.dim(`(${bundle.id})`)}`);
  t.write(
    `  ${t.c.bold("Browser")}   ${browserLabel(captureBrowser(bundle))} ${bundle.environment.browser.version}${t.c.dim(` · Playwright ${bundle.environment.playwright} · ${bundle.environment.platform}-${bundle.environment.arch}`)}`,
  );
  if (warnings.length) {
    t.write();
    const seen = new Set<string>();
    for (const d of warnings) {
      const key = `${d.code}:${d.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (seen.size > 8) break;
      t.warn(`${t.c.dim(`${d.scenario ?? ""}`)} ${d.message}`);
      if (d.hint) t.hint(d.hint);
    }
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export { captureMarkdown, comparisonMarkdown, mdEscape } from "@motionpr/core";
