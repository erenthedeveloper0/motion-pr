import type {
  ComparisonConfig,
  Severity,
  TimelineComparison,
  TimelineRecord,
} from "@motionpr/core";
import { finalizeChanges, timingSeverity, type ChangeDraft } from "./severity.ts";

/**
 * Timelines are compared as containers: their own duration, repeat and speed, and the sequence
 * expressed by their labels. Child animations are compared individually by the animation rules;
 * here only the membership count is reported, as context.
 */
export function compareTimelineRecords(
  baseline: readonly TimelineRecord[],
  candidate: readonly TimelineRecord[],
  config: ComparisonConfig,
): TimelineComparison[] {
  const out: TimelineComparison[] = [];
  const cById = new Map(candidate.map((t) => [t.id, t]));
  const rank = { critical: 3, warning: 2, info: 1, uncertain: 0 } as const;
  for (const b of baseline) {
    const c = cById.get(b.id);
    if (!c) {
      out.push({ key: b.id, source: b.source, status: "removed", changes: [], severity: null });
      continue;
    }
    cById.delete(b.id);
    const drafts: ChangeDraft[] = [];
    if (b.duration !== null && c.duration !== null) {
      const severity = timingSeverity(b.duration, c.duration, config);
      if (severity)
        drafts.push({
          kind: "timeline-duration",
          rule: "timeline",
          before: b.duration,
          after: c.duration,
          delta: c.duration - b.duration,
          unit: "ms",
          measurement: "measured",
          severity,
          message: `Timeline duration ${Math.round(b.duration)}ms → ${Math.round(c.duration)}ms`,
        });
    }
    if (b.iterations !== c.iterations)
      drafts.push({
        kind: "timeline-iterations",
        rule: "timeline",
        before: b.iterations,
        after: c.iterations,
        measurement: "measured",
        severity: "warning",
        message: `Timeline repeats ${b.iterations} → ${c.iterations}`,
      });
    if (Math.abs(b.playbackRate - c.playbackRate) > 1e-6)
      drafts.push({
        kind: "timeline-playback-rate",
        rule: "timeline",
        before: b.playbackRate,
        after: c.playbackRate,
        measurement: "measured",
        severity: "warning",
        message: `Timeline speed ${b.playbackRate}× → ${c.playbackRate}×`,
      });
    const labelsB = new Map(b.labels.map((l) => [l.name, l.time]));
    const labelsC = new Map(c.labels.map((l) => [l.name, l.time]));
    const span = Math.max(b.duration ?? 0, 1);
    for (const [name, tb] of labelsB) {
      const tc = labelsC.get(name);
      if (tc === undefined) {
        drafts.push({
          kind: "timeline-labels",
          rule: "timeline",
          property: name,
          before: tb,
          after: null,
          measurement: "measured",
          severity: "warning",
          message: `Label “${name}” removed from the timeline`,
        });
        continue;
      }
      const severity = timingSeverity(tb, tc, config, config.timing.toleranceMs, span);
      if (severity)
        drafts.push({
          kind: "timeline-labels",
          rule: "timeline",
          property: name,
          before: tb,
          after: tc,
          delta: tc - tb,
          unit: "ms",
          measurement: "measured",
          severity,
          message: `Label “${name}” moved ${Math.round(tb)}ms → ${Math.round(tc)}ms`,
        });
    }
    for (const [name, tc] of labelsC)
      if (!labelsB.has(name))
        drafts.push({
          kind: "timeline-labels",
          rule: "timeline",
          property: name,
          before: null,
          after: tc,
          measurement: "measured",
          severity: "info",
          message: `Label “${name}” added at ${Math.round(tc)}ms`,
        });
    const order = (t: TimelineRecord) =>
      [...t.labels].sort((x, y) => x.time - y.time).map((l) => l.name);
    const ob = order(b).filter((n) => labelsC.has(n));
    const oc = order(c).filter((n) => labelsB.has(n));
    if (ob.join("\u0000") !== oc.join("\u0000"))
      drafts.push({
        kind: "timeline-labels",
        rule: "timeline",
        before: ob.join(" → "),
        after: oc.join(" → "),
        measurement: "measured",
        severity: "warning",
        message: `Timeline sequence reordered: ${ob.join(" → ")} became ${oc.join(" → ")}`,
      });
    if (b.children.length !== c.children.length)
      drafts.push({
        kind: "timeline-children",
        rule: "timeline",
        before: b.children.length,
        after: c.children.length,
        measurement: "measured",
        severity: "info",
        message: `Timeline drives ${b.children.length} → ${c.children.length} animation records`,
      });
    const changes = finalizeChanges(drafts, config, null);
    out.push({
      key: b.id,
      source: c.source,
      status: changes.length ? "changed" : "unchanged",
      changes,
      severity: changes.reduce<Severity | null>(
        (acc, ch) => (acc === null || rank[ch.severity] > rank[acc] ? ch.severity : acc),
        null,
      ),
    });
  }
  for (const c of cById.values())
    out.push({ key: c.id, source: c.source, status: "added", changes: [], severity: null });
  return out;
}
