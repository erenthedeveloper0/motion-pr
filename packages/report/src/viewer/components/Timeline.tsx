import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { AnimationRecord } from "@motionpr/core";
import { animationInterval } from "@motionpr/core/timeline";
import { ms, percent } from "../format.ts";
import { useElementSize } from "../hooks.ts";
import type { TrackView } from "../model.ts";
import { useSeek, useTime, useViewer } from "../state.tsx";
import { Icon } from "./icons.tsx";
import { IconButton, SeverityMark, Tag, cx } from "./ui.tsx";
import {
  EngineFilter,
  ScrollLaneRow,
  TimelineLaneRow,
  engineVisible,
  enginesIn,
} from "./Scroll.tsx";

const LABEL_W = 232;
const ROW_H = 34;
const PAD = 16;

const TICK_STEPS = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];

function niceStep(pxPerMs: number): number {
  for (const s of TICK_STEPS) if (s * pxPerMs >= 64) return s;
  return 10_000;
}

function EasingSparkline({
  record,
  width,
  height,
  color,
}: {
  record: AnimationRecord;
  width: number;
  height: number;
  color: string;
}) {
  const samples = record.timing.effectiveEasing.samples;
  if (!samples || width < 36) return null;
  const min = Math.min(0, ...samples);
  const max = Math.max(1, ...samples);
  const pts = samples.map(
    (v, i) =>
      `${((i / (samples.length - 1)) * width).toFixed(1)},${(height - ((v - min) / (max - min)) * height).toFixed(1)}`,
  );
  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width={width}
      height={height}
      aria-hidden="true"
    >
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.25}
        strokeOpacity={0.9}
      />
    </svg>
  );
}

function Bar({
  record,
  side,
  x,
  changed,
}: {
  record: AnimationRecord | null;
  side: "baseline" | "candidate";
  x: (t: number) => number;
  changed: boolean;
}) {
  if (!record) return null;
  const iv = animationInterval(record);
  if (!iv) {
    return (
      <div
        className="absolute left-0 flex h-[11px] items-center font-mono text-2xs text-g-500"
        style={{ top: side === "baseline" ? 5 : 18 }}
      >
        timing not time-based
      </div>
    );
  }
  const top = side === "baseline" ? 5 : 18;
  const color = side === "baseline" ? "#839CF6" : "#ECA67A";
  const delayLeft = x(iv.windowStart);
  const activeLeft = x(iv.activeStart);
  const activeRight = x(iv.activeEnd);
  const width = Math.max(2, activeRight - activeLeft);
  const iterations = record.timing.iterations;
  const iterDur = record.timing.duration ?? 0;
  const ticks: number[] = [];
  if (iterDur > 0 && (iterations === "infinite" || iterations > 1)) {
    const n = iterations === "infinite" ? 1 : Math.min(iterations, 40);
    for (let i = 1; i < n; i++) ticks.push((i * iterDur) / (iv.activeEnd - iv.activeStart));
  }
  const reversed = record.timing.playbackRate < 0;
  return (
    <>
      {activeLeft - delayLeft > 1 && (
        <div
          className="absolute h-[11px] rounded-l-xs mpr-hatch opacity-55"
          style={{ left: delayLeft, width: activeLeft - delayLeft, top, color }}
          title={`delay ${ms(record.timing.delay)}`}
        />
      )}
      <div
        className={cx(
          "absolute h-[11px] overflow-hidden rounded-xs",
          side === "baseline"
            ? "bg-base/20 shadow-[inset_0_0_0_1px_rgb(131_156_246/0.7)]"
            : "bg-cand/25 shadow-[inset_0_0_0_1px_rgb(236_166_122/0.8)]",
          iv.infinite && "rounded-r-none",
        )}
        style={{ left: activeLeft, width, top }}
      >
        <EasingSparkline record={record} width={width} height={11} color={color} />
        {ticks.map((p) => (
          <span
            key={p}
            className="absolute top-0 h-full w-px bg-paper/40"
            style={{ left: p * width }}
          />
        ))}
        {reversed && (
          <span className="absolute top-0 right-1 font-mono text-[9px] leading-[11px] text-paper/70">
            ◂
          </span>
        )}
        {iv.infinite && (
          <span className="absolute top-0 right-0 h-full w-4 bg-gradient-to-r from-transparent to-g-900" />
        )}
      </div>
      {changed && side === "candidate" && (
        <span
          className="absolute h-[11px] w-[3px] rounded-l-xs bg-sev-warning"
          style={{ left: activeLeft - 4, top }}
        />
      )}
    </>
  );
}

