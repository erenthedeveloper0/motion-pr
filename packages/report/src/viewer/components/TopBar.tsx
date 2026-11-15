import { useEffect, useRef, useState } from "react";
import { comparisonMarkdown, captureMarkdown } from "@motionpr/core/markdown";
import { engineLabel, relativeDate, shortId } from "../format.ts";
import { useViewer } from "../state.tsx";
import { Icon } from "./icons.tsx";
import { Mark } from "./Mark.tsx";
import { IconButton, Kbd, SeverityMark, cx } from "./ui.tsx";

function download(name: string, content: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API can be unavailable on file:// pages; fall back to a hidden textarea.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

function ExportMenu({ onClose }: { onClose: () => void }) {
  const { model } = useViewer();
  const ref = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [onClose]);
  const d = model.data;
  const items: { label: string; hint: string; run: () => void | Promise<void> }[] = [
    ...(d.comparison
      ? [
          {
            label: "Download comparison.json",
            hint: "differences, severities and measurements",
            run: () => download("comparison.json", JSON.stringify(d.comparison, null, 2)),
          },
          {
            label: "Copy Markdown summary",
            hint: "for a pull request or issue",
            run: async () =>
              setNote(
                (await copyText(comparisonMarkdown(d.comparison!)))
                  ? "Copied to clipboard"
                  : "Copy failed",
              ),
          },
        ]
      : [
          {
            label: "Copy Markdown summary",
            hint: "capture overview",
            run: async () =>
              setNote(
                (await copyText(captureMarkdown(d.candidate, "Capture-only report.")))
                  ? "Copied to clipboard"
                  : "Copy failed",
              ),
          },
        ]),
    {
      label: `Download ${d.comparison ? "candidate " : ""}capture.json`,
      hint: "timing, samples and identities",
      run: () => download("capture.json", JSON.stringify(d.candidate, null, 2)),
    },
    ...(d.baseline
      ? [
          {
            label: "Download baseline capture.json",
            hint: "the approved baseline",
            run: () => download("baseline-capture.json", JSON.stringify(d.baseline, null, 2)),
          },
        ]
      : []),
    { label: "Print / save as PDF", hint: "current view", run: () => window.print() },
  ];
  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Export"
      className="absolute top-[calc(100%+6px)] right-0 z-50 w-72 rounded-md bg-g-800 p-1 shadow-pop"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
          const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
          buttons[(i + (e.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length]?.focus();
        }
      }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          onClick={() => void item.run()}
          className="flex w-full flex-col rounded-sm px-2.5 py-2 text-left hover:bg-g-700 focus:bg-g-700"
        >
          <span className="text-xs text-paper">{item.label}</span>
          <span className="text-2xs text-g-400">{item.hint}</span>
        </button>
      ))}
      {note && (
        <p role="status" className="px-2.5 py-1.5 font-mono text-2xs text-ok">
          {note}
        </p>
      )}
    </div>
  );
}

