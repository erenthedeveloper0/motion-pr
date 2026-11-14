import { useId, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { ScrollMetrics, ScrollMotionRecord } from "@motionpr/core";
import { ms, num } from "../format.ts";
import {
  ENGINE_LABEL,
  scrollAt,
  scrollVelocities,
  type CheckpointView,
  type EngineKey,
  type ScrollTrackView,
  type TimelineView,
} from "../model.ts";
import { useSeek, useTime, useViewer } from "../state.tsx";
import { SectionTitle, SeverityMark, Tag, cx } from "./ui.tsx";

const BASE = "#839CF6";
const CAND = "#ECA67A";
const W = 300;
const H = 150;
const M = { l: 38, r: 8, t: 10, b: 20 };

// ---------------------------------------------------------------------------------------------
// Engine filter
// ---------------------------------------------------------------------------------------------

/** Engines present in a checkpoint (animation tracks and scroll records). */
export function enginesIn(checkpoint: CheckpointView | null): EngineKey[] {
  if (!checkpoint) return [];
  const set = new Set<EngineKey>();
  for (const t of checkpoint.tracks) set.add(t.engine);
  for (const s of checkpoint.scroll) set.add(s.engine);
  const order: EngineKey[] = [
    "css",
    "waapi",
    "gsap",
    "animejs",
    "lenis",
    "native-scroll",
    "custom",
  ];
  return order.filter((e) => set.has(e));
}

export function EngineFilter({ engines }: { engines: EngineKey[] }) {
  const { state, dispatch } = useViewer();
  if (engines.length < 2 && state.engines.length === 0) return null;
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Filter by engine">
      {engines.map((engine) => {
        const on = state.engines.includes(engine);
        return (
          <button
            key={engine}
            type="button"
            aria-pressed={on}
            onClick={() => dispatch({ type: "toggle-engine", engine })}
            className={cx(
              "rounded-sm border px-1.5 py-px font-mono text-2xs transition-colors",
              on
                ? "border-violet-hi/60 bg-violet/20 text-paper"
                : "border-white/10 text-g-400 hover:text-g-200",
            )}
          >
            {ENGINE_LABEL[engine]}
          </button>
        );
      })}
    </div>
  );
}

export function engineVisible(engine: EngineKey, selected: readonly EngineKey[]): boolean {
  return selected.length === 0 || selected.includes(engine);
}

// ---------------------------------------------------------------------------------------------
// Timeline lanes
// ---------------------------------------------------------------------------------------------

function sparkPath(
  r: ScrollMotionRecord,
  x: (t: number) => number,
  lo: number,
  hi: number,
  height: number,
): string {
  const span = hi - lo || 1;
  return r.samples
    .map((s, i) => {
      const y = height - 3 - ((s.animatedScroll - lo) / span) * (height - 6);
      return `${i ? "L" : "M"}${x(s.time).toFixed(1)},${y.toFixed(1)}`;
    })
    .join("");
}

/** Timeline row of a scroller: its rendered position over time for both sides. */
export function ScrollLaneRow({
  view,
  selected,
  x,
  width,
  height,
  labelWidth,
  onSelect,
}: {
  view: ScrollTrackView;
  selected: boolean;
  x: (t: number) => number;
  width: number;
  height: number;
  labelWidth: number;
  onSelect: () => void;
}) {
  const records = [view.baseline, view.candidate].filter(Boolean) as ScrollMotionRecord[];
  const values = records.flatMap((r) => r.samples.map((s) => s.animatedScroll));
  const lo = Math.min(...values, 0);
  const hi = Math.max(...values, 1);
  return (
    <div
      role="row"
      aria-selected={selected}
      className={cx(
        "relative flex border-b border-white/[0.04]",
        selected ? "bg-violet/[0.09]" : "hover:bg-white/[0.02]",
      )}
      style={{ height }}
    >
      <button
        type="button"
        role="gridcell"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`${view.label}, scroll motion, ${view.status}${view.severity ? `, ${view.severity}` : ""}`}
        className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r bg-g-900 px-3 text-left"
        style={{ width: labelWidth }}
        data-track={view.key}
      >
        {selected && <span className="absolute top-0 left-0 h-full w-[2px] bg-violet-hi" />}
        <SeverityMark severity={view.severity} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs text-paper">{view.label}</span>
          <span className="block truncate font-mono text-2xs text-g-400">
            scroll motion · {view.detail}
          </span>
        </span>
        {view.status === "added" && <Tag tone="cand">new</Tag>}
        {view.status === "removed" && <Tag>gone</Tag>}
      </button>
      <div role="gridcell" className="relative flex-1" onClick={onSelect}>
        <svg width={width} height={height} className="absolute inset-0" aria-hidden="true">
          {view.baseline && (
            <path
              d={sparkPath(view.baseline, x, lo, hi, height)}
              fill="none"
              stroke={BASE}
              strokeWidth={1.5}
              strokeDasharray={view.candidate ? "3 2" : undefined}
            />
          )}
          {view.candidate && (
            <path
              d={sparkPath(view.candidate, x, lo, hi, height)}
              fill="none"
              stroke={CAND}
              strokeWidth={1.5}
            />
          )}
        </svg>
      </div>
    </div>
  );
}

