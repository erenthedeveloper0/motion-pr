import { useId, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { AnimationRecord } from "@motionpr/core";
import { describeEasingShape, easingFunction, tryParseCssEasing } from "@motionpr/core/easing";
import { num } from "../format.ts";
import { CHANNELS, channelValue, progressAt, valueAt, type Channel } from "../model.ts";

const W = 300;
const H = 200;
const M = { l: 30, r: 10, t: 12, b: 24 };
const BASE = "#839CF6";
const CAND = "#ECA67A";

function evalSamples(samples: number[], x: number): number {
  const pos = x * (samples.length - 1);
  const i = Math.floor(pos);
  const j = Math.min(samples.length - 1, i + 1);
  return samples[i]! + (samples[j]! - samples[i]!) * (pos - i);
}

interface Curve {
  name: string;
  samples: number[];
  color: string;
  progress: number | null;
}

/**
 * Easing curve inspector: both curves over normalized time, sample points, the largest
 * deviation, the current progress of each side, and a hover crosshair with exact values.
 */
export function EasingChart({
  baseline,
  candidate,
  t,
  maxDeviationAt,
}: {
  baseline: AnimationRecord | null;
  candidate: AnimationRecord | null;
  t: number;
  maxDeviationAt?: number | undefined;
}) {
  const id = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const curves: Curve[] = [];
  for (const [r, color] of [
    [baseline, BASE],
    [candidate, CAND],
  ] as const) {
    if (!r) continue;
    const e = r.timing.effectiveEasing;
    let samples = e.samples;
    if (!samples) {
      const parsed = tryParseCssEasing(e.value);
      if (parsed) {
        const fn = easingFunction(parsed);
        samples = Array.from({ length: 65 }, (_, i) => fn(i / 64));
      }
    }
    if (samples) curves.push({ name: e.value, samples, color, progress: progressAt(r, t) });
  }
  if (!curves.length) {
    return (
      <p className="rounded-md bg-g-850 p-3 text-xs text-g-400">
        No easing curve available (
        {baseline?.timing.effectiveEasing.value ??
          candidate?.timing.effectiveEasing.value ??
          "unknown"}
        ). Per-keyframe easings are listed in the timing table.
      </p>
    );
  }
  const all = curves.flatMap((c) => c.samples);
  const min = Math.min(0, ...all);
  const max = Math.max(1, ...all);
  const pad = (max - min) * 0.06;
  const y0 = min - pad;
  const y1 = max + pad;
  const sx = (x: number) => M.l + x * (W - M.l - M.r);
  const sy = (y: number) => H - M.b - ((y - y0) / (y1 - y0)) * (H - M.t - M.b);
  const path = (s: number[]) =>
    s
      .map((v, i) => `${i ? "L" : "M"}${sx(i / (s.length - 1)).toFixed(2)},${sy(v).toFixed(2)}`)
      .join("");
  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    setHover(Math.min(1, Math.max(0, (x - M.l) / (W - M.l - M.r))));
  };
  const overshoot = max > 1.0001 || min < -0.0001;
  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none"
        role="img"
        aria-labelledby={`${id}-desc`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <desc id={`${id}-desc`}>
          {curves
            .map(
              (c) =>
                `${c === curves[0] && baseline ? "Baseline" : "Candidate"} ${c.name}: ${describeEasingShape(c.samples)}`,
            )
            .join(". ")}
        </desc>
        <rect
          x={M.l}
          y={M.t}
          width={W - M.l - M.r}
          height={H - M.t - M.b}
          rx={4}
          className="fill-g-950"
        />
        {overshoot && (
          <rect
            x={M.l}
            y={sy(y1)}
            width={W - M.l - M.r}
            height={Math.max(0, sy(1) - sy(y1))}
            className="fill-sev-warning/[0.05]"
          />
        )}
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line x1={sx(g)} x2={sx(g)} y1={M.t} y2={H - M.b} className="stroke-white/[0.05]" />
            <line
              x1={M.l}
              x2={W - M.r}
              y1={sy(g)}
              y2={sy(g)}
              className={g === 0 || g === 1 ? "stroke-white/[0.12]" : "stroke-white/[0.05]"}
            />
          </g>
        ))}
        <line
          x1={sx(0)}
          y1={sy(0)}
          x2={sx(1)}
          y2={sy(1)}
          className="stroke-white/[0.1]"
          strokeDasharray="2 3"
        />
        {maxDeviationAt !== undefined && curves.length === 2 && (
          <g>
            <line
              x1={sx(maxDeviationAt)}
              x2={sx(maxDeviationAt)}
              y1={sy(evalSamples(curves[0]!.samples, maxDeviationAt))}
              y2={sy(evalSamples(curves[1]!.samples, maxDeviationAt))}
              stroke="#f3c96b"
              strokeWidth={1.5}
            />
            <text
              x={sx(maxDeviationAt) + 4}
              y={M.t + 10}
              className="fill-sev-warning font-mono text-[9px]"
            >
              max Δ
            </text>
          </g>
        )}
        {curves.map((c, i) => (
          <g key={i}>
            <path
              d={path(c.samples)}
              fill="none"
              stroke={c.color}
              strokeWidth={1.75}
              strokeDasharray={i === 0 && curves.length > 1 ? "4 3" : undefined}
            />
            {c.samples
              .filter((_, k) => k % 8 === 0)
              .map((v, k) => (
                <circle
                  key={k}
                  cx={sx((k * 8) / (c.samples.length - 1))}
                  cy={sy(v)}
                  r={1.6}
                  fill={c.color}
                />
              ))}
            {c.progress !== null && (
              <circle
                cx={sx(c.progress)}
                cy={sy(evalSamples(c.samples, c.progress))}
                r={4.5}
                fill={c.color}
                stroke="#070709"
                strokeWidth={2}
              />
            )}
          </g>
        ))}
        {hover !== null && (
          <g>
            <line x1={sx(hover)} x2={sx(hover)} y1={M.t} y2={H - M.b} className="stroke-paper/40" />
            {curves.map((c, i) => (
              <circle
                key={i}
                cx={sx(hover)}
                cy={sy(evalSamples(c.samples, hover))}
                r={3}
                fill={c.color}
              />
            ))}
          </g>
        )}
        {[0, 0.5, 1].map((v) => (
          <text
            key={v}
            x={M.l - 6}
            y={sy(v) + 3}
            textAnchor="end"
            className="fill-g-500 font-mono text-[9px]"
          >
            {v}
          </text>
        ))}
        <text x={sx(0)} y={H - 8} className="fill-g-500 font-mono text-[9px]">
          0
        </text>
        <text x={sx(1)} y={H - 8} textAnchor="end" className="fill-g-500 font-mono text-[9px]">
          1
        </text>
        <text
          x={(sx(0) + sx(1)) / 2}
          y={H - 8}
          textAnchor="middle"
          className="fill-g-400 font-mono text-[9px]"
        >
          time →
        </text>
        <text
          x={10}
          y={(sy(0) + sy(1)) / 2}
          transform={`rotate(-90 10 ${(sy(0) + sy(1)) / 2})`}
          textAnchor="middle"
          className="fill-g-400 font-mono text-[9px]"
        >
          progress
        </text>
      </svg>
      <figcaption className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-2xs tabular">
        {curves.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5 text-g-300">
            <span className="h-[2px] w-3" style={{ background: c.color }} />
            {c.name}
            <span className="text-g-500">· {describeEasingShape(c.samples)}</span>
          </span>
        ))}
        {hover !== null && (
          <span className="text-g-200">
            t {num(hover, 2)} →{" "}
            {curves.map((c) => num(evalSamples(c.samples, hover), 3)).join(" / ")}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

const VW = 300;
const VH = 120;
const VM = { l: 38, r: 8, t: 8, b: 18 };

/** Sampled computed value of one channel over window time, for both sides. */
export function ValueChart({
  baseline,
  candidate,
  channel,
  duration,
  t,
}: {
  baseline: AnimationRecord | null;
  candidate: AnimationRecord | null;
  channel: Channel;
  duration: number;
  t: number;
}) {
  const meta = CHANNELS.find((c) => c.key === channel)!;
  const series = [
    { r: baseline, color: BASE, label: "baseline" },
    { r: candidate, color: CAND, label: "candidate" },
  ]
    .filter((s) => s.r && s.r.samples.length)
    .map((s) => ({
      ...s,
      points: [...s.r!.samples]
        .sort((a, b) => a.windowTime - b.windowTime)
        .map((smp) => ({
          t: smp.windowTime,
          v: channelValue(s.r!, s.r!.samples.indexOf(smp), channel),
        }))
        .filter((p): p is { t: number; v: number } => typeof p.v === "number"),
    }))
    .filter((s) => s.points.length);
  if (!series.length) return <p className="text-xs text-g-400">No samples for {meta.label}.</p>;
  const values = series.flatMap((s) => s.points.map((p) => p.v));
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi - lo < 1e-6) {
    lo -= 1;
    hi += 1;
  }
  const end = Math.max(duration, ...series.flatMap((s) => s.points.map((p) => p.t)), 1);
  const sx = (x: number) => VM.l + (x / end) * (VW - VM.l - VM.r);
  const sy = (y: number) => VH - VM.b - ((y - lo) / (hi - lo)) * (VH - VM.t - VM.b);
  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        className="w-full"
        role="img"
        aria-label={`${meta.label} over time for ${series.map((s) => s.label).join(" and ")}`}
      >
        <rect
          x={VM.l}
          y={VM.t}
          width={VW - VM.l - VM.r}
          height={VH - VM.t - VM.b}
          rx={3}
          className="fill-g-950"
        />
        {[lo, (lo + hi) / 2, hi].map((v, i) => (
          <g key={i}>
            <line x1={VM.l} x2={VW - VM.r} y1={sy(v)} y2={sy(v)} className="stroke-white/[0.05]" />
            <text
              x={VM.l - 5}
              y={sy(v) + 3}
              textAnchor="end"
              className="fill-g-500 font-mono text-[8.5px]"
            >
              {num(v, Math.abs(hi - lo) < 3 ? 2 : 0)}
            </text>
          </g>
        ))}
        {series.map((s) => (
          <g key={s.label}>
            <polyline
              points={s.points.map((p) => `${sx(p.t).toFixed(1)},${sy(p.v).toFixed(1)}`).join(" ")}
              fill="none"
              stroke={s.color}
              strokeWidth={1.6}
              strokeDasharray={s.label === "baseline" && series.length > 1 ? "4 3" : undefined}
            />
            {s.points.map((p, i) => (
              <circle key={i} cx={sx(p.t)} cy={sy(p.v)} r={1.4} fill={s.color} />
            ))}
          </g>
        ))}
        <line
          x1={sx(Math.min(t, end))}
          x2={sx(Math.min(t, end))}
          y1={VM.t}
          y2={VH - VM.b}
          stroke="#9b74f0"
          strokeWidth={1}
        />
        <text x={VM.l} y={VH - 5} className="fill-g-500 font-mono text-[8.5px]">
          0
        </text>
        <text
          x={VW - VM.r}
          y={VH - 5}
          textAnchor="end"
          className="fill-g-500 font-mono text-[8.5px]"
        >
          {Math.round(end)}ms
        </text>
      </svg>
      <figcaption className="mt-1 flex gap-4 font-mono text-2xs text-g-300 tabular">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className="h-[2px] w-3" style={{ background: s.color }} />
            {s.label} {num(valueAt(s.r, t, channel), 2, meta.unit)}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
