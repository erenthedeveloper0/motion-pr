import { useEffect, useMemo, useRef, type ReactNode } from "react";
import gsap from "gsap";
import type { AnimationRecord, Change, ChangeKind } from "@motionpr/core";
import { ms, num, percent, signed } from "../format.ts";
import { usePrefersReducedMotion } from "../hooks.ts";
import {
  boxAt,
  varyingChannels,
  CHANNELS,
  ENGINE_LABEL,
  type CheckpointView,
  type TrackView,
} from "../model.ts";
import { useTime, useViewer } from "../state.tsx";
import { EasingChart, ValueChart } from "./Charts.tsx";
import { SectionTitle, SeverityMark, Tag, cx, SEVERITY_TEXT } from "./ui.tsx";
import { ScrollInspector } from "./Scroll.tsx";

type Getter = (r: AnimationRecord) => string | number | null;

const ROWS: {
  label: string;
  kinds: ChangeKind[];
  get: Getter;
  fmt?: (v: number) => string;
  numeric?: boolean;
}[] = [
  {
    label: "Duration",
    kinds: ["duration"],
    get: (r) => r.timing.duration,
    fmt: (v) => ms(v),
    numeric: true,
  },
  {
    label: "Delay",
    kinds: ["delay"],
    get: (r) => r.timing.delay,
    fmt: (v) => ms(v),
    numeric: true,
  },
  {
    label: "End delay",
    kinds: ["end-delay"],
    get: (r) => r.timing.endDelay,
    fmt: (v) => ms(v),
    numeric: true,
  },
  {
    label: "Start",
    kinds: ["start"],
    get: (r) => r.startTime,
    fmt: (v) => ms(v, 1),
    numeric: true,
  },
  { label: "Iterations", kinds: ["iterations"], get: (r) => r.timing.iterations },
  { label: "Direction", kinds: ["direction"], get: (r) => r.timing.direction },
  {
    label: "Playback rate",
    kinds: ["playback-rate"],
    get: (r) => r.timing.playbackRate,
    fmt: (v) => `${v}×`,
    numeric: true,
  },
  { label: "Fill", kinds: ["fill"], get: (r) => r.timing.fill },
  { label: "Easing", kinds: ["easing"], get: (r) => r.timing.effectiveEasing.value },
  {
    label: "Easing scope",
    kinds: [],
    get: (r) =>
      r.timing.effectiveEasing.scope === "segment" ? "per keyframe segment" : "whole iteration",
  },
  { label: "Source", kinds: [], get: (r) => `${r.source} · ${r.type}` },
  { label: "Timeline", kinds: [], get: (r) => r.timeline },
];

function Cell({
  value,
  fmt,
  missing,
}: {
  value: string | number | null | undefined;
  fmt: ((v: number) => string) | undefined;
  missing: string;
}) {
  if (value === null || value === undefined) {
    return (
      <span className="text-g-500" title={missing}>
        —
      </span>
    );
  }
  return <>{typeof value === "number" && fmt ? fmt(value) : String(value)}</>;
}

