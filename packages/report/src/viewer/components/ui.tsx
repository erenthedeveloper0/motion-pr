import { forwardRef, useId, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { Severity } from "@motionpr/core";
import { SEVERITY_LABEL } from "../format.ts";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export const SEVERITY_TEXT: Record<Severity, string> = {
  critical: "text-sev-critical",
  warning: "text-sev-warning",
  info: "text-sev-info",
  uncertain: "text-sev-uncertain",
};
const SEVERITY_BG: Record<Severity, string> = {
  critical: "bg-sev-critical",
  warning: "bg-sev-warning",
  info: "bg-sev-info",
  uncertain: "bg-sev-uncertain",
};

/** Severity glyph: filled shape per level so it is distinguishable without color. */
export function SeverityMark({
  severity,
  className,
}: {
  severity: Severity | null;
  className?: string;
}) {
  if (!severity) {
    return (
      <span
        aria-label="No change"
        className={cx("inline-block size-[7px] rounded-full border border-g-500", className)}
      />
    );
  }
  const shape =
    severity === "critical"
      ? "rotate-45 rounded-[1.5px]"
      : severity === "warning"
        ? "rounded-[1.5px]"
        : severity === "uncertain"
          ? "rounded-full border border-current bg-transparent!"
          : "rounded-full";
  return (
    <span
      role="img"
      aria-label={SEVERITY_LABEL[severity]}
      className={cx(
        "inline-block size-[7px] shrink-0",
        SEVERITY_BG[severity],
        SEVERITY_TEXT[severity],
        shape,
        className,
      )}
    />
  );
}

export function SeverityBadge({ severity, count }: { severity: Severity; count?: number }) {
  return (
    <span
      className={cx(
        "inline-flex h-[18px] items-center gap-1.5 rounded-xs px-1.5 font-mono text-2xs uppercase tracking-wide",
        SEVERITY_TEXT[severity],
        "bg-current/10",
      )}
    >
      <SeverityMark severity={severity} />
      <span className="text-current">
        {count !== undefined ? `${count} ` : ""}
        {SEVERITY_LABEL[severity]}
      </span>
    </span>
  );
}

export function Tag({
  children,
  tone = "neutral",
  title,
}: {
  children: ReactNode;
  tone?: "neutral" | "base" | "cand" | "violet" | "warn";
  title?: string;
}) {
  const tones = {
    neutral: "text-g-300 bg-g-800",
    base: "text-base bg-base/10",
    cand: "text-cand bg-cand/10",
    violet: "text-violet-hi bg-violet/15",
    warn: "text-sev-warning bg-sev-warning/10",
  } as const;
  return (
    <span
      title={title}
      className={cx(
        "inline-flex h-[18px] items-center rounded-xs px-1.5 font-mono text-2xs tracking-wide whitespace-nowrap",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-xs border border-g-600 bg-g-800 px-1 font-mono text-2xs text-g-200">
      {children}
    </kbd>
  );
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  active?: boolean;
  shortcut?: string;
  size?: "sm" | "md";
};

/** Square icon button with an accessible name and a tooltip that includes its shortcut. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, active, shortcut, size = "md", className, children, ...rest },
  ref,
) {
  return (
    <Tooltip label={label} shortcut={shortcut}>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-pressed={active === undefined ? undefined : active}
        className={cx(
          "inline-flex items-center justify-center rounded-sm text-g-200 transition-[background-color,color] duration-150 hover:bg-g-750 hover:text-paper disabled:pointer-events-none disabled:opacity-35",
          size === "md" ? "size-8" : "size-7",
          active && "bg-g-750 text-paper shadow-[inset_0_0_0_1px_rgb(126_74_230/0.55)]",
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    </Tooltip>
  );
});

export function Tooltip({
  label,
  shortcut,
  children,
  side = "top",
}: {
  label: string;
  shortcut?: string | undefined;
  children: ReactNode;
  side?: "top" | "bottom";
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span
      className="relative inline-flex"
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={() => setOpen(false)}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open && (
        <span
          id={id}
          role="tooltip"
          className={cx(
            "pointer-events-none absolute left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-sm bg-g-750 px-2 py-1 text-xs whitespace-nowrap text-paper shadow-pop",
            side === "top" ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]",
          )}
        >
          {label}
          {shortcut && <Kbd>{shortcut}</Kbd>}
        </span>
      )}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; icon?: ReactNode; shortcut?: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex items-center gap-0.5 rounded-md bg-g-850 p-0.5 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.04)]"
    >
      {options.map((o) => (
        <Tooltip key={o.value} label={o.label} shortcut={o.shortcut}>
          <button
            type="button"
            role="radio"
            aria-checked={value === o.value}
            aria-label={o.label}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cx(
              "inline-flex h-7 min-w-7 items-center justify-center gap-1.5 rounded-sm px-1.5 text-xs text-g-300 transition-colors duration-150 hover:text-paper disabled:opacity-30",
              value === o.value &&
                "bg-g-700 text-paper shadow-[0_1px_0_0_rgb(255_255_255/0.06)_inset]",
            )}
          >
            {o.icon}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex h-8 items-center justify-between gap-2">
      <h3 className="font-mono text-2xs tracking-[0.12em] text-g-400 uppercase">{children}</h3>
      {aside}
    </div>
  );
}
