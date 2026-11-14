/**
 * Evaluation of Anime.js v4 named eases (`"out(3)"`, `"inOutQuad"`, `"outElastic(1, .5)"` …).
 *
 * When the application passes Anime.js's own `eases` export to `createAnimeInstrumentation`,
 * MotionPR evaluates names with Anime.js's functions directly. Otherwise it uses this port of
 * the v4 parser (`easings/eases/parser.js`), which the test suite checks sample-for-sample
 * against the installed Anime.js. Only public behavior is mirrored; no Anime.js internals are read.
 */
export type EasingFunction = (t: number) => number;
type Parametric = (...args: (string | number | undefined)[]) => EasingFunction;
/** Shape of Anime.js's public `eases` export. */
export type EasesLike = Record<string, unknown>;

const MIN_VALUE = 1e-11;
const clamp = (v: number, min: number, max: number) => (v < min ? min : v > max ? max : v);
const easeInPower =
  (p: string | number = 1.68): EasingFunction =>
  (t) =>
    t ** +p;

const types: Record<string, (easeIn: EasingFunction) => EasingFunction> = {
  in: (easeIn) => (t: number) => easeIn(t),
  out: (easeIn) => (t: number) => 1 - easeIn(1 - t),
  inOut: (easeIn) => (t: number) => (t < 0.5 ? easeIn(t * 2) / 2 : 1 - easeIn(t * -2 + 2) / 2),
  outIn: (easeIn) => (t: number) =>
    t < 0.5 ? (1 - easeIn(1 - t * 2)) / 2 : (easeIn(t * 2 - 1) + 1) / 2,
};

const easeIns: Record<string, EasingFunction | Parametric> = {
  "": easeInPower as Parametric,
  Quad: easeInPower(2),
  Cubic: easeInPower(3),
  Quart: easeInPower(4),
  Quint: easeInPower(5),
  Sine: (t: number) => 1 - Math.cos((t * Math.PI) / 2),
  Circ: (t: number) => 1 - Math.sqrt(1 - t * t),
  Expo: (t: number) => (t ? 2 ** (10 * t - 10) : 0),
  Bounce: (t: number) => {
    let pow2: number;
    let b = 4;
    while (t < ((pow2 = 2 ** --b) - 1) / 11);
    return 1 / 4 ** (3 - b) - 7.5625 * ((pow2 * 3 - 2) / 22 - t) ** 2;
  },
  Back:
    (overshoot: string | number = 1.7) =>
    (t: number) =>
      (+overshoot + 1) * t * t * t - +overshoot * t * t,
  Elastic: (amplitude: string | number = 1, period: string | number = 0.3) => {
    const a = clamp(+amplitude, 1, 10);
    const p = clamp(+period, MIN_VALUE, 2);
    const s = (p / (Math.PI * 2)) * Math.asin(1 / a);
    const e = (Math.PI * 2) / p;
    return (t: number) =>
      t === 0 || t === 1 ? t : -a * 2 ** (-10 * (1 - t)) * Math.sin((1 - t - s) * e);
  },
};

const PARAMETRIC = new Set(["", "Back", "Elastic"]);

const builtIn: Record<string, EasingFunction | Parametric> = (() => {
  const list: Record<string, EasingFunction | Parametric> = {
    linear: (t: number) => t,
    none: (t: number) => t,
  };
  for (const type of Object.keys(types)) {
    for (const name of Object.keys(easeIns)) {
      const easeIn = easeIns[name]!;
      const wrap = types[type]!;
      list[type + name] = PARAMETRIC.has(name)
        ? (a?: string | number, b?: string | number) => wrap((easeIn as Parametric)(a, b))
        : wrap(easeIn as EasingFunction);
    }
  }
  return list;
})();

/**
 * Resolves an Anime.js ease name to a function, or null when the name is unknown. Mirrors
 * Anime.js: names without parentheses that take parameters are called with their defaults.
 */
export function resolveEaseName(name: string, eases?: EasesLike): EasingFunction | null {
  const table = (eases ?? builtIn) as Record<string, unknown>;
  const text = name.trim();
  if (text === "linear" || text === "none") return (t) => t;
  const paren = text.indexOf("(");
  if (paren === -1) {
    const entry = table[text];
    if (typeof entry !== "function") return null;
    const takesParams = text in types || text.includes("Back") || text.includes("Elastic");
    return takesParams ? (entry as Parametric)() : (entry as EasingFunction);
  }
  if (!text.endsWith(")")) return null;
  const entry = table[text.slice(0, paren)];
  if (typeof entry !== "function") return null;
  const args = text
    .slice(paren + 1, -1)
    .split(",")
    .map((a) => a.trim());
  return (entry as Parametric)(...args);
}

export const SAMPLE_COUNT = 65;

/** Samples an easing function at 65 evenly spaced inputs; null if it throws or is not finite. */
export function sampleEase(fn: EasingFunction): number[] | null {
  const out: number[] = [];
  try {
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const v = fn(i / (SAMPLE_COUNT - 1));
      if (typeof v !== "number" || !Number.isFinite(v)) return null;
      out.push(Math.round(v * 1e6) / 1e6);
    }
  } catch {
    return null;
  }
  return out;
}
