import { copyFile, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ASSET_FILE_PATTERN,
  ASSET_ID_PATTERN,
  MOTIONPR_VERSION,
  REPORT_SCHEMA_VERSION,
  MotionprError,
  serializeJsonForHtml,
  type CaptureBundle,
  type ComparisonResult,
  type ReportData,
} from "@motionpr/core";

/** Placeholder the viewer template carries inside `<script id="motionpr-report-data">`. */
export const REPORT_DATA_PLACEHOLDER = "__MOTIONPR_REPORT_DATA__";
/**
 * The full element is matched so the placeholder text can never be confused with app code.
 * Whitespace inside the element is allowed: formatters wrap it onto separate lines.
 */
const DATA_ELEMENT =
  /<script id="motionpr-report-data" type="application\/json">\s*__MOTIONPR_REPORT_DATA__\s*<\/script>/;
export const REPORT_ASSETS_DIR = "assets";

export interface ReportSource<T> {
  dir: string;
  value: T;
}

export interface GenerateReportOptions {
  /** Directory to write index.html and assets/ into. Its previous assets/ folder is replaced. */
  outputDir: string;
  /** Contents of the built viewer template (single-file HTML). */
  template: string;
  candidate: ReportSource<CaptureBundle>;
  baseline?: ReportSource<CaptureBundle> | null;
  comparison?: ReportSource<ComparisonResult> | null;
  project?: string;
  notes?: string[];
}

export interface GeneratedReport {
  indexPath: string;
  assets: number;
  bytes: number;
}

async function copyAssets<T extends { assets: Record<string, { file: string }> }>(
  source: ReportSource<T>,
  outputDir: string,
  copied: Set<string>,
): Promise<T> {
  const assets: Record<string, { file: string }> = {};
  for (const [id, asset] of Object.entries(source.value.assets)) {
    // Never trust paths from capture data: they may come from an untrusted CI artifact.
    if (!ASSET_ID_PATTERN.test(id) || !ASSET_FILE_PATTERN.test(asset.file)) {
      throw new MotionprError(
        "REPORT_FAILED",
        `Refusing unsafe asset reference "${id}" → "${asset.file}".`,
        {
          hint: "The capture was modified or corrupted. Re-create it with `motionpr capture`.",
        },
      );
    }
    // Asset ids are content hashes, so identical frames from both captures are copied once.
    const target = `${REPORT_ASSETS_DIR}/${id}`;
    if (!copied.has(id)) {
      await copyFile(join(source.dir, asset.file), join(outputDir, target));
      copied.add(id);
    }
    assets[id] = { ...asset, file: target };
  }
  return { ...source.value, assets } as T;
}

/**
 * Copies every referenced screenshot into `<outputDir>/assets/` (replacing a previous assets/
 * folder) and returns the report data with asset paths rewritten relative to `outputDir`.
 */
export async function writeReportAssets(
  options: Omit<GenerateReportOptions, "template">,
): Promise<ReportData> {
  const { outputDir } = options;
  await mkdir(outputDir, { recursive: true });
  await rm(join(outputDir, REPORT_ASSETS_DIR), { recursive: true, force: true });
  await mkdir(join(outputDir, REPORT_ASSETS_DIR), { recursive: true });

  const copied = new Set<string>();
  const candidate = await copyAssets(options.candidate, outputDir, copied);
  const baseline = options.baseline ? await copyAssets(options.baseline, outputDir, copied) : null;
  const comparison = options.comparison
    ? await copyAssets(options.comparison, outputDir, copied)
    : null;
  return {
    kind: "motionpr-report",
    schemaVersion: REPORT_SCHEMA_VERSION,
    motionprVersion: MOTIONPR_VERSION,
    generatedAt: new Date().toISOString(),
    project: options.project ?? candidate.project.name,
    mode: baseline && comparison ? "comparison" : "capture",
    baseline,
    candidate,
    comparison,
    notes: options.notes ?? [],
  };
}

/**
 * Writes an offline, self-contained HTML report: the viewer application with the report data
 * embedded as inert JSON, plus referenced screenshots in `assets/`. No network access is needed
 * to open it, and report data is never executed as code.
 */
export async function generateReport(options: GenerateReportOptions): Promise<GeneratedReport> {
  const matches = options.template.match(new RegExp(DATA_ELEMENT.source, "g")) ?? [];
  if (matches.length !== 1) {
    throw new MotionprError(
      "REPORT_FAILED",
      "The report template is missing its data placeholder.",
      {
        hint: "Rebuild MotionPR (pnpm build) or reinstall the package.",
      },
    );
  }
  const data = await writeReportAssets(options);
  // Replace via a function so `$` sequences in the JSON are never interpreted as patterns.
  const html = options.template.replace(
    DATA_ELEMENT,
    () =>
      `<script id="motionpr-report-data" type="application/json">${serializeJsonForHtml(data)}</script>`,
  );
  const indexPath = join(options.outputDir, "index.html");
  await writeFile(indexPath, html);
  const assets = new Set([
    ...Object.keys(data.candidate.assets),
    ...Object.keys(data.baseline?.assets ?? {}),
    ...Object.keys(data.comparison?.assets ?? {}),
  ]);
  return { indexPath, assets: assets.size, bytes: (await stat(indexPath)).size };
}

export {
  REPORT_SUMMARY_FILE,
  readBrowserReportSummaries,
  writeBrowserIndex,
  writeBrowserReportSummary,
  type BrowserReportSummary,
} from "./browser-index.ts";
