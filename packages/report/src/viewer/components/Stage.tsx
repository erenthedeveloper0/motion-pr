import {
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { AnimationRecord, Checkpoint } from "@motionpr/core";
import { percent, timecode } from "../format.ts";
import { useElementSize, usePreload } from "../hooks.ts";
import { boxAt, frameAt, type CheckpointView, type Side, type TrackView } from "../model.ts";
import { useTime, useViewer } from "../state.tsx";
import { cx, Tag } from "./ui.tsx";

const SIDE_COLOR: Record<Side, string> = { baseline: "#839CF6", candidate: "#ECA67A" };

function viewportSize(
  cp: Checkpoint | null,
  assetSize: (id: string | null | undefined) => { width: number; height: number } | null,
): { width: number; height: number } | null {
  if (!cp) return null;
  const frame = cp.frames[0]?.asset ?? cp.screenshot;
  const a = assetSize(frame);
  return a ? { width: a.width, height: a.height } : null;
}

function useFrameUrl(
  cp: Checkpoint | null,
  t: number,
): { url: string | null; time: number | null; settled: boolean } {
  const { model } = useViewer();
  if (!cp) return { url: null, time: null, settled: false };
  const frame = frameAt(cp.frames, t);
  if (frame) return { url: model.assetUrl(frame.asset), time: frame.time, settled: false };
  return { url: model.assetUrl(cp.screenshot), time: null, settled: true };
}

/** Element boxes at time t, drawn in viewport coordinates over the frame. */
function Boxes({
  tracks,
  side,
  t,
  scale,
  selected,
  showAll,
}: {
  tracks: TrackView[];
  side: Side;
  t: number;
  scale: number;
  selected: string | null;
  showAll: boolean;
}) {
  const items = tracks
    .filter((tr) => showAll || tr.key === selected)
    .map((tr) => ({ tr, box: boxAt(tr[side], t) }))
    .filter((x) => x.box && x.box.width > 0 && x.box.height > 0);
  return (
    <>
      {items.map(({ tr, box }) => {
        const isSel = tr.key === selected;
        return (
          <div
            key={tr.key}
            aria-hidden="true"
            className={cx("pointer-events-none absolute", isSel ? "z-20" : "z-10")}
            style={{
              left: box!.x * scale,
              top: box!.y * scale,
              width: box!.width * scale,
              height: box!.height * scale,
              border: `${isSel ? 1.5 : 1}px ${isSel ? "solid" : "dashed"} ${SIDE_COLOR[side]}`,
              opacity: isSel ? 1 : 0.4,
              boxShadow: isSel ? `0 0 0 3px ${SIDE_COLOR[side]}22` : undefined,
            }}
          >
            {isSel && (
              <span
                className="absolute -top-5 left-0 rounded-xs px-1 font-mono text-2xs whitespace-nowrap text-ink"
                style={{ background: SIDE_COLOR[side] }}
              >
                {tr.label}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}

/** Motion path of a record's box center over its samples (onion-skin mode). */
function Trail({
  record,
  color,
  scale,
  t,
}: {
  record: AnimationRecord | null;
  color: string;
  scale: number;
  t: number;
}) {
  if (!record || record.samples.length < 2) return null;
  const pts = record.samples
    .filter((s) => s.box)
    .map(
      (s) =>
        [(s.box!.x + s.box!.width / 2) * scale, (s.box!.y + s.box!.height / 2) * scale] as const,
    );
  if (pts.length < 2) return null;
  const now = boxAt(record, t);
  return (
    <g>
      <polyline
        points={pts.map((p) => p.join(",")).join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeOpacity={0.85}
        strokeDasharray="3 3"
      />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={1.8} fill={color} fillOpacity={0.7} />
      ))}
      {now && (
        <circle
          cx={(now.x + now.width / 2) * scale}
          cy={(now.y + now.height / 2) * scale}
          r={5}
          fill="none"
          stroke={color}
          strokeWidth={2}
        />
      )}
    </g>
  );
}

function Pane({
  side,
  label,
  children,
  empty,
}: {
  side: Side | "overlay";
  label: ReactNode;
  children?: ReactNode;
  empty?: string | undefined;
}) {
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-7 shrink-0 items-center gap-2 overflow-hidden px-1 text-xs whitespace-nowrap text-g-300">
        {label}
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-md mpr-checker shadow-[inset_0_0_0_1px_rgb(255_255_255/0.05)]">
        {empty ? (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-g-400">
            {empty}
          </div>
        ) : (
          children
        )}
        {side !== "overlay" && (
          <span
            aria-hidden="true"
            className="absolute top-0 left-0 h-[2px] w-full"
            style={{ background: SIDE_COLOR[side] }}
          />
        )}
      </div>
    </div>
  );
}

/** Scales a viewport-sized frame to fit (or to the chosen zoom) and centers it. */
function Fitted({
  size,
  zoom,
  children,
  scrollRef,
  onScroll,
}: {
  size: { width: number; height: number };
  zoom: number | "fit";
  children: (scale: number) => ReactNode;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  onScroll?: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(box);
  const fit = width && height ? Math.min(width / size.width, height / size.height) : 0;
  const scale = zoom === "fit" ? fit : zoom;
  const w = size.width * scale;
  const h = size.height * scale;
  return (
    <div ref={box} className="absolute inset-0">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className={cx(
          "absolute inset-0 mpr-scroll",
          zoom === "fit" ? "overflow-hidden" : "overflow-auto",
        )}
      >
        <div
          className="grid min-h-full min-w-full place-items-center"
          style={{ width: Math.max(w, width), height: Math.max(h, height) }}
        >
          <div className="relative" style={{ width: w, height: h }}>
            {scale > 0 && children(scale)}
          </div>
        </div>
      </div>
    </div>
  );
}

function Frame({ url, alt }: { url: string | null; alt: string }) {
  if (!url) return null;
  return (
    <img
      src={url}
      alt={alt}
      draggable={false}
      decoding="async"
      className="absolute inset-0 size-full select-none"
    />
  );
}

export function Stage() {
  const { model, state, dispatch, checkpoint, track, scenario } = useViewer();
  const t = useTime();
  const cp = checkpoint;
  const b = cp?.baseline ?? null;
  const c = cp?.candidate ?? null;
  const size = viewportSize(c, model.asset) ??
    viewportSize(b, model.asset) ?? { width: 1280, height: 800 };
  const bf = useFrameUrl(b, t);
  const cf = useFrameUrl(c, t);
  const urls = useMemo(() => {
    const list: string[] = [];
    for (const side of [b, c]) {
      for (const f of side?.frames ?? []) {
        const u = model.assetUrl(f.asset);
        if (u) list.push(u);
      }
    }
    return list;
  }, [b, c, model]);
  const progress = usePreload(urls);
  const syncA = useRef<HTMLDivElement>(null);
  const syncB = useRef<HTMLDivElement>(null);
  const sync =
    (from: React.RefObject<HTMLDivElement | null>, to: React.RefObject<HTMLDivElement | null>) =>
    () => {
      if (from.current && to.current) {
        to.current.scrollLeft = from.current.scrollLeft;
        to.current.scrollTop = from.current.scrollTop;
      }
    };

  if (!scenario || !cp) {
    return <StageMessage title="No checkpoint selected" body="Choose a scenario on the left." />;
  }
  if (scenario.status === "failed" && !cp) {
    return (
      <StageMessage
        title="Scenario failed"
        body={scenario.error ?? "The scenario failed during capture."}
      />
    );
  }

  const tracks = cp.tracks;
  const selected = track?.key ?? null;
  const showAll = state.showBoxes;
  const comparison = model.mode === "comparison";
  const sideLabel = (side: Side, info: { time: number | null; settled: boolean }) => (
    <>
      <span className="size-1.5 rounded-full" style={{ background: SIDE_COLOR[side] }} />
      <span className="text-paper">
        {side === "baseline" ? "Baseline" : comparison ? "Candidate" : "Capture"}
      </span>
      <span className="hidden truncate font-mono text-2xs text-g-400 lg:inline">
        {side === "baseline" ? model.data.baseline?.id : model.data.candidate.id}
      </span>
      <span className="ml-auto hidden font-mono text-2xs text-g-400 tabular sm:inline">
        {info.settled
          ? "settled frame"
          : info.time !== null
            ? `frame @ ${timecode(info.time)}`
            : ""}
      </span>
    </>
  );

  const loading = progress.total > 0 && progress.loaded < progress.total;
  const missing = (side: Side) =>
    side === "baseline"
      ? cp.status === "added" || !b
        ? "Not in the baseline: this checkpoint is new."
        : undefined
      : !c
        ? "Not in the candidate: this checkpoint is missing."
        : undefined;

  let body: ReactNode;
  const mode = comparison ? state.mode : "side";
  if (mode === "side" || !b || !c) {
    body = (
      <div className="flex min-h-0 flex-1 gap-3">
        {comparison && (
          <Pane side="baseline" label={sideLabel("baseline", bf)} empty={missing("baseline")}>
            <Fitted size={size} zoom={state.zoom} scrollRef={syncA} onScroll={sync(syncA, syncB)}>
              {(scale) => (
                <>
                  <Frame url={bf.url} alt={`Baseline frame at ${Math.round(t)} ms`} />
                  <Boxes
                    tracks={tracks}
                    side="baseline"
                    t={t}
                    scale={scale}
                    selected={selected}
                    showAll={showAll}
                  />
                </>
              )}
            </Fitted>
          </Pane>
        )}
        <Pane side="candidate" label={sideLabel("candidate", cf)} empty={missing("candidate")}>
          <Fitted size={size} zoom={state.zoom} scrollRef={syncB} onScroll={sync(syncB, syncA)}>
            {(scale) => (
              <>
                <Frame
                  url={cf.url}
                  alt={`${comparison ? "Candidate" : "Capture"} frame at ${Math.round(t)} ms`}
                />
                <Boxes
                  tracks={tracks}
                  side="candidate"
                  t={t}
                  scale={scale}
                  selected={selected}
                  showAll={showAll}
                />
              </>
            )}
          </Fitted>
        </Pane>
      </div>
    );
  } else if (mode === "pixel") {
    body = <PixelDiff cp={cp} size={size} />;
  } else {
    body = (
      <Pane
        side="overlay"
        label={
          <>
            <span className="size-1.5 rounded-full bg-base" />
            <span>Baseline</span>
            <span className="text-g-500">/</span>
            <span className="size-1.5 rounded-full bg-cand" />
            <span>Candidate</span>
            <span className="ml-2 text-g-400">{MODE_HINT[mode]}</span>
            <span className="ml-auto font-mono text-2xs text-g-400 tabular">{timecode(t)}</span>
          </>
        }
      >
        <Fitted size={size} zoom={state.zoom}>
          {(scale) => (
            <OverlayLayers
              mode={mode}
              bUrl={bf.url}
              cUrl={cf.url}
              scale={scale}
              size={size}
              t={t}
              cp={cp}
              track={track}
              opacity={state.overlayOpacity}
              wipe={state.wipe}
              onWipe={(v) => dispatch({ type: "wipe", value: v })}
            />
          )}
        </Fitted>
      </Pane>
    );
  }

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col px-3 pt-1 pb-2"
      aria-label="Frame comparison"
      role="region"
    >
      {body}
      {loading && (
        <div
          className="pointer-events-none absolute top-2 right-4 flex items-center gap-2 rounded-sm bg-g-800/90 px-2 py-1 font-mono text-2xs text-g-300"
          role="status"
        >
          Loading frames {progress.loaded}/{progress.total}
          <span className="h-[2px] w-16 overflow-hidden rounded bg-g-600">
            <span
              className="block h-full bg-violet-hi transition-[width]"
              style={{ width: `${(progress.loaded / progress.total) * 100}%` }}
            />
          </span>
        </div>
      )}
    </div>
  );
}

const MODE_HINT: Record<string, string> = {
  overlay: "candidate over baseline",
  onion: "ghost frames and motion paths",
  wipe: "drag the divider",
  difference: "black = identical pixels",
};

function OverlayLayers({
  mode,
  bUrl,
  cUrl,
  scale,
  size,
  t,
  cp,
  track,
  opacity,
  wipe,
  onWipe,
}: {
  mode: string;
  bUrl: string | null;
  cUrl: string | null;
  scale: number;
  size: { width: number; height: number };
  t: number;
  cp: CheckpointView;
  track: TrackView | null;
  opacity: number;
  wipe: number;
  onWipe: (v: number) => void;
}) {
  const { model } = useViewer();
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const setFromPointer = (e: ReactPointerEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) onWipe((e.clientX - rect.left) / rect.width);
  };
  if (mode === "difference") {
    return (
      <div className="absolute inset-0 isolate bg-black">
        <Frame url={bUrl} alt="Baseline frame" />
        {cUrl && (
          <img
            src={cUrl}
            alt="Candidate frame (difference blend)"
            className="absolute inset-0 size-full mix-blend-difference"
            draggable={false}
          />
        )}
      </div>
    );
  }
  if (mode === "onion") {
    const frames = cp.candidate?.frames ?? [];
    const current = frameAt(frames, t);
    const index = current ? frames.indexOf(current) : -1;
    const ghosts = index > 0 ? frames.slice(Math.max(0, index - 4), index) : [];
    const records = track ? [track] : cp.tracks.filter((tr) => tr.status === "changed");
    return (
      <div className="absolute inset-0">
        <div className="absolute inset-0 opacity-45">
          <Frame url={bUrl} alt="Baseline frame" />
        </div>
        {ghosts.map((g, i) => {
          const u = model.assetUrl(g.asset);
          return u ? (
            <img
              key={g.asset + i}
              src={u}
              alt=""
              className="absolute inset-0 size-full mix-blend-screen"
              style={{ opacity: 0.08 + (i / ghosts.length) * 0.22 }}
              draggable={false}
            />
          ) : null;
        })}
        <div className="absolute inset-0 opacity-70 mix-blend-screen">
          <Frame url={cUrl} alt="Candidate frame" />
        </div>
        <svg
          className="pointer-events-none absolute inset-0 size-full"
          viewBox={`0 0 ${size.width * scale} ${size.height * scale}`}
          aria-label="Motion paths: blue baseline, peach candidate"
        >
          {records.map((tr) => (
            <g key={tr.key}>
              <Trail record={tr.baseline} color="#839CF6" scale={scale} t={t} />
              <Trail record={tr.candidate} color="#ECA67A" scale={scale} t={t} />
            </g>
          ))}
        </svg>
      </div>
    );
  }
  if (mode === "wipe") {
    const pct = wipe * 100;
    return (
      <div
        ref={ref}
        className="absolute inset-0 cursor-ew-resize touch-none select-none"
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          setDragging(true);
          setFromPointer(e);
        }}
        onPointerMove={(e) => dragging && setFromPointer(e)}
        onPointerUp={() => setDragging(false)}
      >
        <Frame url={bUrl} alt="Baseline frame" />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${pct}%)` }}>
          <Frame url={cUrl} alt="Candidate frame" />
        </div>
        <div
          role="slider"
          tabIndex={0}
          aria-label="Wipe position"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          aria-valuetext={`${Math.round(pct)}% baseline`}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 0.1 : 0.02;
            if (e.key === "ArrowLeft") onWipe(wipe - step);
            else if (e.key === "ArrowRight") onWipe(wipe + step);
            else return;
            e.preventDefault();
            e.stopPropagation();
          }}
          className="absolute top-0 bottom-0 z-30 -ml-3 flex w-6 justify-center outline-none"
          style={{ left: `${pct}%` }}
        >
          <span className="h-full w-px bg-paper shadow-[0_0_0_1px_rgb(0_0_0/0.4)]" />
          <span className="absolute top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-paper text-ink shadow-pop">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path
                d="M5 3 1.5 7 5 11M9 3l3.5 4L9 11"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          </span>
        </div>
        <span className="pointer-events-none absolute top-2 left-2 z-20 rounded-xs bg-base px-1 font-mono text-2xs text-ink">
          BASELINE
        </span>
        <span className="pointer-events-none absolute top-2 right-2 z-20 rounded-xs bg-cand px-1 font-mono text-2xs text-ink">
          CANDIDATE
        </span>
      </div>
    );
  }
  return (
    <div className="absolute inset-0">
      <Frame url={bUrl} alt="Baseline frame" />
      <div className="absolute inset-0" style={{ opacity }}>
        <Frame url={cUrl} alt="Candidate frame" />
      </div>
    </div>
  );
}

function PixelDiff({ cp, size }: { cp: CheckpointView; size: { width: number; height: number } }) {
  const { model, state } = useViewer();
  const visual = cp.comparison?.visual;
  const url = model.assetUrl(visual?.diffAsset);
  const diffSize = visual?.diffAsset ? model.asset(visual.diffAsset) : null;
  const stats = visual ? (
    <>
      <Tag tone={visual.status === "changed" ? "warn" : "neutral"}>
        {visual.status.replace("-", " ")}
      </Tag>
      <span className="font-mono text-2xs text-g-300 tabular">
        {visual.mismatchPixels.toLocaleString()} px · {percent(visual.mismatchRatio, 3)} · threshold{" "}
        {percent(visual.maxDiffRatio, 2)}
      </span>
    </>
  ) : null;
  return (
    <Pane
      side="overlay"
      label={
        <>
          <span>Settled frame · pixel diff</span>
          <span className="ml-auto flex items-center gap-2">{stats}</span>
        </>
      }
      empty={
        !visual
          ? "No visual comparison for this checkpoint."
          : !url
            ? visual.status === "identical"
              ? "The settled frames are pixel-identical."
              : (visual.reason ??
                "Differences are below the reporting threshold, so no diff image was kept.")
            : undefined
      }
    >
      <Fitted
        size={diffSize ? { width: diffSize.width, height: diffSize.height } : size}
        zoom={state.zoom}
      >
        {() => (
          <Frame
            url={url}
            alt="Pixel difference of the settled frames: highlighted pixels differ"
          />
        )}
      </Fitted>
    </Pane>
  );
}

export function StageMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid flex-1 place-items-center p-10">
      <div className="max-w-md text-center">
        <p className="text-sm text-paper">{title}</p>
        <p className="mt-1 text-sm text-g-400">{body}</p>
      </div>
    </div>
  );
}