function TimingTable({ track, comparison }: { track: TrackView; comparison: boolean }) {
  const changed = new Set(track.comparison?.changes.map((c) => c.kind) ?? []);
  const sides = comparison ? (["baseline", "candidate"] as const) : (["candidate"] as const);
  return (
    <table className="w-full table-fixed border-collapse text-xs tabular">
      <thead>
        <tr className="text-left font-mono text-2xs text-g-500">
          <th className="w-[28%] py-1 font-normal">
            <span className="sr-only">Property</span>
          </th>
          {comparison && (
            <th className="py-1 font-normal">
              <span className="inline-flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-base" />
                baseline
              </span>
            </th>
          )}
          <th className="py-1 font-normal">
            <span className="inline-flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-cand" />
              {comparison ? "candidate" : "value"}
            </span>
          </th>
          {comparison && <th className="w-[16%] py-1 text-right font-normal">Δ</th>}
        </tr>
      </thead>
      <tbody>
        {ROWS.map((row) => {
          const b = track.baseline ? row.get(track.baseline) : undefined;
          const c = track.candidate ? row.get(track.candidate) : undefined;
          const isChanged = row.kinds.some((k) => changed.has(k));
          const delta =
            row.numeric && typeof b === "number" && typeof c === "number" ? c - b : null;
          return (
            <tr
              key={row.label}
              className={cx("border-t border-white/[0.04]", isChanged && "bg-sev-warning/[0.05]")}
            >
              <th scope="row" className="py-1.5 pr-2 text-left align-top font-normal text-g-400">
                <span className="flex items-center gap-1.5">
                  {isChanged && (
                    <span className="size-1 rounded-full bg-sev-warning" aria-label="changed" />
                  )}
                  {row.label}
                </span>
              </th>
              {sides.map((side) => (
                <td
                  key={side}
                  className={cx(
                    "py-1.5 pr-2 align-top font-mono text-[11.5px] break-words",
                    isChanged && side === "candidate" ? "text-paper" : "text-g-200",
                  )}
                  title={String((side === "baseline" ? b : c) ?? "")}
                >
                  <Cell
                    value={side === "baseline" ? b : c}
                    fmt={row.fmt}
                    missing={
                      (side === "baseline" ? track.baseline : track.candidate)
                        ? "Not captured for this animation"
                        : `Animation not present in the ${side}`
                    }
                  />
                </td>
              ))}
              {comparison && (
                <td
                  className={cx(
                    "py-1.5 text-right font-mono text-[11.5px]",
                    delta ? "text-sev-warning" : "text-g-500",
                  )}
                >
                  {delta === null
                    ? ""
                    : row.label === "Playback rate"
                      ? signed(delta, 2, "×")
                      : signed(delta, 1, "ms")}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ChangeList({ changes }: { changes: Change[] }) {
  if (!changes.length)
    return (
      <p className="text-xs text-g-400">
        No differences: timing, easing and sampled values match within tolerances.
      </p>
    );
  return (
    <ul className="space-y-1.5">
      {changes.map((ch, i) => (
        <li key={i} className="flex gap-2 rounded-sm bg-g-850 px-2.5 py-2 text-xs">
          <SeverityMark severity={ch.severity} className="mt-[5px]" />
          <span className="min-w-0 flex-1">
            <span className="text-paper">{ch.message}</span>
            <span className="mt-0.5 flex flex-wrap gap-1.5 font-mono text-2xs text-g-500">
              <span className={SEVERITY_TEXT[ch.severity]}>{ch.severity}</span>
              <span>· {ch.kind}</span>
              {ch.measurement !== "measured" && (
                <span className="text-sev-uncertain">· {ch.measurement}</span>
              )}
              <span>· rule {ch.rule}</span>
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Properties({ track }: { track: TrackView }) {
  const props = useMemo(() => {
    const names = new Set(
      [...(track.baseline?.properties ?? []), ...(track.candidate?.properties ?? [])].map(
        (p) => p.property,
      ),
    );
    return [...names].sort().map((name) => ({
      name,
      b: track.baseline?.properties.find((p) => p.property === name) ?? null,
      c: track.candidate?.properties.find((p) => p.property === name) ?? null,
    }));
  }, [track]);
  return (
    <ul className="space-y-1">
      {props.map((p) => (
        <li key={p.name} className="rounded-sm bg-g-850 px-2.5 py-2">
          <div className="flex items-center gap-2 font-mono text-xs text-paper">
            {p.name}
            {!p.b && track.baseline && <Tag tone="cand">added</Tag>}
            {!p.c && track.candidate && <Tag>removed</Tag>}
          </div>
          {[p.b && { side: "baseline", v: p.b }, p.c && { side: "candidate", v: p.c }]
            .filter(Boolean)
            .map((x) => {
              const { side, v } = x as { side: string; v: NonNullable<typeof p.b> };
              return (
                <div
                  key={side}
                  className="mt-1 flex items-center gap-2 font-mono text-2xs text-g-300"
                >
                  <span
                    className={cx(
                      "size-1.5 shrink-0 rounded-full",
                      side === "baseline" ? "bg-base" : "bg-cand",
                    )}
                  />
                  <span className="truncate" title={`${v.from ?? "?"} → ${v.to ?? "?"}`}>
                    {v.from ?? "—"} <span className="text-g-500">→</span> {v.to ?? "—"}
                  </span>
                  {v.keyframes.length > 2 && (
                    <span className="shrink-0 text-g-500">{v.keyframes.length} keyframes</span>
                  )}
                </div>
              );
            })}
        </li>
      ))}
    </ul>
  );
}

function Identity({ r, side }: { r: AnimationRecord; side: "baseline" | "candidate" }) {
  const e = r.element;
  return (
    <div className="space-y-1 rounded-sm bg-g-850 px-2.5 py-2 text-xs">
      <div className="flex items-center gap-2">
        <span
          className={cx("size-1.5 rounded-full", side === "baseline" ? "bg-base" : "bg-cand")}
        />
        <code className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-paper" title={e.key}>
          {e.key}
        </code>
        <Tag
          tone={e.confidence === "high" ? "violet" : e.confidence === "medium" ? "neutral" : "warn"}
          title={`Matched by ${e.method}`}
        >
          {e.method} · {e.confidence}
        </Tag>
      </div>
      <div className="truncate font-mono text-2xs text-g-400" title={e.selector}>
        &lt;{e.tag}&gt; {e.selector}
      </div>
      {e.warnings.map((w) => (
        <p key={w} className="text-2xs text-sev-uncertain">
          {w}
        </p>
      ))}
    </div>
  );
}

function LiveBounds({ track }: { track: TrackView }) {
  const t = useTime();
  const rows = (["baseline", "candidate"] as const)
    .map((side) => ({ side, box: boxAt(track[side], t) }))
    .filter((r) => track[r.side]);
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-2xs tabular">
      {rows.map(({ side, box }) => (
        <div key={side} className="contents">
          <dt className="flex items-center gap-1.5 text-g-400">
            <span
              className={cx("size-1.5 rounded-full", side === "baseline" ? "bg-base" : "bg-cand")}
            />
            {side}
          </dt>
          <dd className="m-0 text-g-200">
            {box
              ? `x ${num(box.x, 1)}  y ${num(box.y, 1)}  ${num(box.width, 1)}×${num(box.height, 1)}`
              : "not measurable at this time"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Completeness({ track }: { track: TrackView }) {
  const items = (["baseline", "candidate"] as const)
    .map((side) => ({ side, r: track[side] }))
    .filter((x) => x.r && x.r.completeness.status !== "complete");
  if (!items.length) return null;
  return (
    <div className="space-y-1.5">
      {items.map(({ side, r }) => (
        <div
          key={side}
          className="rounded-sm border border-sev-uncertain/25 bg-sev-uncertain/[0.06] px-2.5 py-2 text-xs"
        >
          <p className="font-mono text-2xs text-sev-uncertain uppercase">
            {side}: {r!.completeness.status}
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-g-200">
            {r!.completeness.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-b px-4 pt-1 pb-4">
      <SectionTitle aside={aside}>{title}</SectionTitle>
      {children}
    </section>
  );
}

const PROVENANCE_TONE: Record<string, string> = {
  declared: "text-g-300",
  observed: "text-base",
  inferred: "text-sev-uncertain",
  unavailable: "text-sev-critical",
};

/** Engine, driver, owning timeline, field provenance and scroll correlation of a track. */
function EngineInfo({ track, checkpoint }: { track: TrackView; checkpoint: CheckpointView }) {
  const ref = track.candidate ?? track.baseline!;
  const timeline = ref.parent
    ? checkpoint.timelines.find((tl) => (tl.candidate ?? tl.baseline)?.id === ref.parent)
    : null;
  const tl = timeline ? (timeline.candidate ?? timeline.baseline) : null;
  const provenance = Object.entries(ref.provenance ?? {});
  const correlated = checkpoint.correlations.filter(
    (c) => c.animation === track.candidate?.id || c.animation === track.baseline?.id,
  );
  return (
    <div className="mt-2 flex flex-col gap-1 font-mono text-2xs text-g-400">
      <p>
        <span className="text-g-200">{ENGINE_LABEL[track.engine]}</span> · rendered by{" "}
        {ref.driver === "javascript"
          ? "JavaScript (engine loop)"
          : ref.driver === "waapi"
            ? "Web Animations API"
            : "CSS engine"}
        {ref.source !== "native" && ref.driver === "waapi"
          ? ` · created by ${ENGINE_LABEL[track.engine]}`
          : ""}
      </p>
      {tl && (
        <p>
          timeline <span className="text-g-200">{tl.name ?? tl.id}</span>
          {tl.labels.length
            ? ` · labels ${tl.labels.map((l) => `${l.name}@${Math.round(l.time)}ms`).join(", ")}`
            : ""}
        </p>
      )}
      {provenance.length > 0 && (
        <p className="flex flex-wrap gap-x-2" title="How each value was obtained">
          {provenance.map(([field, how]) => (
            <span key={field}>
              {field}: <span className={PROVENANCE_TONE[how] ?? ""}>{how}</span>
            </span>
          ))}
        </p>
      )}
      {correlated.length > 0 && (
        <p>
          {correlated.some((c) => c.kind === "scroll-linked")
            ? "scroll-linked to "
            : "ran during scroll of "}
          {[...new Set(correlated.map((c) => c.scroll))].join(", ")}
          {correlated.every((c) => c.kind === "overlap")
            ? " (correlation in time, not causation)"
            : ""}
        </p>
      )}
    </div>
  );
}

function TrackInspector({ track, checkpoint }: { track: TrackView; checkpoint: CheckpointView }) {
  const { model, state, dispatch } = useViewer();
  const t = useTime();
  const comparison = model.mode === "comparison";
  const channels = useMemo(() => varyingChannels([track.baseline, track.candidate]), [track]);
  const channel =
    state.channel && channels.includes(state.channel) ? state.channel : (channels[0] ?? null);
  const ref = track.candidate ?? track.baseline!;
  return (
    <>
      <div className="border-b px-4 py-3">
        <div className="flex items-start gap-2">
          <SeverityMark severity={track.severity} className="mt-1.5" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-medium text-paper">{track.label}</h2>
            <p className="truncate font-mono text-2xs text-g-400">{track.detail}</p>
          </div>
          <Tag
            tone={
              track.status === "changed" ? "warn" : track.status === "added" ? "cand" : "neutral"
            }
          >
            {track.status}
          </Tag>
          <button
            type="button"
            onClick={() => dispatch({ type: "select-track", key: null })}
            className="font-mono text-2xs text-g-400 hover:text-paper"
            aria-label="Clear selection"
          >
            esc
          </button>
        </div>
        <EngineInfo track={track} checkpoint={checkpoint} />
        {track.comparison?.match && track.comparison.match.method !== "exact" && (
          <p className="mt-2 text-2xs text-sev-uncertain">
            Matched by {track.comparison.match.method} ({track.comparison.match.confidence}{" "}
            confidence). {track.comparison.match.notes.join(" ")}
          </p>
        )}
      </div>
      {comparison && (
        <Section title={`Changes (${track.comparison?.changes.length ?? 0})`}>
          {track.status === "removed" ? (
            <p className="text-xs text-sev-critical">
              This animation ran in the baseline and does not run in the candidate.
            </p>
          ) : track.status === "added" ? (
            <p className="text-xs text-cand">
              New in the candidate: there is nothing to compare it with.
            </p>
          ) : (
            <ChangeList changes={track.comparison?.changes ?? []} />
          )}
        </Section>
      )}
      <Section title="Timing">
        <TimingTable track={track} comparison={comparison} />
        {(track.baseline?.timing.keyframeEasings || track.candidate?.timing.keyframeEasings) && (
          <p className="mt-2 font-mono text-2xs text-g-400">
            keyframe easings:{" "}
            {(track.candidate ?? track.baseline)!.timing.keyframeEasings?.join(" · ")}
          </p>
        )}
      </Section>
      <Section
        title="Easing curve"
        aside={
          track.comparison?.easing ? (
            <span className="font-mono text-2xs text-g-400">
              max Δ {percent(track.comparison.easing.maxDeviation, 1)}
            </span>
          ) : undefined
        }
      >
        <EasingChart
          baseline={track.baseline}
          candidate={track.candidate}
          t={t}
          maxDeviationAt={
            track.comparison?.easing && track.comparison.easing.maxDeviation > 0.001
              ? track.comparison.easing.maxDeviationAt
              : undefined
          }
        />
      </Section>
      <Section
        title="Sampled values"
        aside={
          channels.length > 1 ? (
            <select
              aria-label="Channel"
              value={channel ?? ""}
              onChange={(e) =>
                dispatch({ type: "channel", channel: e.target.value as typeof channel })
              }
              className="h-6 rounded-xs border bg-g-850 px-1 font-mono text-2xs text-g-200"
            >
              {channels.map((c) => (
                <option key={c} value={c}>
                  {CHANNELS.find((x) => x.key === c)!.label}
                </option>
              ))}
            </select>
          ) : undefined
        }
      >
        {channel ? (
          <ValueChart
            baseline={track.baseline}
            candidate={track.candidate}
            channel={channel}
            duration={checkpoint.duration}
            t={t}
          />
        ) : (
          <p className="text-xs text-g-400">
            {ref.samples.length
              ? "Sampled values do not vary on any measured channel (e.g. colour or clip-path only); see properties below."
              : "No samples were captured for this animation."}
          </p>
        )}
      </Section>
      <Section title="Properties">
        <Properties track={track} />
      </Section>
      <Section title="Element">
        <div className="space-y-1.5">
          {track.baseline && comparison && <Identity r={track.baseline} side="baseline" />}
          {track.candidate && <Identity r={track.candidate} side="candidate" />}
          <div className="pt-1">
            <LiveBounds track={track} />
          </div>
        </div>
      </Section>
      {track.completeness !== "complete" && (
        <Section title="Capture completeness">
          <Completeness track={track} />
        </Section>
      )}
    </>
  );
}

function CheckpointOverview({ checkpoint }: { checkpoint: CheckpointView }) {
  const { model, dispatch, scenario } = useViewer();
  const cmp = checkpoint.comparison;
  const cp = checkpoint.candidate ?? checkpoint.baseline;
  const diags = [
    ...(checkpoint.baseline?.diagnostics ?? []).map((d) => ({ ...d, side: "baseline" })),
    ...(checkpoint.candidate?.diagnostics ?? []).map((d) => ({
      ...d,
      side: model.mode === "comparison" ? "candidate" : "capture",
    })),
  ];
  const changed = checkpoint.tracks.filter(
    (t) => t.status !== "unchanged" && t.status !== "captured",
  );
  return (
    <>
      <div className="border-b px-4 py-3">
        <p className="font-mono text-2xs tracking-[0.12em] text-g-400 uppercase">Checkpoint</p>
        <h2 className="mt-0.5 text-sm font-medium text-paper">
          {scenario?.name} <span className="text-g-500">›</span> {checkpoint.label}
        </h2>
        <p className="mt-1 text-xs text-g-400">
          Select a track in the timeline to inspect one animation.
        </p>
      </div>
      <Section title="Summary">
        <dl className="grid grid-cols-2 gap-2 text-xs">
          {[
            ["Animations", String(checkpoint.tracks.length)],
            ["Changed", String(changed.length)],
            ["Window", ms(checkpoint.duration)],
            [
              "Frames",
              `${checkpoint.baseline?.frames.length ?? "—"} / ${checkpoint.candidate?.frames.length ?? "—"}`,
            ],
            ["Origin", cp?.window.origin ?? "—"],
            [
              "Trigger latency",
              cmp?.latency
                ? `${ms(cmp.latency.baseline)} → ${ms(cmp.latency.candidate)}`
                : ms(cp?.window.latency),
            ],
          ].map(([k, v]) => (
            <div key={k} className="rounded-sm bg-g-850 px-2.5 py-2">
              <dt className="font-mono text-2xs text-g-500">{k}</dt>
              <dd className="m-0 mt-0.5 font-mono text-paper tabular">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>
      {changed.length > 0 && (
        <Section title="Changed animations">
          <ul className="space-y-1">
            {changed.map((t) => (
              <li key={t.key}>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "select-track", key: t.key })}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-g-800"
                >
                  <SeverityMark severity={t.severity} />
                  <span className="min-w-0 flex-1 truncate text-paper">{t.label}</span>
                  <span className="truncate font-mono text-2xs text-g-400">{t.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {cmp?.stagger.length ? (
        <Section title="Stagger">
          {cmp.stagger.map((s) => (
            <p key={s.group} className="rounded-sm bg-g-850 px-2.5 py-2 text-xs text-paper">
              <SeverityMark severity={s.severity} className="mr-2" />
              Interval {ms(s.baselineInterval)} → {ms(s.candidateInterval)} across {s.members}{" "}
              elements ({signed(s.delta, 1, "ms")})
            </p>
          ))}
        </Section>
      ) : null}
      {cmp?.visual && (
        <Section title="Settled frame">
          <p className="text-xs text-g-200">
            {cmp.visual.status === "identical"
              ? "Pixel-identical at the end of the motion window."
              : cmp.visual.status === "not-comparable"
                ? (cmp.visual.reason ?? "Not comparable.")
                : `${cmp.visual.mismatchPixels.toLocaleString()} pixels differ (${percent(cmp.visual.mismatchRatio, 3)}; reported above ${percent(cmp.visual.maxDiffRatio, 2)}).`}
          </p>
          {cmp.visual.diffAsset && (
            <button
              type="button"
              onClick={() => dispatch({ type: "mode", mode: "pixel" })}
              className="mt-2 text-xs text-violet-hi hover:underline"
            >
              Show pixel diff
            </button>
          )}
        </Section>
      )}
      {diags.length > 0 && (
        <Section title={`Diagnostics (${diags.length})`}>
          <Diagnostics items={diags} />
        </Section>
      )}
    </>
  );
}

type DiagItem = {
  level: string;
  code: string;
  message: string;
  hint?: string | undefined;
  side: string;
};

function DiagRow({ d }: { d: DiagItem }) {
  return (
    <li className="rounded-sm bg-g-850 px-2.5 py-2 text-xs">
      <span
        className={cx(
          "font-mono text-2xs uppercase",
          d.level === "warning"
            ? "text-sev-warning"
            : d.level === "error"
              ? "text-sev-critical"
              : "text-g-400",
        )}
      >
        {d.side} · {d.code}
      </span>
      <p className="mt-0.5 text-g-200">{d.message}</p>
      {d.hint && <p className="mt-0.5 text-g-400">{d.hint}</p>}
    </li>
  );
}

/** Warnings and errors are shown; informational notes are folded away. */
function Diagnostics({ items }: { items: DiagItem[] }) {
  const important = items.filter((d) => d.level !== "info");
  const info = items.filter((d) => d.level === "info");
  return (
    <div className="space-y-1.5">
      {important.length > 0 && (
        <ul className="space-y-1.5">
          {important.map((d, i) => (
            <DiagRow key={i} d={d} />
          ))}
        </ul>
      )}
      {info.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none text-xs text-g-400 hover:text-paper">
            <span className="inline-block transition-transform group-open:rotate-90">›</span>{" "}
            {info.length} informational note{info.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-1.5 space-y-1.5">
            {info.map((d, i) => (
              <DiagRow key={i} d={d} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function Inspector() {
  const { checkpoint, track, scenario, scroll } = useViewer();
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const key = `${checkpoint?.id}|${track?.key ?? scroll?.key ?? ""}`;
  useEffect(() => {
    if (reduced || !ref.current) return;
    const tween = gsap.fromTo(
      ref.current,
      { opacity: 0, y: 6 },
      { opacity: 1, y: 0, duration: 0.32, ease: "expo.out", clearProps: "transform,opacity" },
    );
    return () => {
      tween.kill();
    };
  }, [key, reduced]);
  if (scenario?.status === "failed" && scenario.error) {
    return (
      <div className="p-4">
        <p className="font-mono text-2xs text-sev-critical uppercase">Scenario failed</p>
        <p className="mt-1 text-sm whitespace-pre-wrap text-g-200">{scenario.error}</p>
      </div>
    );
  }
  if (!checkpoint) return <p className="p-4 text-sm text-g-400">Nothing selected.</p>;
  return (
    <div ref={ref}>
      {track ? (
        <TrackInspector track={track} checkpoint={checkpoint} />
      ) : scroll ? (
        <ScrollInspector view={scroll} checkpoint={checkpoint} />
      ) : (
        <CheckpointOverview checkpoint={checkpoint} />
      )}
    </div>
  );
}
