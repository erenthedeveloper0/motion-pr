import type { Change, ComparisonConfig, Severity, SeverityRule } from "@motionpr/core";

/**
 * Default severity rationale (documented in docs/features/severity.md):
 * - Motion that disappears (removed animation/checkpoint, failed scenario) is critical: users
 *   lose feedback the design relied on.
 * - New motion, timing changes beyond thresholds, easing shape changes, and property/trajectory
 *   changes are warnings: they change how the interface feels and deserve review.
 * - Small adjustments below the warning thresholds are informational.
 * - Anything resting on a weak element match or incomplete data is uncertain.
 */
export const DEFAULT_RULE_SEVERITY: Record<SeverityRule, Severity> = {
  "scenario-failed": "critical",
  "scenario-added": "info",
  "scenario-removed": "critical",
  "checkpoint-added": "warning",
  "checkpoint-removed": "critical",
  "animation-added": "warning",
  "animation-removed": "critical",
  duration: "warning",
  delay: "warning",
  "end-delay": "info",
  start: "warning",
  easing: "warning",
  iterations: "warning",
  direction: "warning",
  "playback-rate": "warning",
  fill: "info",
  "property-added": "warning",
  "property-removed": "warning",
  keyframes: "warning",
  trajectory: "warning",
  opacity: "warning",
  size: "warning",
  stagger: "warning",
  visual: "warning",
  timeline: "warning",
  "scroll-added": "warning",
  "scroll-removed": "critical",
  "scroll-position": "warning",
  "scroll-duration": "warning",
  "scroll-curve": "warning",
  "scroll-velocity": "warning",
  "scroll-overshoot": "warning",
};

/** Applies a configured override for `rule`. Returns null when the rule is turned off. */
export function applyOverride(
  rule: SeverityRule,
  computed: Severity,
  config: ComparisonConfig,
): Severity | null {
  const override = config.severity[rule];
  if (override === "off") return null;
  return override ?? computed;
}

/**
 * Severity of a timing change (ms). Below `tolerance` there is no change; a change is a warning
 * when it exceeds both `warnAbsoluteMs` and `warnRelative`, critical when the relative change
 * reaches `criticalRelative` (and exceeds `warnAbsoluteMs`), and informational otherwise.
 *
 * The relative change is measured against `reference`: the baseline value itself for durations,
 * and the animation's duration for delays and start offsets (a delay going from 0 to 120ms on a
 * 380ms animation is a 32% change, not an infinite one).
 */
export function timingSeverity(
  before: number,
  after: number,
  config: ComparisonConfig,
  tolerance = config.timing.toleranceMs,
  reference: number = before,
): Severity | null {
  const abs = Math.abs(after - before);
  if (abs <= tolerance) return null;
  const rel = reference > 0 ? abs / reference : Number.POSITIVE_INFINITY;
  const t = config.timing;
  if (t.criticalRelative !== null && rel >= t.criticalRelative && abs >= t.warnAbsoluteMs)
    return "critical";
  if (rel >= t.warnRelative && abs >= t.warnAbsoluteMs) return "warning";
  return "info";
}

/** Graded severity for a magnitude with a "no change" tolerance and a warning threshold. */
export function magnitudeSeverity(abs: number, tolerance: number, warnAt: number): Severity | null {
  if (abs <= tolerance) return null;
  return abs >= warnAt ? "warning" : "info";
}

export function capSeverity(severity: Severity, cap: Severity): Severity {
  const rank = { critical: 3, warning: 2, info: 1, uncertain: 0 } as const;
  return rank[severity] > rank[cap] ? cap : severity;
}

export type ChangeDraft = Omit<Change, "severity" | "rule"> & {
  severity: Severity;
  rule: SeverityRule;
};

/** Finalizes drafts: applies overrides (dropping disabled rules) and the low-confidence policy. */
export function finalizeChanges(
  drafts: ChangeDraft[],
  config: ComparisonConfig,
  uncertain: string | null,
): Change[] {
  const out: Change[] = [];
  for (const draft of drafts) {
    let severity = applyOverride(draft.rule, draft.severity, config);
    if (severity === null) continue;
    let message = draft.message;
    if (uncertain && draft.kind !== "element-match" && !config.severity[draft.rule]) {
      severity = "uncertain";
      message = `${message} (${uncertain})`;
    }
    out.push({ ...draft, severity, message });
  }
  return out;
}
