import type {
  CssEasing,
  CubicBezierEasing,
  CubicBezierKeyword,
  LinearPoint,
  StepPosition,
} from "./types.ts";

const KEYWORD_BEZIERS: Record<CubicBezierKeyword, readonly [number, number, number, number]> = {
  ease: [0.25, 0.1, 0.25, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1],
};

export class EasingParseError extends Error {
  override readonly name = "EasingParseError";
  readonly input: string;
  constructor(input: string, reason: string) {
    super(`Cannot parse easing "${input}": ${reason}`);
    this.input = input;
  }
}

function keywordBezier(keyword: CubicBezierKeyword): CubicBezierEasing {
  const [x1, y1, x2, y2] = KEYWORD_BEZIERS[keyword];
  return { type: "cubic-bezier", x1, y1, x2, y2, keyword };
}

function parseNumber(raw: string, input: string): number {
  const value = Number(raw.trim());
  if (raw.trim() === "" || !Number.isFinite(value)) {
    throw new EasingParseError(input, `"${raw.trim()}" is not a number`);
  }
  return value;
}

function parsePercentage(raw: string, input: string): number {
  const trimmed = raw.trim();
  if (!trimmed.endsWith("%")) {
    throw new EasingParseError(input, `"${trimmed}" must be a percentage`);
  }
  return parseNumber(trimmed.slice(0, -1), input) / 100;
}

/** Finds a keyword bezier whose control points equal the given values (within float noise). */
export function matchBezierKeyword(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): CubicBezierKeyword | undefined {
  for (const [keyword, points] of Object.entries(KEYWORD_BEZIERS) as [
    CubicBezierKeyword,
    readonly number[],
  ][]) {
    const candidate = [x1, y1, x2, y2];
    if (points.every((p, i) => Math.abs(p - (candidate[i] ?? Number.NaN)) < 1e-6)) return keyword;
  }
  return undefined;
}

/**
 * Resolves `linear()` control points following CSS Easing Level 2:
 * missing first/last inputs default to 0 and max(1, previous), every input is clamped to be
 * at least the largest preceding input, and runs of missing inputs are spread evenly.
 */
function resolveLinearPoints(
  entries: { output: number; inputs: number[] }[],
  input: string,
): LinearPoint[] {
  const points: { output: number; input: number | undefined }[] = [];
  for (const entry of entries) {
    if (entry.inputs.length === 0) points.push({ output: entry.output, input: undefined });
    else for (const i of entry.inputs) points.push({ output: entry.output, input: i });
  }
  if (points.length < 2) {
    throw new EasingParseError(input, "linear() needs at least two points");
  }
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (first.input === undefined) first.input = 0;
  if (last.input === undefined) last.input = Math.max(1, ...points.map((p) => p.input ?? 0));

  let largest = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    if (point.input !== undefined) {
      point.input = Math.max(point.input, largest);
      largest = point.input;
    }
  }
  for (let i = 0; i < points.length; i++) {
    if (points[i]!.input !== undefined) continue;
    const startIndex = i - 1;
    let endIndex = i;
    while (points[endIndex]!.input === undefined) endIndex++;
    const start = points[startIndex]!.input!;
    const end = points[endIndex]!.input!;
    const span = endIndex - startIndex;
    for (let j = startIndex + 1; j < endIndex; j++) {
      points[j]!.input = start + ((end - start) * (j - startIndex)) / span;
    }
    i = endIndex;
  }
  return points.map((p) => ({ input: p.input!, output: p.output }));
}

function splitArgs(body: string): string[] {
  return body.split(",").map((part) => part.trim());
}

/**
 * Parses a CSS easing function string. Throws {@link EasingParseError} for anything that is
 * not a valid CSS <easing-function>. Use {@link tryParseCssEasing} for a non-throwing variant.
 */
