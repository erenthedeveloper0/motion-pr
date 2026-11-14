import { useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { cx } from "./ui.tsx";

/**
 * Accessible resize handle (role="separator"). Drag with the pointer or focus it and use the
 * arrow keys (Shift for larger steps). `invert` flips the direction for right/bottom panels.
 */
export function Splitter({
  orientation,
  value,
  min,
  max,
  onChange,
  label,
  invert = false,
}: {
  orientation: "vertical" | "horizontal";
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
  invert?: boolean;
}) {
  const start = useRef<{ pos: number; value: number } | null>(null);
  const clamp = (v: number) => Math.round(Math.min(max, Math.max(min, v)));
  const axis = (e: ReactPointerEvent) => (orientation === "vertical" ? e.clientX : e.clientY);
  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 48 : 12;
    const dec = orientation === "vertical" ? "ArrowLeft" : "ArrowUp";
    const inc = orientation === "vertical" ? "ArrowRight" : "ArrowDown";
    let delta: number;
    if (e.key === dec) delta = -step;
    else if (e.key === inc) delta = step;
    else if (e.key === "Home") return onChange(min);
    else if (e.key === "End") return onChange(max);
    else return;
    e.preventDefault();
    e.stopPropagation();
    onChange(clamp(value + (invert ? -delta : delta)));
  };
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={orientation}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onKeyDown={onKey}
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture(e.pointerId);
        start.current = { pos: axis(e), value };
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const delta = axis(e) - start.current.pos;
        onChange(clamp(start.current.value + (invert ? -delta : delta)));
      }}
      onPointerUp={() => (start.current = null)}
      onPointerCancel={() => (start.current = null)}
      className={cx(
        "group relative z-20 shrink-0 touch-none outline-none",
        orientation === "vertical"
          ? "-mx-[3px] w-[7px] cursor-col-resize"
          : "-my-[3px] h-[7px] cursor-row-resize",
      )}
    >
      <span
        className={cx(
          "absolute bg-white/[0.07] transition-colors duration-150 group-hover:bg-violet-hi/70 group-focus-visible:bg-violet-hi",
          orientation === "vertical" ? "inset-y-0 left-[3px] w-px" : "inset-x-0 top-[3px] h-px",
        )}
      />
    </div>
  );
}
