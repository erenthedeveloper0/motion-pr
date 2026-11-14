import { randomBytes } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  access,
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { MotionprError } from "./errors.ts";
import { contentId } from "./hash.ts";
import type { ResolvedConfig } from "./config/schema.ts";
import type { Asset, CaptureBundle } from "./schema/capture.ts";
import type { ComparisonResult } from "./schema/comparison.ts";
import { parseCaptureBundle, parseComparisonResult } from "./schema/parse.ts";

export const CAPTURE_FILE = "capture.json";
export const COMPARISON_FILE = "comparison.json";
export const ASSETS_DIR = "assets";
export const LATEST_FILE = "LATEST";

export interface MotionprPaths {
  /** Directory containing the config file (or the working directory). */
  root: string;
  data: string;
  baseline: string;
  captures: string;
  report: string;
}

export function resolvePaths(config: Pick<ResolvedConfig, "output">, root: string): MotionprPaths {
  const data = resolve(root, config.output.directory);
  return {
    root,
    data,
    baseline: resolve(data, config.output.baseline),
    captures: resolve(data, config.output.captures),
    report: resolve(data, config.output.report),
  };
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/** Writes a file atomically (temp file + rename) so readers never observe partial JSON. */
export async function writeFileAtomic(path: string, data: string | Uint8Array): Promise<void> {
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, path);
}

/** Capture ids sort chronologically: `20261113-142233-a1b2`. */
export function generateCaptureId(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
  return `${stamp}-${randomBytes(2).toString("hex")}`;
}

/**
 * Content-addressed screenshot storage. Identical images (e.g. frames where nothing moves)
 * are written once and referenced by id.
 */
export class AssetStore {
  readonly entries = new Map<string, Asset>();
  readonly captureDir: string;
  #dirReady: Promise<string | undefined> | undefined;

  constructor(captureDir: string) {
    this.captureDir = captureDir;
  }

