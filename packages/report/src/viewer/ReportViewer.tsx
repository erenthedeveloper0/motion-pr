import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import type { ReportData } from "@motionpr/core";
import { CommandMenu, ShortcutsDialog } from "./components/Overlays.tsx";
import { Inspector } from "./components/Inspector.tsx";
import { DifferenceExplorer, ScenarioNav } from "./components/Navigator.tsx";
import { Splitter } from "./components/Splitter.tsx";
import { Stage } from "./components/Stage.tsx";
import { Timeline } from "./components/Timeline.tsx";
import { TopBar } from "./components/TopBar.tsx";
import { Transport, usePlaybackLoop } from "./components/Transport.tsx";
import { cx } from "./components/ui.tsx";
import { useElementSize, usePersistentNumber, usePrefersReducedMotion } from "./hooks.ts";
import { buildModel, findDifferenceTarget, frameTimes, stepTime } from "./model.ts";
import { ViewerProvider, sevRank, useViewer, type StageMode } from "./state.tsx";

const MODE_KEYS: Record<string, StageMode> = {
  "1": "side",
  "2": "overlay",
  "3": "onion",
  "4": "wipe",
  "5": "difference",
  "6": "pixel",
};

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.isContentEditable ||
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT"
  );
}

/** Global keyboard map (see SHORTCUTS). Ignored while typing in inputs. */
function useShortcuts() {
  const ctx = useViewer();
  const ref = useRef(ctx);
  ref.current = ctx;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { model, state, dispatch, time, checkpoint, scenario } = ref.current;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        dispatch({ type: "overlay", overlay: state.overlay === "command" ? "none" : "command" });
        return;
      }
      if (state.overlay !== "none" || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey)
        return;
      const times = checkpoint ? frameTimes(checkpoint) : [0];
      const duration = checkpoint?.duration ?? 0;
      const sIndex = model.scenarios.findIndex((s) => s.key === scenario?.key);
      const cIndex = scenario?.checkpoints.findIndex((c) => c.id === checkpoint?.id) ?? -1;
      const key = e.key;
      const handled = () => e.preventDefault();
      if (key === " " && !(e.target instanceof HTMLButtonElement)) {
        handled();
        dispatch({ type: "play", playing: !state.playing });
      } else if (key === "ArrowRight" || key === "ArrowLeft") {
        if ((e.target as HTMLElement).getAttribute?.("role") === "slider") return;
        handled();
        dispatch({ type: "play", playing: false });
        time.set(stepTime(times, time.get(), key === "ArrowRight" ? 1 : -1, e.shiftKey ? 10 : 1));
      } else if (key === "Home") {
        handled();
        time.set(0);
      } else if (key === "End") {
        handled();
        time.set(duration);
      } else if (key === "j" || key === "k") {
        const next =
          model.scenarios[
            Math.min(model.scenarios.length - 1, Math.max(0, sIndex + (key === "j" ? 1 : -1)))
          ];
        if (next) {
          dispatch({ type: "select-scenario", key: next.key });
          time.set(0);
        }
      } else if ((key === "]" || key === "[") && scenario) {
        const next =
          scenario.checkpoints[
            Math.min(scenario.checkpoints.length - 1, Math.max(0, cIndex + (key === "]" ? 1 : -1)))
          ];
        if (next) {
          dispatch({ type: "select-checkpoint", id: next.id });
          time.set(0);
        }
      } else if ((key === "n" || key === "p") && model.differences.length) {
        const ordered = [...model.differences].sort(
          (a, b) => sevRank(b.severity) - sevRank(a.severity),
        );
        const current = ordered.findIndex(
          (d) =>
            d.scenarioKey === scenario?.key &&
            d.checkpoint === checkpoint?.label &&
            (d.animationKey ?? null) === (state.trackKey ?? null),
        );
        const next =
          ordered[
            (current +
              (key === "n" ? 1 : ordered.length - 1) +
              (current < 0 && key === "p" ? 1 : 0)) %
              ordered.length
          ]!;
        const target = findDifferenceTarget(model, next);
        if (target)
          dispatch({
            type: "navigate",
            scenarioKey: target.scenario.key,
            checkpointId: target.checkpoint?.id ?? null,
            trackKey: target.track?.key ?? null,
          });
      } else if (MODE_KEYS[key] && model.mode === "comparison") {
        dispatch({ type: "mode", mode: MODE_KEYS[key]! });
      } else if (key === "b") {
        dispatch({ type: "boxes", value: !state.showBoxes });
      } else if (key === "+" || key === "=") {
        dispatch({
          type: "zoom",
          zoom: Math.min(4, (state.zoom === "fit" ? 0.6 : state.zoom) * 1.25),
        });
      } else if (key === "-") {
        dispatch({
          type: "zoom",
          zoom: Math.max(0.25, (state.zoom === "fit" ? 0.6 : state.zoom) / 1.25),
        });
      } else if (key === "0") {
        dispatch({ type: "zoom", zoom: "fit" });
      } else if (key === "d") {
        dispatch({ type: "right-tab", tab: "differences" });
      } else if (key === "i") {
        dispatch({ type: "right-tab", tab: "inspector" });
      } else if (key === "?") {
        dispatch({ type: "overlay", overlay: "shortcuts" });
      } else if (key === "Escape") {
        if (state.trackKey) dispatch({ type: "select-track", key: null });
      } else return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function RightPanel() {
  const { state, dispatch, model } = useViewer();
  const tabs = [
    { id: "inspector" as const, label: "Inspector" },
    {
      id: "differences" as const,
      label: `Differences${model.differences.length ? ` ${model.differences.length}` : ""}`,
    },
  ];
  return (
    <div className="flex h-full min-h-0 flex-col mpr-panel">
      <div
        role="tablist"
        aria-label="Details"
        className="flex h-9 shrink-0 items-end gap-4 border-b px-4"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`mpr-tab-${t.id}`}
            aria-selected={state.rightTab === t.id}
            aria-controls={`mpr-tabpanel-${t.id}`}
            onClick={() => dispatch({ type: "right-tab", tab: t.id })}
            className={cx(
              "relative h-full text-xs transition-colors",
              state.rightTab === t.id ? "text-paper" : "text-g-400 hover:text-paper",
            )}
          >
            {t.label}
            {state.rightTab === t.id && (
              <span className="absolute right-0 bottom-[-1px] left-0 h-px bg-violet-hi" />
            )}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`mpr-tabpanel-${state.rightTab}`}
        aria-labelledby={`mpr-tab-${state.rightTab}`}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto mpr-scroll"
      >
        {state.rightTab === "inspector" ? <Inspector /> : <DifferenceExplorer />}
      </div>
    </div>
  );
}