/** Timeline row of a GSAP / Anime.js timeline: its span and label positions. */
export function TimelineLaneRow({
  view,
  x,
  height,
  labelWidth,
}: {
  view: TimelineView;
  x: (t: number) => number;
  height: number;
  labelWidth: number;
}) {
  const bars = (
    [
      [view.baseline, BASE, 6],
      [view.candidate, CAND, height - 12],
    ] as const
  ).filter(([r]) => r && r.startTime !== null && r.duration !== null);
  return (
    <div role="row" className="relative flex border-b border-white/[0.04]" style={{ height }}>
      <div
        role="gridcell"
        className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r bg-g-900 px-3"
        style={{ width: labelWidth }}
      >
        <SeverityMark severity={view.severity} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs text-g-200">{view.label}</span>
          <span className="block truncate font-mono text-2xs text-g-400">
            {ENGINE_LABEL[view.engine]} timeline
          </span>
        </span>
        {view.status === "added" && <Tag tone="cand">new</Tag>}
        {view.status === "removed" && <Tag>gone</Tag>}
      </div>
      <div role="gridcell" className="relative flex-1">
        {bars.map(([r, color, top]) => {
          const start = r!.startTime!;
          const iterations = r!.iterations === "infinite" ? 1 : r!.iterations;
          const end = start + r!.duration! * iterations;
          return (
            <div
              key={color}
              className="absolute"
              style={{ left: x(start), width: Math.max(2, x(end) - x(start)), top, height: 6 }}
            >
              <div
                className="h-full rounded-xs"
                style={{ background: `${color}33`, boxShadow: `inset 0 0 0 1px ${color}` }}
              />
              {r!.labels.map((l) => (
                <span
                  key={l.name}
                  title={`${l.name} @ ${Math.round(l.time)}ms`}
                  className="absolute -top-1 h-[14px] w-px"
                  style={{ left: x(start + l.time) - x(start), background: color }}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Inspector
// ---------------------------------------------------------------------------------------------

interface Series {
  color: string;
  dashed?: boolean;
  points: { t: number; y: number }[];
  name: string;
}

function LineChart({
  series,
  domain,
  t,
  unit,
  title,
  onSeek,
}: {
  series: Series[];
  domain: [number, number];
  t: number;
  unit: string;
  title: string;
  onSeek: (t: number) => void;
}) {
  const id = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const ys = series.flatMap((s) => s.points.map((p) => p.y));
  const yMin = Math.min(...ys, 0);
  const yMax = Math.max(...ys, yMin + 1);
  const [t0, t1] = domain;
  const sx = (v: number) => M.l + ((v - t0) / (t1 - t0 || 1)) * (W - M.l - M.r);
  const sy = (v: number) => H - M.b - ((v - yMin) / (yMax - yMin || 1)) * (H - M.t - M.b);
  const fromPointer = (e: ReactPointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    return t0 + ((px - M.l) / (W - M.l - M.r)) * (t1 - t0);
  };
  return (
    <figure className="m-0">
      <figcaption className="mb-1 font-mono text-2xs text-g-400">{title}</figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full cursor-crosshair select-none"
        role="img"
        aria-label={`${title}: ${series.map((s) => s.name).join(", ")}`}
        onPointerMove={(e) => setHover(fromPointer(e))}
        onPointerLeave={() => setHover(null)}
        onPointerDown={(e) => onSeek(Math.min(Math.max(fromPointer(e), t0), t1))}
      >
        <defs>
          <clipPath id={`clip-${id}`}>
            <rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} />
          </clipPath>
        </defs>
        {[yMin, (yMin + yMax) / 2, yMax].map((v) => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={sy(v)} y2={sy(v)} stroke="rgb(255 255 255 / 0.06)" />
            <text
              x={M.l - 4}
              y={sy(v) + 3}
              textAnchor="end"
              className="fill-g-400 font-mono"
              fontSize={8}
            >
              {num(v, Math.abs(yMax - yMin) < 5 ? 2 : 0)}
            </text>
          </g>
        ))}
        <text x={W - M.r} y={H - 6} textAnchor="end" className="fill-g-400 font-mono" fontSize={8}>
          {ms(t1)} · {unit}
        </text>
        <g clipPath={`url(#clip-${id})`}>
          {series.map((s) => (
            <path
              key={s.name}
              d={s.points
                .map((p, i) => `${i ? "L" : "M"}${sx(p.t).toFixed(2)},${sy(p.y).toFixed(2)}`)
                .join("")}
              fill="none"
              stroke={s.color}
              strokeWidth={1.4}
              strokeDasharray={s.dashed ? "3 2" : undefined}
              opacity={s.dashed ? 0.8 : 1}
            />
          ))}
        </g>
        <line x1={sx(t)} x2={sx(t)} y1={M.t} y2={H - M.b} stroke="#9B74F0" strokeWidth={1} />
        {hover !== null && hover >= t0 && hover <= t1 && (
          <line
            x1={sx(hover)}
            x2={sx(hover)}
            y1={M.t}
            y2={H - M.b}
            stroke="rgb(255 255 255 / 0.25)"
            strokeDasharray="2 2"
          />
        )}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-2xs text-g-400">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-1">
            <span
              className="inline-block h-px w-3"
              style={{ background: s.color, opacity: s.dashed ? 0.7 : 1 }}
            />
            {s.name}
          </span>
        ))}
      </div>
    </figure>
  );
}

function MetricsTable({ b, c }: { b: ScrollMetrics | null; c: ScrollMetrics | null }) {
  const rows: [string, (m: ScrollMetrics) => string][] = [
    ["start → end", (m) => `${num(m.start, 0)} → ${num(m.end, 0)} px`],
    ["target", (m) => `${num(m.target, 0)} px`],
    [
      "duration",
      (m) =>
        m.duration === null
          ? "no movement"
          : `${ms(m.duration)}${m.unsettled ? " (unsettled)" : ""}`,
    ],
    ["peak velocity", (m) => `${num(m.peakVelocity, 2)} px/ms`],
    ["overshoot", (m) => `${num(m.overshoot, 1)} px`],
    ["direction changes", (m) => String(m.directionChanges)],
    ["smooth-scroll lag", (m) => `${num(m.meanLag, 1)} px avg · ${num(m.maxLag, 1)} max`],
    ["samples", (m) => String(m.samples)],
  ];
  return (
    <table className="w-full text-xs tabular">
      <thead>
        <tr className="text-left font-mono text-2xs text-g-400">
          <th className="py-1 font-normal">metric</th>
          {b && <th className="py-1 font-normal text-base">baseline</th>}
          {c && <th className="py-1 font-normal text-cand">candidate</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, fmt]) => {
          const vb = b ? fmt(b) : null;
          const vc = c ? fmt(c) : null;
          return (
            <tr key={label} className="border-t border-white/[0.05]">
              <td className="py-1 text-g-300">{label}</td>
              {b && <td className="py-1 text-g-200">{vb}</td>}
              {c && (
                <td className={cx("py-1", vb !== null && vb !== vc ? "text-paper" : "text-g-200")}>
                  {vc}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function ScrollInspector({
  view,
  checkpoint,
}: {
  view: ScrollTrackView;
  checkpoint: CheckpointView;
}) {
  const t = useTime();
  const seek = useSeek();
  const cmp = view.comparison;
  const sides = (
    [
      [view.baseline, BASE, "baseline"],
      [view.candidate, CAND, "candidate"],
    ] as const
  ).filter(([r]) => r) as [ScrollMotionRecord, string, string][];
  const domain: [number, number] = [
    0,
    Math.max(checkpoint.duration, ...sides.map(([r]) => r.samples.at(-1)?.time ?? 0), 1),
  ];
  const position: Series[] = sides.flatMap(([r, color, side]) => {
    const out: Series[] = [
      {
        name: `${side} rendered`,
        color,
        points: r.samples.map((s) => ({ t: s.time, y: s.animatedScroll })),
      },
    ];
    if (r.samples.some((s) => Math.abs(s.actualScroll - s.animatedScroll) > 0.5))
      out.push({
        name: `${side} native`,
        color,
        dashed: true,
        points: r.samples.map((s) => ({ t: s.time, y: s.actualScroll })),
      });
    return out;
  });
  const target: Series[] = sides
    .filter(([r]) => r.samples.some((s) => Math.abs(s.targetScroll - s.animatedScroll) > 0.5))
    .map(([r, color, side]) => ({
      name: `${side} target`,
      color,
      dashed: true,
      points: r.samples.map((s) => ({ t: s.time, y: s.targetScroll })),
    }));
  const velocity: Series[] = sides.map(([r, color, side]) => ({
    name: `${side} velocity`,
    color,
    points: scrollVelocities(r).map((p) => ({ t: p.t, y: Math.abs(p.v) })),
  }));
  const curveB = cmp?.baseline?.curve ?? null;
  const curveC = cmp?.candidate?.curve ?? null;
  const progress: Series[] = [
    ...(curveB
      ? [
          {
            name: "baseline progress",
            color: BASE,
            points: curveB.map((y, i) => ({ t: i / (curveB.length - 1), y })),
          },
        ]
      : []),
    ...(curveC
      ? [
          {
            name: "candidate progress",
            color: CAND,
            points: curveC.map((y, i) => ({ t: i / (curveC.length - 1), y })),
          },
        ]
      : []),
  ];
  const correlated = useMemo(
    () => checkpoint.correlations.filter((c) => c.scroll === view.id),
    [checkpoint.correlations, view.id],
  );
  const ref = view.candidate ?? view.baseline!;
  const now = (r: ScrollMotionRecord | null) => {
    const v = scrollAt(r, t);
    return v === undefined ? "—" : `${num(v, 0)} px`;
  };
  return (
    <div className="flex flex-col gap-4 p-3">
      <header>
        <div className="flex items-center gap-2">
          <SeverityMark severity={view.severity} />
          <h3 className="text-sm text-paper">{view.label}</h3>
          <Tag>{ENGINE_LABEL[view.engine]}</Tag>
        </div>
        <p className="mt-1 text-xs text-g-400">
          Scroll motion, recorded live from{" "}
          {ref.source === "lenis" ? "Lenis scroll events" : "native scroll positions"} (
          {view.detail}). Scroll is never replayed; filmstrip frames show the final scroll position.
        </p>
        <p className="mt-1 font-mono text-2xs text-g-300 tabular">
          at {ms(t)}:{" "}
          {view.baseline ? <span className="text-base">{now(view.baseline)}</span> : null}
          {view.baseline && view.candidate ? " · " : null}
          {view.candidate ? <span className="text-cand">{now(view.candidate)}</span> : null}
        </p>
      </header>
      {cmp && cmp.changes.length > 0 && (
        <section>
          <SectionTitle>Changes</SectionTitle>
          <ul className="flex flex-col gap-1">
            {cmp.changes.map((ch, i) => (
              <li key={i} className="flex gap-2 text-xs">
                <SeverityMark severity={ch.severity} />
                <span className="text-g-200">{ch.message}</span>
                {ch.measurement !== "measured" && <Tag>{ch.measurement}</Tag>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <SectionTitle>Metrics</SectionTitle>
        <MetricsTable b={cmp?.baseline ?? null} c={cmp?.candidate ?? null} />
        {!cmp && (
          <p className="mt-1 text-xs text-g-400">Accept a baseline to compare scroll metrics.</p>
        )}
      </section>
      <LineChart
        series={[...position, ...target]}
        domain={domain}
        t={t}
        unit="px"
        title="Scroll position over time"
        onSeek={seek}
      />
      <LineChart
        series={velocity}
        domain={domain}
        t={t}
        unit="px/ms"
        title="Velocity (derived from rendered positions)"
        onSeek={seek}
      />
      {progress.length > 0 && (
        <LineChart
          series={progress}
          domain={[0, 1]}
          t={-1}
          unit="normalized"
          title="Normalized progress over the movement (scroll easing)"
          onSeek={() => undefined}
        />
      )}
      {correlated.length > 0 && (
        <section>
          <SectionTitle>Animations during this scroll</SectionTitle>
          <p className="mb-1 text-2xs text-g-400">
            Observed overlap in time. MotionPR does not claim the scroll caused these animations
            unless the engine declares a scroll timeline.
          </p>
          <ul className="flex flex-col gap-0.5 font-mono text-2xs text-g-300">
            {correlated.map((c) => (
              <li key={c.animation}>
                {c.kind === "scroll-linked" ? "scroll-linked" : `overlap ${ms(c.overlapMs)}`} ·{" "}
                {c.animation}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <SectionTitle>Configuration</SectionTitle>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-2xs">
          {Object.entries(ref.config).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-g-400">{k}</dt>
              <dd className="text-g-200">{String(v)}</dd>
            </div>
          ))}
          <dt className="text-g-400">reduced motion</dt>
          <dd className="text-g-200">{ref.prefersReducedMotion ? "honoured" : "no"}</dd>
          <dt className="text-g-400">events</dt>
          <dd className="text-g-200">{ref.events}</dd>
        </dl>
        {ref.completeness.status !== "complete" && (
          <p className="mt-1 text-2xs text-sev-uncertain">
            {ref.completeness.status}: {ref.completeness.reasons.join(" ")}
          </p>
        )}
      </section>
    </div>
  );
}
