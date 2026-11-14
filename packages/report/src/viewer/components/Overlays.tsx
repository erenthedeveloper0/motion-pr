import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { findDifferenceTarget } from "../model.ts";
import { useViewer, type StageMode } from "../state.tsx";
import { Icon } from "./icons.tsx";
import { Kbd, SeverityMark, cx } from "./ui.tsx";

function Modal({
  label,
  onClose,
  children,
  wide,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    return () => previous?.focus?.();
  }, []);
  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-ink/60 p-4 pt-[12vh] backdrop-blur-[3px]"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={cx(
          "w-full overflow-hidden rounded-lg bg-g-850 shadow-pop",
          wide ? "max-w-2xl" : "max-w-xl",
        )}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

interface Command {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
  run: () => void;
}

/** Subsequence fuzzy match with a simple score (contiguous and prefix matches rank higher). */
export function fuzzyScore(query: string, text: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const s = text.toLowerCase();
  const direct = s.indexOf(q);
  if (direct >= 0) return 100 - direct;
  let si = 0;
  let score = 0;
  for (const ch of q) {
    const found = s.indexOf(ch, si);
    if (found < 0) return 0;
    score += found === si ? 2 : 1;
    si = found + 1;
  }
  return score;
}

export function CommandMenu() {
  const { model, dispatch, time, checkpoint } = useViewer();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const close = () => dispatch({ type: "overlay", overlay: "none" });
  const commands = useMemo<Command[]>(() => {
    const out: Command[] = [];
    for (const s of model.scenarios) {
      out.push({
        id: `s:${s.key}`,
        group: "Scenarios",
        label: s.name,
        hint: `${s.viewport} · ${s.changeCount} changes`,
        icon: <SeverityMark severity={s.severity} />,
        run: () => (dispatch({ type: "select-scenario", key: s.key }), time.set(0)),
      });
      for (const c of s.checkpoints) {
        out.push({
          id: `c:${c.id}`,
          group: "Checkpoints",
          label: `${s.name} › ${c.label}`,
          hint: `${c.tracks.length} animations`,
          icon: <SeverityMark severity={c.severity} />,
          run: () => (
            dispatch({ type: "navigate", scenarioKey: s.key, checkpointId: c.id, trackKey: null }),
            time.set(0)
          ),
        });
      }
    }
    for (const tr of checkpoint?.tracks ?? []) {
      out.push({
        id: `t:${tr.key}`,
        group: "Animations in this checkpoint",
        label: tr.label,
        hint: tr.detail,
        icon: <SeverityMark severity={tr.severity} />,
        run: () => dispatch({ type: "select-track", key: tr.key }),
      });
    }
    for (const d of model.differences.slice(0, 300)) {
      out.push({
        id: `d:${d.id}`,
        group: "Differences",
        label: d.title,
        hint: `${d.scenarioKey}${d.checkpoint ? ` › ${d.checkpoint}` : ""}`,
        icon: <SeverityMark severity={d.severity} />,
        run: () => {
          const target = findDifferenceTarget(model, d);
          if (target)
            dispatch({
              type: "navigate",
              scenarioKey: target.scenario.key,
              checkpointId: target.checkpoint?.id ?? null,
              trackKey: target.track?.key ?? null,
            });
        },
      });
    }
    const modes: [StageMode, string][] = [
      ["side", "Side by side"],
      ["overlay", "Overlay"],
      ["onion", "Onion skin + motion paths"],
      ["wipe", "Wipe"],
      ["difference", "Difference blend"],
      ["pixel", "Settled pixel diff"],
    ];
    if (model.mode === "comparison")
      for (const [mode, label] of modes)
        out.push({
          id: `m:${mode}`,
          group: "View",
          label: `Mode: ${label}`,
          run: () => dispatch({ type: "mode", mode }),
        });
    out.push({
      id: "a:diffs",
      group: "View",
      label: "Show differences panel",
      run: () => dispatch({ type: "right-tab", tab: "differences" }),
    });
    out.push({
      id: "a:shortcuts",
      group: "View",
      label: "Keyboard shortcuts",
      run: () => dispatch({ type: "overlay", overlay: "shortcuts" }),
    });
    return out;
  }, [model, checkpoint, dispatch, time]);
  const results = useMemo(
    () =>
      commands
        .map((c) => ({
          c,
          score: Math.max(fuzzyScore(query, c.label), fuzzyScore(query, c.hint ?? "") * 0.6),
        }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 60)
        .map((x) => x.c),
    [commands, query],
  );
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const run = (c: Command | undefined) => {
    if (!c) return;
    c.run();
    if (!c.id.startsWith("a:shortcuts")) close();
  };
  let lastGroup = "";
  return (
    <Modal label="Command menu" onClose={close}>
      <div className="flex items-center gap-2 border-b px-3">
        <Icon.Search className="text-g-400" />
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls="mpr-command-list"
          aria-activedescendant={results[active] ? `mpr-cmd-${active}` : undefined}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setActive((a) => Math.min(results.length - 1, a + 1));
            else if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
            else if (e.key === "Enter") run(results[active]);
            else return;
            e.preventDefault();
          }}
          placeholder="Jump to a scenario, animation, difference or action…"
          className="h-12 flex-1 bg-transparent text-sm text-paper outline-none placeholder:text-g-500"
        />
        <Kbd>esc</Kbd>
      </div>
      <ul
        ref={listRef}
        id="mpr-command-list"
        role="listbox"
        className="max-h-[50vh] overflow-y-auto p-1.5 mpr-scroll"
      >
        {results.length === 0 && <li className="p-4 text-sm text-g-400">No matches.</li>}
        {results.map((c, i) => {
          const header = c.group !== lastGroup ? c.group : null;
          lastGroup = c.group;
          return (
            <li key={c.id}>
              {header && (
                <p className="px-2.5 pt-2 pb-1 font-mono text-2xs tracking-[0.1em] text-g-500 uppercase">
                  {header}
                </p>
              )}
              <button
                id={`mpr-cmd-${i}`}
                data-index={i}
                type="button"
                role="option"
                aria-selected={i === active}
                onPointerMove={() => setActive(i)}
                onClick={() => run(c)}
                className={cx(
                  "flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left",
                  i === active ? "bg-g-700" : "",
                )}
              >
                <span className="grid w-3 place-items-center">{c.icon}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-paper">{c.label}</span>
                {c.hint && (
                  <span className="max-w-[40%] truncate font-mono text-2xs text-g-400">
                    {c.hint}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

export const SHORTCUTS: [string, string][] = [
  ["Space", "Play / pause"],
  ["← / →", "Previous / next frame"],
  ["Shift + ← / →", "Jump 10 frames"],
  ["Home / End", "Start / end of the window"],
  ["J / K", "Next / previous scenario"],
  ["[ / ]", "Previous / next checkpoint"],
  ["N / P", "Next / previous difference"],
  ["↑ / ↓", "Move track selection (timeline focused)"],
  ["1 – 6", "Side · overlay · onion · wipe · difference · pixel diff"],
  ["B", "Toggle element boxes"],
  ["+ / − / 0", "Zoom in · zoom out · fit"],
  ["D", "Differences panel"],
  ["I", "Inspector panel"],
  ["Esc", "Clear selection / close dialogs"],
  ["⌘K / Ctrl+K", "Command menu"],
  ["?", "This list"],
];

export function ShortcutsDialog() {
  const { dispatch } = useViewer();
  const close = () => dispatch({ type: "overlay", overlay: "none" });
  return (
    <Modal label="Keyboard shortcuts" onClose={close} wide>
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm text-paper">Keyboard shortcuts</h2>
        <button
          type="button"
          autoFocus
          onClick={close}
          aria-label="Close"
          className="rounded-sm p-1 text-g-400 hover:text-paper"
        >
          <Icon.Close />
        </button>
      </div>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-2 p-4 sm:grid-cols-2">
        {SHORTCUTS.map(([keys, label]) => (
          <div key={keys} className="flex items-center justify-between gap-3 text-xs">
            <dt className="text-g-300">{label}</dt>
            <dd className="m-0 flex gap-1">
              {keys.split(" / ").map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
