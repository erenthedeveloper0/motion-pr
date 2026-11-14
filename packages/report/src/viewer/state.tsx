import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  useSyncExternalStore,
  type Dispatch,
  type ReactNode,
} from "react";
import type { DifferenceCategory, Severity } from "@motionpr/core";
import type {
  Channel,
  CheckpointView,
  EngineKey,
  ReportModel,
  ScenarioView,
  ScrollTrackView,
  TrackView,
} from "./model.ts";

export type StageMode = "side" | "overlay" | "onion" | "wipe" | "difference" | "pixel";
export type RightTab = "inspector" | "differences";
export type DiffFilter = DifferenceCategory | "changed";

export interface ViewerState {
  scenarioKey: string | null;
  checkpointId: string | null;
  trackKey: string | null;
  playing: boolean;
  speed: number;
  loop: boolean;
  mode: StageMode;
  overlayOpacity: number;
  wipe: number;
  zoom: number | "fit";
  timelinePxPerMs: number | "fit";
  rightTab: RightTab;
  filters: DiffFilter[];
  severities: Severity[];
  /** Engines to show (empty = all), applied to timeline rows and the difference list. */
  engines: EngineKey[];
  query: string;
  showBoxes: boolean;
  channel: Channel | null;
  overlay: "none" | "command" | "shortcuts" | "export";
}

export type Action =
  | { type: "select-scenario"; key: string }
  | { type: "select-checkpoint"; id: string }
  | { type: "select-track"; key: string | null }
  | { type: "navigate"; scenarioKey: string; checkpointId: string | null; trackKey: string | null }
  | { type: "play"; playing: boolean }
  | { type: "speed"; speed: number }
  | { type: "loop"; loop: boolean }
  | { type: "mode"; mode: StageMode }
  | { type: "overlay-opacity"; value: number }
  | { type: "wipe"; value: number }
  | { type: "zoom"; zoom: number | "fit" }
  | { type: "timeline-zoom"; value: number | "fit" }
  | { type: "right-tab"; tab: RightTab }
  | { type: "toggle-filter"; filter: DiffFilter }
  | { type: "toggle-severity"; severity: Severity }
  | { type: "toggle-engine"; engine: EngineKey }
  | { type: "clear-filters" }
  | { type: "query"; query: string }
  | { type: "boxes"; value: boolean }
  | { type: "channel"; channel: Channel | null }
  | { type: "overlay"; overlay: ViewerState["overlay"] };

function reducer(state: ViewerState, action: Action): ViewerState {
  switch (action.type) {
    case "select-scenario":
      return state.scenarioKey === action.key
        ? state
        : { ...state, scenarioKey: action.key, checkpointId: null, trackKey: null, playing: false };
    case "select-checkpoint":
      return state.checkpointId === action.id
        ? state
        : { ...state, checkpointId: action.id, trackKey: null, playing: false };
    case "select-track":
      return {
        ...state,
        trackKey: action.key,
        rightTab: action.key ? "inspector" : state.rightTab,
        channel: null,
      };
    case "navigate":
      return {
        ...state,
        scenarioKey: action.scenarioKey,
        checkpointId: action.checkpointId,
        trackKey: action.trackKey,
        playing: false,
        channel: null,
        // Jumping to a specific animation shows its details.
        rightTab: action.trackKey ? "inspector" : state.rightTab,
      };
    case "play":
      return { ...state, playing: action.playing };
    case "speed":
      return { ...state, speed: action.speed };
    case "loop":
      return { ...state, loop: action.loop };
    case "mode":
      return { ...state, mode: action.mode };
    case "overlay-opacity":
      return { ...state, overlayOpacity: action.value };
    case "wipe":
      return { ...state, wipe: Math.min(1, Math.max(0, action.value)) };
    case "zoom":
      return { ...state, zoom: action.zoom };
    case "timeline-zoom":
      return { ...state, timelinePxPerMs: action.value };
    case "right-tab":
      return { ...state, rightTab: action.tab };
    case "toggle-filter":
      return {
        ...state,
        filters: state.filters.includes(action.filter)
          ? state.filters.filter((f) => f !== action.filter)
          : [...state.filters, action.filter],
      };
    case "toggle-severity":
      return {
        ...state,
        severities: state.severities.includes(action.severity)
          ? state.severities.filter((s) => s !== action.severity)
          : [...state.severities, action.severity],
      };
    case "toggle-engine":
      return {
        ...state,
        engines: state.engines.includes(action.engine)
          ? state.engines.filter((e) => e !== action.engine)
          : [...state.engines, action.engine],
      };
    case "clear-filters":
      return { ...state, filters: [], severities: [], engines: [], query: "" };
    case "query":
      return { ...state, query: action.query };
    case "boxes":
      return { ...state, showBoxes: action.value };
    case "channel":
      return { ...state, channel: action.channel };
    case "overlay":
      return { ...state, overlay: action.overlay };
  }
}

