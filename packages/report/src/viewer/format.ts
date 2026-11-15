import type { Severity } from "@motionpr/core";

export function ms(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const factor = 10 ** digits;
  return `${Math.round(value * factor) / factor}ms`;
}

export function num(value: number | null | undefined, digits = 2, unit = ""): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const factor = 10 ** digits;
  return `${Math.round(value * factor) / factor}${unit}`;
}

export function signed(value: number | null | undefined, digits = 0, unit = ""): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  const factor = 10 ** digits;
  const v = Math.round(value * factor) / factor;
  if (v === 0) return `±0${unit}`;
  return `${v > 0 ? "+" : "−"}${Math.abs(v)}${unit}`;
}

export function percent(ratio: number, digits = 2): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function timecode(t: number): string {
  const s = Math.floor(t / 1000);
  const rest = Math.round(t - s * 1000);
  return `${String(s).padStart(2, "0")}.${String(rest).padStart(3, "0")}`;
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  warning: "Warning",
  info: "Info",
  uncertain: "Uncertain",
};

export function shortId(id: string): string {
  return id.length > 22 ? `${id.slice(0, 20)}…` : id;
}

export function relativeDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ENGINE_LABELS: Record<string, string> = {
  chromium: "Chromium",
  firefox: "Firefox",
  webkit: "WebKit",
};

/** Display name of the browser engine a capture was taken with. */
export function engineLabel(name: string): string {
  return ENGINE_LABELS[name.toLowerCase()] ?? name;
}