export function parseCssEasing(input: string): CssEasing {
  const source = input.trim().toLowerCase();
  if (source === "linear") return { type: "linear" };
  if (
    source === "ease" ||
    source === "ease-in" ||
    source === "ease-out" ||
    source === "ease-in-out"
  ) {
    return keywordBezier(source);
  }
  if (source === "step-start") return { type: "steps", steps: 1, position: "jump-start" };
  if (source === "step-end") return { type: "steps", steps: 1, position: "jump-end" };

  const call = /^([a-z-]+)\((.*)\)$/s.exec(source);
  if (!call) throw new EasingParseError(input, "unknown easing keyword");
  const [, fn, body = ""] = call;

  if (fn === "cubic-bezier") {
    const args = splitArgs(body);
    if (args.length !== 4) throw new EasingParseError(input, "cubic-bezier() takes 4 arguments");
    const [x1, y1, x2, y2] = args.map((a) => parseNumber(a, input)) as [
      number,
      number,
      number,
      number,
    ];
    if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) {
      throw new EasingParseError(input, "cubic-bezier() x values must be within [0, 1]");
    }
    const keyword = matchBezierKeyword(x1, y1, x2, y2);
    return keyword
      ? { type: "cubic-bezier", x1, y1, x2, y2, keyword }
      : { type: "cubic-bezier", x1, y1, x2, y2 };
  }

  if (fn === "steps") {
    const args = splitArgs(body);
    if (args.length < 1 || args.length > 2)
      throw new EasingParseError(input, "steps() takes 1 or 2 arguments");
    const steps = parseNumber(args[0]!, input);
    const rawPosition = args[1] ?? "end";
    const position: StepPosition | undefined = (
      {
        start: "jump-start",
        end: "jump-end",
        "jump-start": "jump-start",
        "jump-end": "jump-end",
        "jump-none": "jump-none",
        "jump-both": "jump-both",
      } as Record<string, StepPosition>
    )[rawPosition];
    if (!position) throw new EasingParseError(input, `unknown step position "${rawPosition}"`);
    if (!Number.isInteger(steps) || steps < 1 || (position === "jump-none" && steps < 2)) {
      throw new EasingParseError(
        input,
        "steps() needs a positive integer (at least 2 for jump-none)",
      );
    }
    return { type: "steps", steps, position };
  }

  if (fn === "linear") {
    const entries = splitArgs(body).map((part) => {
      const tokens = part.split(/\s+/).filter(Boolean);
      if (tokens.length < 1 || tokens.length > 3) {
        throw new EasingParseError(input, `invalid linear() stop "${part}"`);
      }
      return {
        output: parseNumber(tokens[0]!, input),
        inputs: tokens.slice(1).map((t) => parsePercentage(t, input)),
      };
    });
    return { type: "linear-function", points: resolveLinearPoints(entries, input) };
  }

  throw new EasingParseError(input, `unsupported easing function "${fn}()"`);
}

export function tryParseCssEasing(input: string): CssEasing | null {
  try {
    return parseCssEasing(input);
  } catch {
    return null;
  }
}

const fmt = (n: number): string => String(Math.round(n * 1e6) / 1e6);

/** Serializes a parsed easing back to its canonical CSS form (keywords are preserved). */
export function formatCssEasing(easing: CssEasing): string {
  switch (easing.type) {
    case "linear":
      return "linear";
    case "cubic-bezier":
      return (
        easing.keyword ??
        `cubic-bezier(${fmt(easing.x1)}, ${fmt(easing.y1)}, ${fmt(easing.x2)}, ${fmt(easing.y2)})`
      );
    case "steps":
      return `steps(${easing.steps}, ${easing.position})`;
    case "linear-function":
      return `linear(${easing.points.map((p) => `${fmt(p.output)} ${fmt(p.input * 100)}%`).join(", ")})`;
  }
}

/** Returns true when two easing strings describe the same curve (e.g. `ease` vs its cubic-bezier). */
export function cssEasingsEquivalent(a: string, b: string): boolean {
  const pa = tryParseCssEasing(a);
  const pb = tryParseCssEasing(b);
  if (!pa || !pb) return a.trim() === b.trim();
  if (pa.type === "cubic-bezier" && pb.type === "cubic-bezier") {
    return [pa.x1 - pb.x1, pa.y1 - pb.y1, pa.x2 - pb.x2, pa.y2 - pb.y2].every(
      (d) => Math.abs(d) < 1e-6,
    );
  }
  if (pa.type === "linear" && pb.type === "cubic-bezier") return isLinearBezier(pb);
  if (pb.type === "linear" && pa.type === "cubic-bezier") return isLinearBezier(pa);
  return formatCssEasing(pa) === formatCssEasing(pb);
}

function isLinearBezier(e: CubicBezierEasing): boolean {
  return Math.abs(e.x1 - e.y1) < 1e-6 && Math.abs(e.x2 - e.y2) < 1e-6;
}