function DivergenceStrip({ x, width }: { x: (t: number) => number; width: number }) {
  const { checkpoint } = useViewer();
  const points = checkpoint?.comparison?.frameDivergence ?? [];
  const valid = points.filter((p) => p.ratio !== null) as { time: number; ratio: number }[];
  if (!valid.length) {
    return (
      <div className="flex h-full items-center px-2 font-mono text-2xs text-g-500">
        {checkpoint?.comparison
          ? "frame divergence unavailable (needs PNG frames on both sides)"
          : ""}
      </div>
    );
  }
  const max = Math.max(...valid.map((p) => p.ratio), 1e-6);
  const h = 20;
  const d = valid
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${x(p.time).toFixed(1)},${(h - (p.ratio / max) * (h - 2)).toFixed(1)}`,
    )
    .join("");
  const area = `${d}L${x(valid.at(-1)!.time).toFixed(1)},${h}L${x(valid[0]!.time).toFixed(1)},${h}Z`;
  const peak = valid.reduce((a, b) => (b.ratio > a.ratio ? b : a));
  return (
    <svg
      width={width}
      height={h}
      className="block"
      role="img"
      aria-label={`Frame divergence over time, peak ${percent(peak.ratio)} at ${Math.round(peak.time)} ms`}
    >
      <defs>
        <linearGradient id="mpr-div" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#9b74f0" stopOpacity="0.55" />
          <stop offset="1" stopColor="#9b74f0" stopOpacity="0.04" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#mpr-div)" />
      <path d={d} fill="none" stroke="#9b74f0" strokeWidth={1.25} />
      <text
        x={Math.min(x(peak.time) + 4, width - 70)}
        y={9}
        className="fill-g-300 font-mono text-[9.5px]"
      >
        peak {percent(peak.ratio, 1)}
      </text>
    </svg>
  );
}

function TrackRow({
  track,
  selected,
  x,
  onSelect,
}: {
  track: TrackView;
  selected: boolean;
  x: (t: number) => number;
  onSelect: () => void;
}) {
  const changed = track.status === "changed";
  return (
    <div
      role="row"
      aria-selected={selected}
      className={cx(
        "group relative flex border-b border-white/[0.04]",
        selected ? "bg-violet/[0.09]" : "hover:bg-white/[0.02]",
      )}
      style={{ height: ROW_H }}
    >
      <button
        type="button"
        role="gridcell"
        onClick={onSelect}
        aria-pressed={selected}
        aria-label={`${track.label}, ${track.detail}, ${track.status}${track.severity ? `, ${track.severity}` : ""}`}
        className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r bg-g-900 px-3 text-left"
        style={{ width: LABEL_W }}
        data-track={track.key}
      >
        {selected && <span className="absolute top-0 left-0 h-full w-[2px] bg-violet-hi" />}
        <SeverityMark severity={track.severity} />
        <span className="min-w-0 flex-1">
          <span
            className={cx(
              "block truncate text-xs",
              track.status === "removed"
                ? "text-g-400 line-through decoration-sev-critical/60"
                : "text-paper",
            )}
          >
            {track.label}
          </span>
          <span className="block truncate font-mono text-2xs text-g-400">{track.detail}</span>
        </span>
        {track.status === "added" && <Tag tone="cand">new</Tag>}
        {track.status === "removed" && <Tag>gone</Tag>}
        {track.completeness !== "complete" && (
          <span
            title={`Capture ${track.completeness}`}
            className="font-mono text-2xs text-sev-uncertain"
          >
            ◇
          </span>
        )}
      </button>
      <div role="gridcell" className="relative flex-1" onClick={onSelect}>
        <Bar record={track.baseline} side="baseline" x={x} changed={false} />
        <Bar record={track.candidate} side="candidate" x={x} changed={changed} />
      </div>
    </div>
  );
}

export function Timeline() {
  const { checkpoint, state, dispatch, track, model } = useViewer();
  const t = useTime();
  const seek = useSeek();
  const scroller = useRef<HTMLDivElement>(null);
  const lanes = useRef<HTMLDivElement>(null);
  const { width: viewW } = useElementSize(scroller);
  const duration = checkpoint?.duration ?? 0;
  const laneViewW = Math.max(120, viewW - LABEL_W);
  const fitPx = duration > 0 ? (laneViewW - PAD * 2) / duration : 1;
  const pxPerMs = state.timelinePxPerMs === "fit" ? fitPx : state.timelinePxPerMs;
  const laneW = Math.max(laneViewW, duration * pxPerMs + PAD * 2);
  const x = (time: number) => PAD + time * pxPerMs;
  const step = niceStep(pxPerMs);
  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let v = 0; v <= duration + step / 2; v += step) out.push(v);
    return out;
  }, [duration, step]);
  const [scrubbing, setScrubbing] = useState(false);
  const tracks = (checkpoint?.tracks ?? []).filter((tr) => engineVisible(tr.engine, state.engines));
  const scrollRows = (checkpoint?.scroll ?? []).filter((s) =>
    engineVisible(s.engine, state.engines),
  );
  const timelineRows = (checkpoint?.timelines ?? []).filter((tl) =>
    engineVisible(tl.engine, state.engines),
  );
  const engines = enginesIn(checkpoint);
  const navigable = [...scrollRows.map((s) => s.key), ...tracks.map((tr) => tr.key)];

  const timeFromPointer = (e: ReactPointerEvent) => {
    const rect = lanes.current?.getBoundingClientRect();
    if (!rect) return 0;
    return (e.clientX - rect.left - PAD) / pxPerMs;
  };

  // Ctrl/⌘ + wheel zooms around the cursor; plain wheel scrolls.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey) || duration <= 0) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cursor = e.clientX - rect.left - LABEL_W + el.scrollLeft;
      const atTime = (cursor - PAD) / pxPerMs;
      const next = Math.min(Math.max(fitPx, pxPerMs * (e.deltaY < 0 ? 1.15 : 1 / 1.15)), 8);
      dispatch({ type: "timeline-zoom", value: next <= fitPx * 1.001 ? "fit" : next });
      requestAnimationFrame(() => {
        el.scrollLeft = PAD + atTime * next - (e.clientX - rect.left - LABEL_W);
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [pxPerMs, fitPx, duration, dispatch]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    if (!navigable.length) return;
    e.preventDefault();
    e.stopPropagation();
    const i = navigable.indexOf(state.trackKey ?? "");
    const next = e.key === "ArrowDown" ? Math.min(navigable.length - 1, i + 1) : Math.max(0, i - 1);
    dispatch({ type: "select-track", key: navigable[next]! });
    scroller.current
      ?.querySelector<HTMLElement>(`[data-track="${CSS.escape(navigable[next]!)}"]`)
      ?.focus();
  };

  if (!checkpoint) return null;
  const zoomed = state.timelinePxPerMs !== "fit";

  return (
    <section
      className="flex min-h-0 flex-1 flex-col"
      aria-label="Motion timeline"
      onKeyDown={onKeyDown}
    >
      <header className="flex h-9 shrink-0 items-center gap-3 overflow-hidden border-b px-3 whitespace-nowrap">
        <h2 className="font-mono text-2xs tracking-[0.12em] text-g-400 uppercase">Timeline</h2>
        <span className="text-xs text-g-300 tabular">
          {tracks.length} animation{tracks.length === 1 ? "" : "s"}
          {scrollRows.length ? ` · ${scrollRows.length} scroll` : ""} · {ms(duration)}
        </span>
        <EngineFilter engines={engines} />
        {checkpoint.candidate?.window.origin === "trigger" && (
          <span
            className="hidden min-w-0 truncate font-mono text-2xs text-g-400 2xl:inline"
            title="0 ms is the first animation start; latency is measured from the triggering input event to that start"
          >
            t=0 at first motion · input→motion {ms(checkpoint.candidate.window.latency)}
            {checkpoint.comparison?.latency
              ? ` (baseline ${ms(checkpoint.comparison.latency.baseline)})`
              : ""}
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {model.mode === "comparison" && (
            <span className="mr-2 hidden items-center gap-3 font-mono text-2xs text-g-400 lg:flex">
              <span className="flex items-center gap-1.5">
                <span className="h-[7px] w-3 rounded-xs bg-base/30 shadow-[inset_0_0_0_1px_#839CF6]" />
                baseline
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-[7px] w-3 rounded-xs bg-cand/30 shadow-[inset_0_0_0_1px_#ECA67A]" />
                candidate
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-[7px] w-3 rounded-xs mpr-hatch text-g-300" />
                delay
              </span>
            </span>
          )}
          <IconButton
            size="sm"
            label="Zoom timeline out"
            onClick={() =>
              dispatch({
                type: "timeline-zoom",
                value: pxPerMs / 1.5 <= fitPx ? "fit" : pxPerMs / 1.5,
              })
            }
            disabled={!zoomed}
          >
            <Icon.ZoomOut />
          </IconButton>
          <IconButton
            size="sm"
            label="Fit timeline"
            active={!zoomed}
            onClick={() => dispatch({ type: "timeline-zoom", value: "fit" })}
          >
            <Icon.Fit />
          </IconButton>
          <IconButton
            size="sm"
            label="Zoom timeline in (Ctrl/⌘ + wheel)"
            onClick={() => dispatch({ type: "timeline-zoom", value: Math.min(8, pxPerMs * 1.5) })}
          >
            <Icon.ZoomIn />
          </IconButton>
        </div>
      </header>

      {tracks.length === 0 && scrollRows.length === 0 ? (
        <div className="grid flex-1 place-items-center p-6 text-center">
          <div className="max-w-sm">
            <p className="text-sm text-paper">
              {state.engines.length
                ? "No motion from the selected engines in this checkpoint"
                : "No motion detected in this checkpoint"}
            </p>
            <p className="mt-1 text-xs text-g-400">
              Nothing moved between the previous checkpoint and this one. Check that the interaction
              steps trigger your animation, and that JavaScript engines are connected:{" "}
              <code className="font-mono">motionprGsap.register(gsap)</code>,{" "}
              <code className="font-mono">createAnimeInstrumentation()</code> or{" "}
              <code className="font-mono">motionprLenis.attach(lenis)</code>.
            </p>
          </div>
        </div>
      ) : (
        <div
          ref={scroller}
          className="relative min-h-0 flex-1 overflow-auto mpr-scroll"
          role="grid"
          aria-rowcount={tracks.length + scrollRows.length + timelineRows.length}
          aria-label="Animation tracks"
        >
          <div style={{ width: LABEL_W + laneW }} className="relative">
            {/* Ruler + divergence */}
            <div className="sticky top-0 z-20 flex border-b bg-g-900/95 backdrop-blur-[2px]">
              <div
                className="sticky left-0 z-10 flex shrink-0 flex-col justify-center border-r bg-g-900 px-3"
                style={{ width: LABEL_W }}
              >
                <span className="font-mono text-2xs text-g-500">ms</span>
                {model.mode === "comparison" && (
                  <span className="font-mono text-2xs text-g-500">frame divergence</span>
                )}
              </div>
              <div
                ref={lanes}
                className="relative cursor-col-resize touch-none"
                style={{ width: laneW }}
                onPointerDown={(e) => {
                  (e.target as Element).setPointerCapture?.(e.pointerId);
                  setScrubbing(true);
                  dispatch({ type: "play", playing: false });
                  seek(timeFromPointer(e));
                }}
                onPointerMove={(e) => scrubbing && seek(timeFromPointer(e))}
                onPointerUp={() => setScrubbing(false)}
              >
                <div className="relative h-6">
                  {ticks.map((v) => (
                    <span
                      key={v}
                      className="absolute top-0 flex h-full flex-col"
                      style={{ left: x(v) }}
                    >
                      <span className="h-2 w-px bg-g-500" />
                      <span className="-translate-x-1/2 font-mono text-[9.5px] text-g-400 tabular">
                        {v}
                      </span>
                    </span>
                  ))}
                </div>
                {model.mode === "comparison" && (
                  <div className="h-5 border-t border-white/[0.04]">
                    <DivergenceStrip x={x} width={laneW} />
                  </div>
                )}
              </div>
            </div>
            {timelineRows.map((tl) => (
              <TimelineLaneRow key={tl.key} view={tl} x={x} height={ROW_H} labelWidth={LABEL_W} />
            ))}
            {scrollRows.map((sr) => (
              <ScrollLaneRow
                key={sr.key}
                view={sr}
                selected={sr.key === state.trackKey}
                x={x}
                width={laneW}
                height={ROW_H + 8}
                labelWidth={LABEL_W}
                onSelect={() =>
                  dispatch({ type: "select-track", key: sr.key === state.trackKey ? null : sr.key })
                }
              />
            ))}
            {tracks.map((tr) => (
              <TrackRow
                key={tr.key}
                track={tr}
                selected={tr.key === track?.key}
                x={x}
                onSelect={() =>
                  dispatch({ type: "select-track", key: tr.key === track?.key ? null : tr.key })
                }
              />
            ))}
            {/* Playhead */}
            <div
              className="pointer-events-none absolute top-0 bottom-0 z-30"
              style={{ left: LABEL_W + x(t) }}
              aria-hidden="true"
            >
              <div className="absolute top-0 -left-[5px] h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-violet-hi" />
              <div className="h-full w-px bg-violet-hi shadow-[0_0_8px_rgb(155_116_240/0.6)]" />
            </div>
          </div>
        </div>
      )}
      <div className="sr-only" aria-live="polite">
        {track ? `Selected ${track.label}` : ""}
      </div>
    </section>
  );
}
