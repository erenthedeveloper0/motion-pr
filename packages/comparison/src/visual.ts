import { readFile } from "node:fs/promises";
import { join } from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { ASSET_FILE_PATTERN } from "@motionpr/core";
import type {
  CaptureBundle,
  ComparisonConfig,
  IgnoreRegion,
  VisualComparison,
} from "@motionpr/core";

export interface ImageSource {
  dir: string;
  bundle: CaptureBundle;
}

export class PngCache {
  readonly #cache = new Map<string, Promise<PNG | null>>();

  load(source: ImageSource, assetId: string): Promise<PNG | null> {
    const asset = source.bundle.assets[assetId];
    if (!asset || asset.format !== "png") return Promise.resolve(null);
    // Bundles passed through the API may be unvalidated; never follow paths out of assets/.
    if (!ASSET_FILE_PATTERN.test(asset.file)) return Promise.resolve(null);
    const path = join(source.dir, asset.file);
    let hit = this.#cache.get(path);
    if (!hit) {
      hit = readFile(path).then(
        (buf) => PNG.sync.read(buf),
        () => null,
      );
      this.#cache.set(path, hit);
    }
    return hit;
  }
}

/** Paints ignore regions identically in both images so they never count as differences. */
function blankRegions(
  data: Buffer,
  width: number,
  height: number,
  regions: readonly IgnoreRegion[],
  scale: number,
): void {
  for (const r of regions) {
    const x0 = Math.max(0, Math.floor(r.x * scale));
    const y0 = Math.max(0, Math.floor(r.y * scale));
    const x1 = Math.min(width, Math.ceil((r.x + r.width) * scale));
    const y1 = Math.min(height, Math.ceil((r.y + r.height) * scale));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * 4;
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 255;
      }
    }
  }
}

export interface DiffOutcome {
  mismatch: number;
  total: number;
  diffPng: Buffer | null;
}

/** Pixel diff of two PNGs. Returns null when sizes differ. */
export function diffImages(
  a: PNG,
  b: PNG,
  config: ComparisonConfig,
  options: { output: boolean; scale: number },
): DiffOutcome | null {
  if (a.width !== b.width || a.height !== b.height) return null;
  const { width, height } = a;
  const regions = config.visual.ignoreRegions;
  let da = a.data;
  let db = b.data;
  if (regions.length) {
    da = Buffer.from(a.data);
    db = Buffer.from(b.data);
    blankRegions(da, width, height, regions, options.scale);
    blankRegions(db, width, height, regions, options.scale);
  }
  const out = options.output ? new PNG({ width, height }) : null;
  const mismatch = pixelmatch(da, db, out ? out.data : null, width, height, {
    threshold: config.visual.pixelThreshold,
    includeAA: config.visual.includeAntialiasing,
    alpha: 0.18,
    diffColor: [236, 166, 122],
    diffColorAlt: [131, 156, 246],
    aaColor: [126, 74, 230],
  });
  return { mismatch, total: width * height, diffPng: out ? PNG.sync.write(out) : null };
}

export async function compareScreenshots(
  cache: PngCache,
  baseline: ImageSource,
  candidate: ImageSource,
  baselineAsset: string | null,
  candidateAsset: string | null,
  config: ComparisonConfig,
  scale: number,
): Promise<{ visual: VisualComparison; diffPng: Buffer | null }> {
  const base = {
    pixelThreshold: config.visual.pixelThreshold,
    maxDiffRatio: config.visual.maxDiffRatio,
    ignoredRegions: config.visual.ignoreRegions.length,
    diffAsset: null,
  };
  if (!config.visual.enabled) {
    return {
      visual: {
        ...base,
        status: "skipped",
        mismatchPixels: 0,
        totalPixels: 0,
        mismatchRatio: 0,
        reason: "Visual comparison disabled.",
      },
      diffPng: null,
    };
  }
  if (!baselineAsset || !candidateAsset) {
    return {
      visual: {
        ...base,
        status: "not-comparable",
        mismatchPixels: 0,
        totalPixels: 0,
        mismatchRatio: 0,
        reason: "Screenshot missing on one side.",
      },
      diffPng: null,
    };
  }
  if (baselineAsset === candidateAsset) {
    const a = baseline.bundle.assets[baselineAsset];
    const total = a ? a.width * a.height : 0;
    return {
      visual: {
        ...base,
        status: "identical",
        mismatchPixels: 0,
        totalPixels: total,
        mismatchRatio: 0,
      },
      diffPng: null,
    };
  }
  const [a, b] = await Promise.all([
    cache.load(baseline, baselineAsset),
    cache.load(candidate, candidateAsset),
  ]);
  if (!a || !b) {
    return {
      visual: {
        ...base,
        status: "not-comparable",
        mismatchPixels: 0,
        totalPixels: 0,
        mismatchRatio: 0,
        reason: "Screenshot file unreadable.",
      },
      diffPng: null,
    };
  }
  const diff = diffImages(a, b, config, { output: true, scale });
  if (!diff) {
    return {
      visual: {
        ...base,
        status: "not-comparable",
        mismatchPixels: 0,
        totalPixels: 0,
        mismatchRatio: 0,
        reason: `Screenshot sizes differ (${a.width}×${a.height} vs ${b.width}×${b.height}).`,
      },
      diffPng: null,
    };
  }
  const ratio = diff.mismatch / diff.total;
  const status =
    diff.mismatch === 0
      ? "identical"
      : ratio > config.visual.maxDiffRatio
        ? "changed"
        : "within-threshold";
  return {
    visual: {
      ...base,
      status,
      mismatchPixels: diff.mismatch,
      totalPixels: diff.total,
      mismatchRatio: Math.round(ratio * 1e6) / 1e6,
    },
    diffPng: diff.mismatch > 0 ? diff.diffPng : null,
  };
}

/** Pixel divergence between time-aligned filmstrip frames (PNG only). */
export async function frameDivergence(
  cache: PngCache,
  baseline: ImageSource,
  candidate: ImageSource,
  bFrames: readonly { time: number; asset: string }[],
  cFrames: readonly { time: number; asset: string }[],
  config: ComparisonConfig,
): Promise<{ time: number; ratio: number | null }[]> {
  if (
    !config.visual.enabled ||
    !config.visual.frameDivergence ||
    !bFrames.length ||
    !cFrames.length
  )
    return [];
  const nearest = (frames: readonly { time: number; asset: string }[], t: number) => {
    let best = frames[0]!;
    for (const f of frames) if (f.time <= t + 0.5 && f.time >= best.time) best = f;
    return best;
  };
  const times = [...new Set([...bFrames, ...cFrames].map((f) => f.time))].sort((x, y) => x - y);
  const memo = new Map<string, number | null>();
  const out: { time: number; ratio: number | null }[] = [];
  for (const t of times) {
    const fb = nearest(bFrames, t);
    const fc = nearest(cFrames, t);
    const key = `${fb.asset}|${fc.asset}`;
    let ratio = memo.get(key);
    if (ratio === undefined) {
      if (fb.asset === fc.asset) ratio = 0;
      else {
        const [a, b] = await Promise.all([
          cache.load(baseline, fb.asset),
          cache.load(candidate, fc.asset),
        ]);
        const diff = a && b ? diffImages(a, b, config, { output: false, scale: 1 }) : null;
        ratio = diff ? Math.round((diff.mismatch / diff.total) * 1e5) / 1e5 : null;
      }
      memo.set(key, ratio);
    }
    out.push({ time: t, ratio });
  }
  return out;
}
