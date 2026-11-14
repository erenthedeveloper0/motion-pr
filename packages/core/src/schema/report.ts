import type { CaptureBundle } from "./capture.ts";
import type { ComparisonResult } from "./comparison.ts";

export const REPORT_SCHEMA_VERSION = 1;

/**
 * Data embedded in a generated HTML report. Asset `file` paths inside the bundles and the
 * comparison are rewritten to be relative to the report's `index.html`.
 */
export interface ReportData {
  kind: "motionpr-report";
  schemaVersion: typeof REPORT_SCHEMA_VERSION;
  motionprVersion: string;
  generatedAt: string;
  project: string;
  /** `comparison` when a baseline was available, `capture` for a single-capture inspection report. */
  mode: "comparison" | "capture";
  baseline: CaptureBundle | null;
  candidate: CaptureBundle;
  comparison: ComparisonResult | null;
  /** Free-form notes shown in the report header, e.g. "Bundled demonstration fixtures". */
  notes: string[];
}
