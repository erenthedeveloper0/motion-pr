import { MotionprError } from "./errors.ts";

/**
 * Browser engines MotionPR captures with. Each is the Playwright build of that engine: Chromium
 * (Blink), Firefox (Gecko) and WebKit. Captures, baselines, comparisons and reports are kept
 * separate per engine, because engines render, lay out and schedule motion differently.
 */
export const BROWSER_NAMES = ["chromium", "firefox", "webkit"] as const;
export type BrowserName = (typeof BROWSER_NAMES)[number];

/** How each engine is written in human output. */
export const BROWSER_LABELS: Record<BrowserName, string> = {
  chromium: "Chromium",
  firefox: "Firefox",
  webkit: "WebKit",
};

export function isBrowserName(value: unknown): value is BrowserName {
  return typeof value === "string" && (BROWSER_NAMES as readonly string[]).includes(value);
}

/** The label for a browser name, or the name itself for an unknown engine. */
export function browserLabel(name: string): string {
  return isBrowserName(name) ? BROWSER_LABELS[name] : name;
}

/**
 * Parses a `--browser` value: one name, `all`, or a comma-separated list (repeatable). Unknown
 * names are an error, never a fallback to Chromium. Duplicates are removed; order is kept.
 */
export function parseBrowserSelection(
  value: string | readonly string[] | undefined,
  fallback: BrowserName,
): BrowserName[] {
  const raw = (typeof value === "string" ? [value] : (value ?? []))
    .flatMap((v) => v.split(","))
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  if (!raw.length) return [fallback];
  const out: BrowserName[] = [];
  for (const name of raw) {
    const names = name === "all" ? BROWSER_NAMES : [name];
    for (const n of names) {
      if (!isBrowserName(n)) {
        throw new MotionprError("CONFIG_INVALID", `Unknown browser "${n}".`, {
          hint: `Use ${BROWSER_NAMES.join(", ")} or all (e.g. --browser firefox, --browser chromium,webkit).`,
        });
      }
      if (!out.includes(n)) out.push(n);
    }
  }
  return out;
}

/**
 * Engine a browser channel belongs to. Playwright's Firefox channels are `moz-firefox`,
 * `moz-firefox-beta` and `moz-firefox-nightly`; every other channel (`chrome`, `msedge`, …) is a
 * Chromium channel. WebKit has no channels.
 */
export function channelEngine(channel: string): Extract<BrowserName, "chromium" | "firefox"> {
  return channel.startsWith("moz-") ? "firefox" : "chromium";
}

/**
 * Engine a capture was taken with, from its environment. Captures written before Firefox and
 * WebKit support always used Chromium; their `name` is `"chromium"` too.
 */
export function captureBrowser(bundle: { environment: { browser: { name: string } } }): string {
  return bundle.environment.browser.name.toLowerCase();
}
