/**
 * Parsing helpers for computed CSS values captured from the browser.
 * The browser serializes computed transforms as `none`, `matrix(...)` or `matrix3d(...)`,
 * colors mostly as `rgb()`/`rgba()`, and lengths in px.
 */

export interface DecomposedTransform {
  translateX: number;
  translateY: number;
  translateZ: number;
  scaleX: number;
  scaleY: number;
  /** Rotation around Z in degrees. */
  rotate: number;
  /** Skew along X in degrees. */
  skewX: number;
  /** True when the source was a non-flat matrix3d (only the 2D part was decomposed). */
  is3d: boolean;
}

export const IDENTITY_TRANSFORM: Readonly<DecomposedTransform> = Object.freeze({
  translateX: 0,
  translateY: 0,
  translateZ: 0,
  scaleX: 1,
  scaleY: 1,
  rotate: 0,
  skewX: 0,
  is3d: false,
});

const r4 = (n: number) => {
  const v = Math.round(n * 1e4) / 1e4;
  return Object.is(v, -0) ? 0 : v;
};

/** Parses `none`, `matrix(a, b, c, d, e, f)` or `matrix3d(...)` into its numeric components. */
export function parseTransformMatrix(value: string): number[] | null {
  const v = value.trim();
  if (v === "none" || v === "") return [1, 0, 0, 1, 0, 0];
  const m = /^(matrix3d|matrix)\(([^)]*)\)$/.exec(v);
  if (!m) return null;
  const nums = m[2]!.split(",").map((s) => Number(s.trim()));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  if (m[1] === "matrix" && nums.length === 6) return nums;
  if (m[1] === "matrix3d" && nums.length === 16) return nums;
  return null;
}

/**
 * Decomposes a computed transform into translate/scale/rotate/skew using the standard
 * 2D unmatrix algorithm (as in the CSS Transforms spec). For matrix3d values, translateZ is
 * read directly and the remaining components come from the 2D projection.
 */
export function decomposeTransform(value: string): DecomposedTransform | null {
  const m = parseTransformMatrix(value);
  if (!m) return null;
  let a: number, b: number, c: number, d: number, e: number, f: number;
  let tz = 0;
  let is3d = false;
  if (m.length === 16) {
    [a, b, , , c, d, , , , , , , e, f, tz] = m as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    const flat =
      [m[2], m[3], m[6], m[7], m[8], m[9], m[11]].every((x) => x === 0) &&
      m[10] === 1 &&
      m[15] === 1;
    is3d = !flat || tz !== 0;
  } else {
    [a, b, c, d, e, f] = m as [number, number, number, number, number, number];
  }

  let scaleX = Math.hypot(a, b);
  if (scaleX !== 0) {
    a /= scaleX;
    b /= scaleX;
  }
  let skew = a * c + b * d;
  c -= a * skew;
  d -= b * skew;
  const scaleY = Math.hypot(c, d);
  if (scaleY !== 0) {
    c /= scaleY;
    d /= scaleY;
    skew /= scaleY;
  }
  if (a * d < b * c) {
    a = -a;
    b = -b;
    skew = -skew;
    scaleX = -scaleX;
  }
  return {
    translateX: r4(e),
    translateY: r4(f),
    translateZ: r4(tz),
    scaleX: r4(scaleX),
    scaleY: r4(scaleY),
    rotate: r4((Math.atan2(b, a) * 180) / Math.PI),
    skewX: r4((Math.atan(skew) * 180) / Math.PI),
    is3d,
  };
}

export interface CssNumeric {
  value: number;
  unit: string;
}

/** Parses a single numeric CSS value such as `12px`, `0.5`, `45deg` or `-3.2%`. */
export function parseCssNumeric(value: string): CssNumeric | null {
  const m = /^(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)([a-z%]*)$/i.exec(value.trim());
  if (!m) return null;
  return { value: Number(m[1]), unit: m[2]!.toLowerCase() };
}

export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Parses `rgb()` / `rgba()` (legacy comma and modern space syntax) and `transparent`. */
export function parseCssColor(value: string): RgbaColor | null {
  const v = value.trim().toLowerCase();
  if (v === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const m = /^rgba?\(([^)]*)\)$/.exec(v);
  if (!m) return null;
  const parts = m[1]!
    .replace(/\s*\/\s*/, " ")
    .split(/[\s,]+/)
    .filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  const channel = (s: string, max: number) =>
    s.endsWith("%") ? (Number(s.slice(0, -1)) / 100) * max : Number(s);
  const [r, g, b] = parts.slice(0, 3).map((p) => channel(p, 255)) as [number, number, number];
  const a = parts[3] === undefined ? 1 : channel(parts[3], 1);
  if (![r, g, b, a].every(Number.isFinite)) return null;
  return { r, g, b, a };
}

/** Euclidean RGBA distance normalized to [0, 1]. */
export function colorDistance(x: RgbaColor, y: RgbaColor): number {
  const d = Math.hypot((x.r - y.r) / 255, (x.g - y.g) / 255, (x.b - y.b) / 255, x.a - y.a);
  return r4(d / 2);
}

/** Converts a camelCase property name returned by getKeyframes() to CSS kebab-case. */
export function toKebabCase(property: string): string {
  if (property.startsWith("--")) return property;
  if (property === "cssFloat") return "float";
  if (property === "cssOffset") return "offset";
  return property.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
}
