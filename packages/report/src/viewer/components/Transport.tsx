import { useEffect, useMemo } from "react";
import { timecode } from "../format.ts";
import { frameTimes, stepTime } from "../model.ts";
import { useSeek, useTime, useViewer, type StageMode } from "../state.tsx";
import { Icon } from "./icons.tsx";
import { IconButton, Segmented, Tooltip, cx } from "./ui.tsx";

export const SPEEDS = [0.1, 0.25, 0.5, 1, 2];

/** Advances the shared playhead with requestAnimationFrame while playing. */
export function usePlaybackLoop() {
  const { state, dispatch, time, checkpoint } = useViewer();
  const duration = checkpoint?.duration ?? 0;
  useEffect(() => {
    if (!state.playing || duration <= 0) return;
    let raf = 0;
    let last = performance.now();
    if (time.get() >= duration - 0.5) time.set(0);
    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      let next = time.get() + dt * state.speed;
      if (next >= duration) {
        if (state.loop) next = 0;
        else {
          time.set(duration);
          dispatch({ type: "play", playing: false });
          return;
        }
      }
      time.set(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state.playing, state.speed, state.loop, duration, time, dispatch]);
}

const MODES: { value: StageMode; label: string; key: string; icon: React.ReactNode }[] = [
  { value: "side", label: "Side by side", key: "1", icon: <Icon.Side /> },
  { value: "overlay", label: "Overlay", key: "2", icon: <Icon.Overlay /> },
  { value: "onion", label: "Onion skin + motion paths", key: "3", icon: <Icon.Onion /> },
  { value: "wipe", label: "Wipe", key: "4", icon: <Icon.Wipe /> },
  { value: "difference", label: "Difference blend", key: "5", icon: <Icon.Difference /> },
  { value: "pixel", label: "Settled pixel diff", key: "6", icon: <Icon.Pixel /> },
];

export function Transport() {
  const { state, dispatch, checkpoint, model } = useViewer();
  const t = useTime();
  const seek = useSeek();
  const duration = checkpoint?.duration ?? 0;
  const times = useMemo(() => (checkpoint ? frameTimes(checkpoint) : [0]), [checkpoint]);
  const frameIndex = times.findLastIndex((x) => x <= t + 0.5);
  const comparison = model.mode === "comparison";
  const disabled = duration <= 0;
  const zoomValue = state.zoom === "fit" ? null : state.zoom;

  return (
    <div
      className="flex h-11 shrink-0 items-center gap-3 overflow-x-auto overflow-y-hidden border-t px-3 whitespace-nowrap mpr-scroll [&>*]:shrink-0"
      role="toolbar"
      aria-label="Playback"
    >
      <div className="flex items-center gap-0.5">
        <IconButton label="Go to start" shortcut="Home" onClick={() => seek(0)} disabled={disabled}>
          <Icon.Start />
        </IconButton>
        <IconButton
          label="Previous frame"
          shortcut="←"
          onClick={() => seek(stepTime(times, t, -1))}
          disabled={disabled}
        >
          <Icon.StepBack />
        </IconButton>
        <button
          type="button"
          onClick={() => dispatch({ type: "play", playing: !state.playing })}
          disabled={disabled}
          aria-label={state.playing ? "Pause" : "Play"}
          title={state.playing ? "Pause (Space)" : "Play (Space)"}
          className="mx-0.5 grid size-8 place-items-center rounded-full bg-paper text-ink transition-transform duration-150 hover:scale-[1.04] active:scale-95 disabled:opacity-30"
        >
          {state.playing ? <Icon.Pause /> : <Icon.Play />}
        </button>
        <IconButton
          label="Next frame"
          shortcut="→"
          onClick={() => seek(stepTime(times, t, 1))}
          disabled={disabled}
        >
          <Icon.StepForward />
        </IconButton>
        <IconButton
          label={state.loop ? "Looping" : "Play once"}
          active={state.loop}
          onClick={() => dispatch({ type: "loop", loop: !state.loop })}
          size="sm"
        >
          <Icon.Loop />
        </IconButton>
      </div>

      <div className="flex items-baseline gap-1.5 font-mono text-xs tabular" aria-live="off">
        <output aria-label="Playhead time" className="text-paper">
          {timecode(t)}
        </output>
        <span className="text-g-500">/</span>
        <span className="text-g-400">{timecode(duration)}</span>
        <span className="ml-2 hidden text-2xs text-g-500 sm:inline">
          frame {Math.max(0, frameIndex) + 1}/{times.length}
        </span>
      </div>

      <label className="flex items-center gap-1.5 text-xs text-g-400">
        <span className="sr-only">Playback speed</span>
        <select
          value={state.speed}
          onChange={(e) => dispatch({ type: "speed", speed: Number(e.target.value) })}
          className="h-7 rounded-sm border bg-g-850 px-1.5 font-mono text-xs text-g-200 hover:text-paper"
          aria-label="Playback speed"
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </label>

      <div className="ml-auto flex items-center gap-2">
        {comparison && (
          <>
            {state.mode === "overlay" && (
              <label className="flex items-center gap-2 text-2xs text-g-400">
                <span className="font-mono uppercase">Mix</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={state.overlayOpacity}
                  onChange={(e) =>
                    dispatch({ type: "overlay-opacity", value: Number(e.target.value) })
                  }
                  className="mpr-range w-24"
                  aria-label="Candidate opacity"
                />
              </label>
            )}
            <Segmented
              label="Comparison mode"
              value={state.mode}
              onChange={(mode) => dispatch({ type: "mode", mode })}
              options={MODES.map((m) => ({
                value: m.value,
                label: m.label,
                icon: m.icon,
                shortcut: m.key,
              }))}
            />
          </>
        )}
        <IconButton
          label={state.showBoxes ? "Hide element boxes" : "Show element boxes"}
          shortcut="B"
          active={state.showBoxes}
          onClick={() => dispatch({ type: "boxes", value: !state.showBoxes })}
        >
          <Icon.Box />
        </IconButton>
        <div className="flex items-center rounded-md bg-g-850 p-0.5">
          <IconButton
            size="sm"
            label="Zoom out"
            shortcut="−"
            onClick={() =>
              dispatch({ type: "zoom", zoom: Math.max(0.25, (zoomValue ?? 0.6) / 1.25) })
            }
          >
            <Icon.ZoomOut />
          </IconButton>
          <Tooltip label="Fit to view" shortcut="0">
            <button
              type="button"
              onClick={() => dispatch({ type: "zoom", zoom: "fit" })}
              className={cx(
                "h-7 min-w-12 rounded-sm px-1 font-mono text-2xs tabular",
                state.zoom === "fit" ? "text-paper" : "text-g-300 hover:text-paper",
              )}
              aria-label="Fit to view"
            >
              {zoomValue === null ? "fit" : `${Math.round(zoomValue * 100)}%`}
            </button>
          </Tooltip>
          <IconButton
            size="sm"
            label="Zoom in"
            shortcut="+"
            onClick={() => dispatch({ type: "zoom", zoom: Math.min(4, (zoomValue ?? 0.6) * 1.25) })}
          >
            <Icon.ZoomIn />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