  async put(
    data: Uint8Array,
    format: Asset["format"],
    size: { width: number; height: number },
  ): Promise<string> {
    const id = `${contentId(data)}.${format === "png" ? "png" : "jpg"}`;
    if (this.entries.has(id)) return id;
    this.#dirReady ??= mkdir(join(this.captureDir, ASSETS_DIR), { recursive: true });
    await this.#dirReady;
    const file = `${ASSETS_DIR}/${id}`;
    try {
      await writeFile(join(this.captureDir, file), data, { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    this.entries.set(id, {
      file,
      format,
      width: size.width,
      height: size.height,
      bytes: data.byteLength,
    });
    return id;
  }

  toRecord(): Record<string, Asset> {
    return Object.fromEntries([...this.entries.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }
}

export async function writeCaptureBundle(dir: string, bundle: CaptureBundle): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFileAtomic(join(dir, CAPTURE_FILE), `${JSON.stringify(bundle, null, 2)}\n`);
}

/** Reads and validates `capture.json` from a capture directory. */
export async function readCaptureBundle(dir: string): Promise<CaptureBundle> {
  const file = join(dir, CAPTURE_FILE);
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    throw new MotionprError("CAPTURE_NOT_FOUND", `No capture found at ${dir}.`, {
      hint: "Run `motionpr capture` first, or pass the path of a directory containing capture.json.",
    });
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new MotionprError("CAPTURE_NOT_FOUND", `${file} is not valid JSON.`, { cause: error });
  }
  return parseCaptureBundle(json, file);
}

export async function writeComparisonResult(dir: string, result: ComparisonResult): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFileAtomic(join(dir, COMPARISON_FILE), `${JSON.stringify(result, null, 2)}\n`);
}

export async function readComparisonResult(dir: string): Promise<ComparisonResult> {
  const file = join(dir, COMPARISON_FILE);
  return parseComparisonResult(JSON.parse(await readFile(file, "utf8")), file);
}

export interface CaptureListing {
  id: string;
  dir: string;
}

/** Lists capture directories (those containing capture.json), newest first. */
export async function listCaptures(capturesDir: string): Promise<CaptureListing[]> {
  let names: string[];
  try {
    names = await readdir(capturesDir);
  } catch {
    return [];
  }
  const out: CaptureListing[] = [];
  for (const name of names) {
    const dir = join(capturesDir, name);
    if (await pathExists(join(dir, CAPTURE_FILE))) out.push({ id: name, dir });
  }
  return out.sort((a, b) => b.id.localeCompare(a.id));
}

export async function setLatestCapture(capturesDir: string, id: string): Promise<void> {
  await mkdir(capturesDir, { recursive: true });
  await writeFileAtomic(join(capturesDir, LATEST_FILE), `${id}\n`);
}

export async function latestCaptureDir(capturesDir: string): Promise<string | undefined> {
  try {
    const id = (await readFile(join(capturesDir, LATEST_FILE), "utf8")).trim();
    if (id && (await pathExists(join(capturesDir, id, CAPTURE_FILE)))) return join(capturesDir, id);
  } catch {
    // fall through to directory listing
  }
  return (await listCaptures(capturesDir))[0]?.dir;
}

/**
 * Resolves a user-supplied capture reference: `latest`, a capture id inside the captures
 * directory, `baseline`, or a path (absolute or relative to `cwd`) to a capture directory.
 */
export async function resolveCaptureRef(
  ref: string,
  paths: MotionprPaths,
  cwd = process.cwd(),
): Promise<string> {
  if (ref === "latest") {
    const dir = await latestCaptureDir(paths.captures);
    if (!dir) {
      throw new MotionprError("CAPTURE_NOT_FOUND", "No captures found.", {
        hint: "Run `motionpr capture` first.",
      });
    }
    return dir;
  }
  if (ref === "baseline") return paths.baseline;
  const byId = join(paths.captures, ref);
  if (!isAbsolute(ref) && (await pathExists(join(byId, CAPTURE_FILE)))) return byId;
  const asPath = resolve(cwd, ref);
  if (await pathExists(join(asPath, CAPTURE_FILE))) return asPath;
  if (asPath.endsWith(CAPTURE_FILE) && (await pathExists(asPath))) return resolve(asPath, "..");
  throw new MotionprError("CAPTURE_NOT_FOUND", `Cannot find a capture "${ref}".`, {
    hint: "Use `latest`, `baseline`, a capture id from .motionpr/captures, or a directory containing capture.json.",
  });
}

/** Deletes all but the newest `keep` captures. Never touches the baseline. */
export async function pruneCaptures(capturesDir: string, keep: number): Promise<string[]> {
  const all = await listCaptures(capturesDir);
  const removed: string[] = [];
  for (const entry of all.slice(keep)) {
    await rm(entry.dir, { recursive: true, force: true });
    removed.push(entry.id);
  }
  return removed;
}

/** Copies a capture directory (bundle + assets) to `dest`, replacing `dest` atomically where possible. */
export async function copyCaptureDir(src: string, dest: string): Promise<void> {
  const staging = `${dest}.staging-${randomBytes(3).toString("hex")}`;
  await cp(src, staging, { recursive: true, errorOnExist: false });
  const backup = `${dest}.previous-${randomBytes(3).toString("hex")}`;
  const hadDest = await pathExists(dest);
  if (hadDest) await rename(dest, backup);
  try {
    await rename(staging, dest);
  } catch (error) {
    if (hadDest) await rename(backup, dest);
    throw error;
  }
  if (hadDest) await rm(backup, { recursive: true, force: true });
}

export async function directorySize(dir: string): Promise<number> {
  let total = 0;
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return 0;
  }
  for (const name of names) {
    const p = join(dir, name);
    const s = await stat(p);
    total += s.isDirectory() ? await directorySize(p) : s.size;
  }
  return total;
}