/** Minimal external store for the playhead so 60 fps updates do not re-render the whole tree. */
export interface TimeStore {
  get(): number;
  set(t: number): void;
  subscribe(cb: () => void): () => void;
}

function createTimeStore(): TimeStore {
  let t = 0;
  const subs = new Set<() => void>();
  return {
    get: () => t,
    set(next) {
      if (next === t) return;
      t = next;
      for (const cb of subs) cb();
    },
    subscribe(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
  };
}

interface ViewerContextValue {
  model: ReportModel;
  state: ViewerState;
  dispatch: Dispatch<Action>;
  time: TimeStore;
  scenario: ScenarioView | null;
  checkpoint: CheckpointView | null;
  track: TrackView | null;
  /** Selected scroll record (selection shares `trackKey`, prefixed `scroll:`). */
  scroll: ScrollTrackView | null;
}

const ViewerContext = createContext<ViewerContextValue | null>(null);

export function initialState(model: ReportModel): ViewerState {
  const first =
    [...model.scenarios].sort((a, b) => sevRank(b.severity) - sevRank(a.severity))[0] ??
    model.scenarios[0];
  const checkpoint = first?.checkpoints.find((c) => c.severity !== null) ?? first?.checkpoints[0];
  return {
    scenarioKey: first?.key ?? null,
    checkpointId: checkpoint?.id ?? null,
    trackKey: null,
    playing: false,
    speed: 1,
    loop: true,
    mode: model.mode === "comparison" ? "side" : "side",
    overlayOpacity: 0.5,
    wipe: 0.5,
    zoom: "fit",
    timelinePxPerMs: "fit",
    rightTab: "inspector",
    filters: [],
    severities: [],
    engines: [],
    query: "",
    showBoxes: true,
    channel: null,
    overlay: "none",
  };
}

export function sevRank(s: Severity | null | undefined): number {
  return s === "critical" ? 4 : s === "warning" ? 3 : s === "uncertain" ? 2 : s === "info" ? 1 : 0;
}

export function ViewerProvider({ model, children }: { model: ReportModel; children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, model, initialState);
  const timeRef = useRef<TimeStore | null>(null);
  timeRef.current ??= createTimeStore();
  const value = useMemo<ViewerContextValue>(() => {
    const scenario = model.scenarios.find((s) => s.key === state.scenarioKey) ?? null;
    const checkpoint =
      scenario?.checkpoints.find((c) => c.id === state.checkpointId) ??
      scenario?.checkpoints[0] ??
      null;
    const track = checkpoint?.tracks.find((t) => t.key === state.trackKey) ?? null;
    const scroll = checkpoint?.scroll.find((t) => t.key === state.trackKey) ?? null;
    return { model, state, dispatch, time: timeRef.current!, scenario, checkpoint, track, scroll };
  }, [model, state]);
  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}

export function useViewer(): ViewerContextValue {
  const ctx = useContext(ViewerContext);
  if (!ctx) throw new Error("useViewer must be used inside <ViewerProvider>");
  return ctx;
}

export function useTime(): number {
  const { time } = useViewer();
  return useSyncExternalStore(time.subscribe, time.get, time.get);
}

export function useSeek(): (t: number) => void {
  const { time, checkpoint } = useViewer();
  const duration = checkpoint?.duration ?? 0;
  return useCallback((t: number) => time.set(Math.min(Math.max(0, t), duration)), [time, duration]);
}