export function TopBar({
  onToggleInspector,
  inspectorOpen,
}: {
  onToggleInspector?: () => void;
  inspectorOpen?: boolean;
}) {
  const { model, state, dispatch } = useViewer();
  const d = model.data;
  const summary = d.comparison?.summary;
  const failed = summary?.status === "failed";
  return (
    <header
      className="relative z-40 flex h-12 shrink-0 items-center gap-4 border-b bg-g-950/90 px-4"
      data-mpr-reveal
    >
      <div className="flex items-center gap-2.5">
        <Mark size={20} animate />
        <span className="hidden text-[15px] font-medium tracking-[-0.02em] text-paper sm:inline">
          motionpr
        </span>
      </div>
      <span className="hidden h-5 w-px bg-white/10 sm:block" aria-hidden="true" />
      <div className="flex min-w-0 items-center gap-3">
        <span className="truncate text-[13px] text-g-200" title={model.project}>
          {model.project}
        </span>
        <span className="hidden items-center gap-2 font-mono text-2xs whitespace-nowrap text-g-400 xl:flex">
          <span className="text-g-300" data-testid="engine">
            {d.baseline &&
            d.baseline.environment.browser.name !== d.candidate.environment.browser.name
              ? `${engineLabel(d.baseline.environment.browser.name)} → ${engineLabel(d.candidate.environment.browser.name)}`
              : engineLabel(d.candidate.environment.browser.name)}
          </span>
          {d.baseline && (
            <>
              <span
                className="flex items-center gap-1.5"
                title={`Baseline captured ${relativeDate(d.baseline.createdAt)} · ${d.baseline.environment.platform} · ${engineLabel(d.baseline.environment.browser.name)} ${d.baseline.environment.browser.version}`}
              >
                <span className="size-1.5 rounded-full bg-base" />
                {shortId(d.baseline.id)}
              </span>
              <span className="text-g-600">→</span>
            </>
          )}
          <span
            className="flex items-center gap-1.5"
            title={`Captured ${relativeDate(d.candidate.createdAt)} · ${d.candidate.environment.platform} · ${engineLabel(d.candidate.environment.browser.name)} ${d.candidate.environment.browser.version}`}
          >
            <span className="size-1.5 rounded-full bg-cand" />
            {shortId(d.candidate.id)}
          </span>
        </span>
      </div>
      {summary ? (
        <div
          className={cx(
            "flex h-7 shrink-0 items-center gap-2.5 rounded-full px-3 text-xs whitespace-nowrap",
            failed ? "bg-sev-critical/12 text-sev-critical" : "bg-ok/10 text-ok",
          )}
          role="status"
        >
          <span className="hidden font-medium sm:inline">
            {failed ? "Regression" : "Within thresholds"}
          </span>
          <span className="flex items-center gap-2 font-mono text-2xs text-g-300">
            {(["critical", "warning", "uncertain", "info"] as const).map((s) =>
              summary.counts[s] ? (
                <span
                  key={s}
                  className="flex items-center gap-1"
                  title={`${summary.counts[s]} ${s}`}
                >
                  <SeverityMark severity={s} />
                  {summary.counts[s]}
                </span>
              ) : null,
            )}
          </span>
        </div>
      ) : (
        <span className="shrink-0 rounded-full bg-g-800 px-3 py-1 text-xs whitespace-nowrap text-g-300">
          Capture only · no baseline
        </span>
      )}
      {d.notes.length > 0 && (
        <span
          className="hidden min-w-0 truncate text-2xs text-g-400 2xl:block"
          title={d.notes.join(" ")}
        >
          {d.notes[0]}
        </span>
      )}
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={() => dispatch({ type: "overlay", overlay: "command" })}
          className="mr-1 hidden h-8 items-center gap-2 rounded-sm border bg-g-850 px-2.5 text-xs whitespace-nowrap text-g-400 hover:text-paper lg:flex"
          aria-label="Open command menu"
        >
          <Icon.Search />
          <span>Jump to…</span>
          <Kbd>⌘K</Kbd>
        </button>
        <div className="relative">
          <IconButton
            label="Export"
            active={state.overlay === "export"}
            onClick={() =>
              dispatch({ type: "overlay", overlay: state.overlay === "export" ? "none" : "export" })
            }
            aria-haspopup="menu"
          >
            <Icon.Download />
          </IconButton>
          {state.overlay === "export" && (
            <ExportMenu onClose={() => dispatch({ type: "overlay", overlay: "none" })} />
          )}
        </div>
        <IconButton
          label="Keyboard shortcuts"
          shortcut="?"
          onClick={() => dispatch({ type: "overlay", overlay: "shortcuts" })}
        >
          <Icon.Keyboard />
        </IconButton>
        {onToggleInspector && (
          <IconButton
            label={inspectorOpen ? "Hide inspector" : "Show inspector"}
            active={inspectorOpen}
            onClick={onToggleInspector}
            className="xl:hidden"
          >
            <Icon.Panel />
          </IconButton>
        )}
      </div>
    </header>
  );
}