function Layout() {
  const { checkpoint, time } = useViewer();
  usePlaybackLoop();
  useShortcuts();
  const root = useRef<HTMLDivElement>(null);
  const { width } = useElementSize(root);
  const reduced = usePrefersReducedMotion();
  const [left, setLeft] = usePersistentNumber("left", 268);
  const [right, setRight] = usePersistentNumber("right", 372);
  const [timelineH, setTimelineH] = usePersistentNumber("timeline", 248);
  const [drawer, setDrawer] = useState(false);
  const { state } = useViewer();
  const compact = width > 0 && width < 1180;
  const narrow = width > 0 && width < 760;

  useEffect(() => {
    time.set(0);
  }, [checkpoint?.id, time]);

  useEffect(() => {
    if (reduced || !root.current) return;
    const ctx = gsap.context(() => {
      gsap.from("[data-mpr-reveal]", {
        opacity: 0,
        y: 10,
        duration: 0.7,
        ease: "expo.out",
        stagger: 0.06,
        clearProps: "opacity,transform",
      });
    }, root);
    return () => ctx.revert();
  }, [reduced]);

  return (
    <div
      ref={root}
      className="mpr-root relative flex h-full min-h-0 flex-col overflow-hidden mpr-grain"
    >
      <TopBar
        onToggleInspector={compact ? () => setDrawer((d) => !d) : undefined}
        inspectorOpen={drawer}
      />
      <div className={cx("flex min-h-0 flex-1", narrow && "flex-col")}>
        <aside
          className={cx(
            "flex min-h-0 flex-col border-r mpr-panel",
            narrow ? "max-h-[34vh] border-r-0 border-b" : "",
          )}
          style={narrow ? undefined : { width: left }}
          data-mpr-reveal
        >
          <ScenarioNav />
        </aside>
        {!narrow && (
          <Splitter
            orientation="vertical"
            value={left}
            min={200}
            max={420}
            onChange={setLeft}
            label="Resize scenario list"
          />
        )}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-g-950" data-mpr-reveal>
          <Stage />
          <Transport />
          <Splitter
            orientation="horizontal"
            value={timelineH}
            min={120}
            max={560}
            onChange={setTimelineH}
            label="Resize timeline"
            invert
          />
          <div
            className="flex min-h-0 shrink-0 flex-col border-t mpr-panel"
            style={{ height: timelineH }}
          >
            <Timeline />
          </div>
        </main>
        {!compact && (
          <>
            <Splitter
              orientation="vertical"
              value={right}
              min={300}
              max={560}
              onChange={setRight}
              label="Resize inspector"
              invert
            />
            <aside
              className="min-h-0 border-l"
              style={{ width: right }}
              data-mpr-reveal
              aria-label="Inspector and differences"
            >
              <RightPanel />
            </aside>
          </>
        )}
        {compact && drawer && (
          <aside
            className="absolute top-12 right-0 bottom-0 z-30 w-[min(400px,100%)] border-l shadow-pop"
            aria-label="Inspector and differences"
          >
            <RightPanel />
          </aside>
        )}
      </div>
      {state.overlay === "command" && <CommandMenu />}
      {state.overlay === "shortcuts" && <ShortcutsDialog />}
    </div>
  );
}

export interface ReportViewerProps {
  data: ReportData;
  /** Prefix for asset URLs (e.g. "/demo/" when the data was copied elsewhere). */
  assetBase?: string;
  className?: string;
}

/** The interactive MotionPR report. Used by generated HTML reports and the docs site demo. */
export function ReportViewer({ data, assetBase = "", className }: ReportViewerProps) {
  const model = useMemo(() => buildModel(data, assetBase), [data, assetBase]);
  return (
    <div className={cx("h-full", className)}>
      <ViewerProvider model={model}>
        <Layout />
      </ViewerProvider>
    </div>
  );
}

export function ReportError({ message }: { message: string }) {
  return (
    <div className="mpr-root grid h-full place-items-center p-8">
      <div className="max-w-lg rounded-lg border bg-g-900 p-6">
        <p className="font-mono text-2xs tracking-[0.12em] text-sev-critical uppercase">
          Report unavailable
        </p>
        <p className="mt-2 text-sm text-paper">{message}</p>
        <p className="mt-2 text-xs text-g-400">
          Regenerate it with `npx motionpr report --regenerate`, or run `npx motionpr run`.
        </p>
      </div>
    </div>
  );
}
