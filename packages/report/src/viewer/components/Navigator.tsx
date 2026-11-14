import { useMemo } from "react";
import type { Difference, Severity } from "@motionpr/core";
import { ms } from "../format.ts";
import {
  findDifferenceTarget,
  type ScenarioView,
  ENGINE_LABEL,
  differenceEngine,
  type EngineKey,
  type ReportModel,
} from "../model.ts";
import { sevRank, useViewer, type DiffFilter } from "../state.tsx";
import { Icon } from "./icons.tsx";
import { SeverityMark, Tag, cx, SEVERITY_TEXT } from "./ui.tsx";

function statusTag(s: ScenarioView) {
  if (s.status === "failed") return <Tag tone="warn">failed</Tag>;
  if (s.status === "added") return <Tag tone="cand">new</Tag>;
  if (s.status === "removed") return <Tag>removed</Tag>;
  return null;
}

export function ScenarioNav() {
  const { model, state, dispatch, time } = useViewer();
  const sorted = model.scenarios;
  return (
    <nav aria-label="Scenarios" className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-9 shrink-0 items-center justify-between border-b px-3">
        <h2 className="font-mono text-2xs tracking-[0.12em] text-g-400 uppercase">Scenarios</h2>
        <span className="font-mono text-2xs text-g-500">{sorted.length}</span>
      </header>
      <ul className="min-h-0 flex-1 overflow-y-auto p-1.5 mpr-scroll">
        {sorted.map((s) => {
          const selected = s.key === state.scenarioKey;
          return (
            <li key={s.key} className="mb-0.5">
              <button
                type="button"
                aria-current={selected ? "true" : undefined}
                onClick={() => {
                  dispatch({ type: "select-scenario", key: s.key });
                  time.set(0);
                }}
                className={cx(
                  "relative flex w-full flex-col gap-1 rounded-md px-2.5 py-2 text-left transition-colors duration-150",
                  selected ? "bg-g-800" : "hover:bg-g-850",
                )}
              >
                {selected && (
                  <span className="absolute top-2 bottom-2 left-0 w-[2px] rounded-full bg-violet-hi" />
                )}
                <span className="flex items-center gap-2">
                  <SeverityMark severity={s.severity} />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-paper">{s.name}</span>
                  {statusTag(s)}
                </span>
                <span className="flex items-center gap-2 pl-[15px] font-mono text-2xs text-g-400">
                  <span>{s.animationCount} anim</span>
                  <span className="text-g-600">·</span>
                  <span className={s.changeCount ? "text-g-200" : undefined}>
                    {s.changeCount} {s.changeCount === 1 ? "change" : "changes"}
                  </span>
                  <span className="text-g-600">·</span>
                  <span>{s.viewport}</span>
                  {s.completeness !== "complete" && (
                    <span
                      className="text-sev-uncertain"
                      title={`Some animations have ${s.completeness} capture data`}
                    >
                      ◇ {s.completeness}
                    </span>
                  )}
                </span>
              </button>
              {selected && s.checkpoints.length > 0 && (
                <ul
                  className="mt-0.5 mb-1.5 ml-[21px] border-l border-white/[0.06] pl-2"
                  aria-label={`Checkpoints of ${s.name}`}
                >
                  {s.checkpoints.map((c) => {
                    const active =
                      c.id === state.checkpointId ||
                      (!state.checkpointId && c === s.checkpoints[0]);
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          aria-current={active ? "true" : undefined}
                          onClick={() => {
                            dispatch({ type: "select-checkpoint", id: c.id });
                            time.set(0);
                          }}
                          className={cx(
                            "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs",
                            active
                              ? "bg-g-750 text-paper"
                              : "text-g-300 hover:bg-g-850 hover:text-paper",
                          )}
                        >
                          <SeverityMark severity={c.severity} />
                          <span className="min-w-0 flex-1 truncate font-mono">{c.label}</span>
                          <span className="font-mono text-2xs text-g-500 tabular">
                            {ms(c.duration)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {selected && s.error && (
                <p className="mx-2.5 mb-2 rounded-sm bg-sev-critical/10 px-2 py-1.5 text-2xs text-sev-critical">
                  {s.error.split("\n")[0]}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const FILTERS: { value: DiffFilter; label: string }[] = [
  { value: "added", label: "Added" },
  { value: "removed", label: "Removed" },
  { value: "changed", label: "Changed" },
  { value: "timing", label: "Timing" },
  { value: "easing", label: "Easing" },
  { value: "property", label: "Properties" },
  { value: "visual", label: "Visual" },
  { value: "uncertain", label: "Uncertain" },
  { value: "structure", label: "Structure" },
];
const SEVERITIES: Severity[] = ["critical", "warning", "uncertain", "info"];
const CHANGE_CATEGORIES = new Set(["timing", "easing", "property", "visual"]);

export function matchesFilters(
  d: Difference,
  filters: DiffFilter[],
  severities: Severity[],
  query: string,
): boolean {
  if (severities.length && !severities.includes(d.severity)) return false;
  if (filters.length) {
    const ok = filters.some((f) =>
      f === "uncertain"
        ? d.severity === "uncertain" || d.category === "uncertain"
        : f === "changed"
          ? CHANGE_CATEGORIES.has(d.category)
          : d.category === f,
    );
    if (!ok) return false;
  }
  if (query) {
    const q = query.toLowerCase();
    if (
      ![d.title, d.detail, d.scenarioKey, d.checkpoint ?? "", d.animationKey ?? ""].some((s) =>
        s.toLowerCase().includes(q),
      )
    )
      return false;
  }
  return true;
}

/** Engine of the record a difference is about; null for checkpoint-level differences. */
export function engineForDifference(model: ReportModel, d: Difference): EngineKey | null {
  const target = findDifferenceTarget(model, d);
  return target?.track?.engine ?? target?.scroll?.engine ?? differenceEngine(d);
}

export function DifferenceExplorer() {
  const { model, state, dispatch, time } = useViewer();
  const engines = useMemo(() => {
    const map = new Map<string, EngineKey | null>();
    for (const d of model.differences) map.set(d.id, engineForDifference(model, d));
    return map;
  }, [model]);
  const list = useMemo(
    () =>
      model.differences
        .filter((d) => matchesFilters(d, state.filters, state.severities, state.query))
        .filter((d) => {
          const engine = engines.get(d.id) ?? null;
          return state.engines.length === 0 || engine === null || state.engines.includes(engine);
        })
        .sort((a, b) => sevRank(b.severity) - sevRank(a.severity)),
    [model.differences, state.filters, state.severities, state.query, state.engines, engines],
  );
  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const f of FILTERS)
      out[f.value] = model.differences.filter((d) => matchesFilters(d, [f.value], [], "")).length;
    for (const s of SEVERITIES) out[s] = model.differences.filter((d) => d.severity === s).length;
    return out;
  }, [model.differences]);
  const active = state.filters.length + state.severities.length + (state.query ? 1 : 0);

  if (model.mode !== "comparison") {
    return (
      <p className="p-4 text-sm text-g-400">
        This report inspects a single capture. Differences appear once a baseline exists (run{" "}
        <code className="font-mono">motionpr baseline accept</code>, then{" "}
        <code className="font-mono">motionpr run</code>).
      </p>
    );
  }
  const open = (d: Difference) => {
    const target = findDifferenceTarget(model, d);
    if (!target) return;
    dispatch({
      type: "navigate",
      scenarioKey: target.scenario.key,
      checkpointId: target.checkpoint?.id ?? null,
      trackKey: target.track?.key ?? target.scroll?.key ?? null,
    });
    if (d.category === "visual") dispatch({ type: "mode", mode: "pixel" });
    // Jump to where the change becomes visible.
    const r = target.track?.candidate ?? target.track?.baseline;
    time.set(r?.startTime && r.startTime > 0 ? r.startTime + r.timing.delay : 0);
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b p-3">
        <label className="flex h-8 items-center gap-2 rounded-sm border bg-g-850 px-2 focus-within:border-violet/60">
          <Icon.Search className="text-g-400" />
          <span className="sr-only">Filter differences</span>
          <input
            value={state.query}
            onChange={(e) => dispatch({ type: "query", query: e.target.value })}
            placeholder="Filter by element, property, scenario…"
            className="min-w-0 flex-1 bg-transparent text-xs text-paper outline-none placeholder:text-g-500"
          />
        </label>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Severity filters">
          {SEVERITIES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={state.severities.includes(s)}
              onClick={() => dispatch({ type: "toggle-severity", severity: s })}
              disabled={!counts[s]}
              className={cx(
                "inline-flex h-6 items-center gap-1.5 rounded-xs border px-2 font-mono text-2xs disabled:opacity-35",
                state.severities.includes(s)
                  ? "border-current bg-current/10"
                  : "border-transparent bg-g-850 hover:bg-g-800",
                SEVERITY_TEXT[s],
              )}
            >
              <SeverityMark severity={s} />
              {s} {counts[s]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Category filters">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={state.filters.includes(f.value)}
              disabled={!counts[f.value]}
              onClick={() => dispatch({ type: "toggle-filter", filter: f.value })}
              className={cx(
                "h-6 rounded-xs px-2 text-2xs disabled:opacity-35",
                state.filters.includes(f.value)
                  ? "bg-violet/25 text-paper shadow-[inset_0_0_0_1px_rgb(155_116_240/0.6)]"
                  : "bg-g-850 text-g-300 hover:bg-g-800 hover:text-paper",
              )}
            >
              {f.label} <span className="font-mono text-g-500">{counts[f.value]}</span>
            </button>
          ))}
          {active > 0 && (
            <button
              type="button"
              onClick={() => dispatch({ type: "clear-filters" })}
              className="h-6 px-2 text-2xs text-violet-hi hover:underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>
      <p className="px-3 pt-2 font-mono text-2xs text-g-500" aria-live="polite">
        {list.length} of {model.differences.length} differences
      </p>
      <ul className="min-h-0 flex-1 overflow-y-auto p-1.5 mpr-scroll">
        {list.length === 0 && (
          <li className="p-3 text-xs text-g-400">
            {model.differences.length
              ? "No differences match these filters."
              : "No differences: every animation matches the baseline within its thresholds."}
          </li>
        )}
        {list.slice(0, 400).map((d) => (
          <li key={d.id}>
            <button
              type="button"
              onClick={() => open(d)}
              className="flex w-full gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-g-850"
            >
              <SeverityMark severity={d.severity} className="mt-[5px]" />
              <span className="min-w-0 flex-1">
                <span className="block text-xs leading-[17px] text-paper">{d.title}</span>
                <span className="mt-0.5 flex flex-wrap gap-x-1.5 font-mono text-2xs text-g-500">
                  <span>{d.scenarioKey.replace(/@default$/, "")}</span>
                  {d.checkpoint && <span>› {d.checkpoint}</span>}
                  <span>· {d.category}</span>
                  {engines.get(d.id) && <span>· {ENGINE_LABEL[engines.get(d.id)!]}</span>}
                  {d.measurement !== "measured" && (
                    <span className="text-sev-uncertain">· {d.measurement}</span>
                  )}
                </span>
              </span>
            </button>
          </li>
        ))}
        {list.length > 400 && (
          <li className="p-3 text-xs text-g-400">
            {list.length - 400} more; narrow the filters to see them.
          </li>
        )}
      </ul>
    </div>
  );
}
