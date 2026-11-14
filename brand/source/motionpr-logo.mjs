/**
 * MotionPR logo geometry — the single source of truth for the mark and wordmark.
 * Zero dependencies. Every SVG in /brand is generated from this file.
 *
 * The mark is the exclusive-or (XOR) of a circle and the same circle after it moved:
 * exactly what a pixel diff of a moving element looks like. Two circles of radius r,
 * offset by 5/8 r along 45 degrees. Only the parts that changed remain.
 */

/** Circle offset as a fraction of the radius. 0 = no motion (the mark disappears). */
export const MARK_OFFSET = 0.625;

/** Brand palette (sampled from the original MotionPR brand board). */
export const COLORS = {
  ink: '#070709',
  paper: '#F3F1FA',
  graphite: '#111116',
  blue: '#839CF6',
  violet: '#7E4AE6',
  pink: '#E5A9C7',
  peach: '#ECA67A',
};

/** Gradient stops, applied along the direction of motion (lower-left to upper-right). */
export const GRADIENT_STOPS = [
  [0, COLORS.blue],
  [0.38, COLORS.violet],
  [0.72, COLORS.pink],
  [1, COLORS.peach],
];

const round = (n) => +n.toFixed(3);

/**
 * Geometry of the mark fitted tightly into the square (x, y, size).
 * offset can be animated from 0 to MARK_OFFSET: the crescents grow out of nothing.
 * Returns SVG path data for each crescent and both together (nonzero fill, no fill-rule needed).
 */
export function markGeometry({ x = 0, y = 0, size = 100, offset = MARK_OFFSET } = {}) {
  const k = Math.SQRT1_2;
  const r = size / (2 + MARK_OFFSET * k); // radius is fixed by the final pose so the mark never resizes while animating
  const d = Math.max(offset, 1e-4) * r;
  const cx = x + size / 2;
  const cy = y + size / 2;
  const before = { cx: cx - (d / 2) * k, cy: cy + (d / 2) * k };
  const after = { cx: cx + (d / 2) * k, cy: cy - (d / 2) * k };
  const h = Math.sqrt(r * r - (d / 2) ** 2);
  const tipA = [cx - h * k, cy - h * k];
  const tipB = [cx + h * k, cy + h * k];
  const arc = (to, large, sweep) => `A${round(r)} ${round(r)} 0 ${large} ${sweep} ${round(to[0])} ${round(to[1])}`;
  const start = `M${round(tipA[0])} ${round(tipA[1])}`;
  const beforePath = `${start}${arc(tipB, 1, 0)}${arc(tipA, 0, 1)}Z`;
  const afterPath = `${start}${arc(tipB, 1, 1)}${arc(tipA, 0, 0)}Z`;
  return { r, distance: d, before, after, beforePath, afterPath, path: beforePath + afterPath };
}

/**
 * Wordmark "motionpr", custom geometric construction (x-height 100, stem 16, rounds 16.8,
 * t-top cut at 45 degrees to match the direction of motion). Baseline at y = 0.
 * Bounds: x 0..768, y -136 (t and i-dot) .. 40 (p descender).
 */
export const WORDMARK = {
  path: 'M0,-100h16l0,7.86c6.92,-5.33 15.59,-8.5 25,-8.5c13.53,0 25.53,6.56 33,16.66c7.47,-10.11 19.47,-16.66 33,-16.66c22.64,0 41,18.36 41,41v59.64h-16v-59.64c0,-13.81 -11.19,-25 -25,-25c-13.81,0 -25,11.19 -25,25v59.64h-16v-59.64c0,-13.81 -11.19,-25 -25,-25c-13.81,0 -25,11.19 -25,25v59.64h-16zM162.2,-50c0,-28.5 23.1,-51.6 51.6,-51.6c28.5,0 51.6,23.1 51.6,51.6c0,28.5 -23.1,51.6 -51.6,51.6c-28.5,0 -51.6,-23.1 -51.6,-51.6zM179,-50c0,19.22 15.58,34.8 34.8,34.8c19.22,0 34.8,-15.58 34.8,-34.8c0,-19.22 -15.58,-34.8 -34.8,-34.8c-19.22,0 -34.8,15.58 -34.8,34.8zM296.1,-120l16,-16v36h23v14.72l-23,0v85.28h-16v-85.28h-19v-14.72l19,0zM347.1,-100h16v100h-16zM345.66,-126.56c0,-5.21 4.23,-9.44 9.44,-9.44c5.21,0 9.44,4.23 9.44,9.44c0,5.21 -4.23,9.44 -9.44,9.44c-5.21,0 -9.44,-4.23 -9.44,-9.44zM377.3,-50c0,-28.5 23.1,-51.6 51.6,-51.6c28.5,0 51.6,23.1 51.6,51.6c0,28.5 -23.1,51.6 -51.6,51.6c-28.5,0 -51.6,-23.1 -51.6,-51.6zM394.1,-50c0,19.22 15.58,34.8 34.8,34.8c19.22,0 34.8,-15.58 34.8,-34.8c0,-19.22 -15.58,-34.8 -34.8,-34.8c-19.22,0 -34.8,15.58 -34.8,34.8zM494.7,-100h16l0,10.49c8.05,-6.94 18.54,-11.13 30,-11.13c25.41,0 46,20.59 46,46v54.64h-16v-54.64c0,-16.57 -13.43,-30 -30,-30c-16.57,0 -30,13.43 -30,30l0,54.64h-16zM604.7,-100h16v12.65c9.26,-8.83 21.8,-14.25 35.6,-14.25c28.5,0 51.6,23.1 51.6,51.6c0,28.5 -23.1,51.6 -51.6,51.6c-13.8,0 -26.34,-5.42 -35.6,-14.25v52.65h-16zM621.5,-50c0,19.22 15.58,34.8 34.8,34.8c19.22,0 34.8,-15.58 34.8,-34.8c0,-19.22 -15.58,-34.8 -34.8,-34.8c-19.22,0 -34.8,15.58 -34.8,34.8zM722.1,-100h16l0,6.38c8.63,-6.13 19.47,-8.4 29.9,-6.19l-3.33,15.65c-6.49,-1.38 -13.26,0.24 -18.42,4.42c-5.16,4.18 -8.15,10.46 -8.16,17.1l0,62.64h-16z',
  width: 768,
  top: -136,
  bottom: 40,
  xHeight: 100,
};

/** Horizontal lockup: mark (150) centred on the x-height, gap 0.45 x mark, then the wordmark. */
export const LOCKUP = {
  markSize: 150,
  gap: 67.5,
  width: 150 + 67.5 + 768,
  height: 176,
};

/** Translate path data whose subpaths start with absolute M and continue with relative commands. */
export function translatePath(path, dx, dy) {
  return path.replace(/M(-?[\d.]+),(-?[\d.]+)/g, (_, px, py) => `M${round(+px + dx)},${round(+py + dy)}`);
}

/** Lockup geometry with the top-left corner at (0, 0). */
export function lockupGeometry() {
  const baseline = -WORDMARK.top;
  const mark = markGeometry({ x: 0, y: baseline - WORDMARK.xHeight / 2 - LOCKUP.markSize / 2, size: LOCKUP.markSize });
  const wordmark = translatePath(WORDMARK.path, LOCKUP.markSize + LOCKUP.gap, baseline);
  return { mark, wordmark, width: LOCKUP.width, height: LOCKUP.height };
}
