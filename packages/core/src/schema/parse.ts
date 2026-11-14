import type { z } from "zod";
import { SchemaError, formatIssuePath } from "../errors.ts";
import { CAPTURE_SCHEMA_VERSION, captureBundleSchema, type CaptureBundle } from "./capture.ts";
import {
  COMPARISON_SCHEMA_VERSION,
  comparisonResultSchema,
  type ComparisonResult,
} from "./comparison.ts";

/**
 * Migration boundary. Each entry upgrades a document from version N to N + 1. When the format
 * changes, add `N: (doc) => upgradedDoc` here and bump the schema version.
 */
type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

const DRIVER_BY_TYPE: Record<string, string> = {
  "css-animation": "css",
  "css-transition": "css",
  "web-animation": "waapi",
};

function arrayOf(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

/**
 * v1 → v2: animation records gain `driver`, `provenance` and `parent`; checkpoints gain
 * `timelines`, `scrollMotion` and `correlations`; scenarios gain `adapters`. v1 captures contain no
 * scroll or timeline data, so the new collections start empty and nothing is invented.
 */
function captureV1toV2(doc: Record<string, unknown>): Record<string, unknown> {
  return {
    ...doc,
    schemaVersion: 2,
    scenarios: arrayOf(doc.scenarios).map((scenario) => ({
      ...scenario,
      adapters: [],
      checkpoints: arrayOf(scenario.checkpoints).map((checkpoint) => ({
        ...checkpoint,
        timelines: [],
        scrollMotion: [],
        correlations: [],
        animations: arrayOf(checkpoint.animations).map((animation) => ({
          ...animation,
          driver: DRIVER_BY_TYPE[String(animation.type)] ?? "javascript",
          provenance: {},
          parent: null,
          progressTrace: [],
        })),
      })),
    })),
  };
}

export const CAPTURE_MIGRATIONS: Readonly<Record<number, Migration>> = { 1: captureV1toV2 };
/** v1 → v2: checkpoint comparisons gain `scroll` and `timelines` (empty for v1 results). */
function comparisonV1toV2(doc: Record<string, unknown>): Record<string, unknown> {
  return {
    ...doc,
    schemaVersion: 2,
    scenarios: arrayOf(doc.scenarios).map((scenario) => ({
      ...scenario,
      checkpoints: arrayOf(scenario.checkpoints).map((checkpoint) => ({
        ...checkpoint,
        scroll: [],
        timelines: [],
      })),
    })),
  };
}

export const COMPARISON_MIGRATIONS: Readonly<Record<number, Migration>> = { 1: comparisonV1toV2 };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function upgrade(
  input: unknown,
  kind: string,
  current: number,
  migrations: Readonly<Record<number, Migration>>,
  source: string | undefined,
): Record<string, unknown> {
  if (!isRecord(input) || input.kind !== kind) {
    throw new SchemaError("SCHEMA_INVALID", `${source ?? "Input"} is not a ${kind} document.`, {
      source,
    });
  }
  const version = input.schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new SchemaError("SCHEMA_INVALID", `${source ?? "Input"} has no valid schemaVersion.`, {
      source,
    });
  }
  if (version > current) {
    throw new SchemaError(
      "SCHEMA_UNSUPPORTED_VERSION",
      `${source ?? "Input"} uses ${kind} schema v${version}, but this MotionPR understands up to v${current}.`,
      { source, hint: "Upgrade MotionPR, or re-create the file with the installed version." },
    );
  }
  let doc = input;
  for (let v = version; v < current; v++) {
    const migrate = migrations[v];
    if (!migrate) {
      throw new SchemaError(
        "SCHEMA_UNSUPPORTED_VERSION",
        `No migration from ${kind} schema v${v} to v${v + 1}.`,
        {
          source,
        },
      );
    }
    doc = migrate(doc);
  }
  return doc;
}

function validate<T>(
  schema: z.ZodType<T>,
  doc: unknown,
  source: string | undefined,
  label: string,
): T {
  const result = schema.safeParse(doc);
  if (result.success) return result.data;
  const issues = result.error.issues.map((issue) => ({
    path: formatIssuePath(issue.path),
    message: issue.message,
  }));
  const preview = issues
    .slice(0, 5)
    .map((i) => `  - ${i.path}: ${i.message}`)
    .join("\n");
  throw new SchemaError("SCHEMA_INVALID", `${source ?? label} failed validation:\n${preview}`, {
    source,
    issues,
  });
}

/** Validates (and migrates if necessary) an untrusted capture bundle. */
export function parseCaptureBundle(input: unknown, source?: string): CaptureBundle {
  const doc = upgrade(
    input,
    "motionpr-capture",
    CAPTURE_SCHEMA_VERSION,
    CAPTURE_MIGRATIONS,
    source,
  );
  return validate(captureBundleSchema, doc, source, "Capture bundle");
}

/** Validates (and migrates if necessary) an untrusted comparison result. */
export function parseComparisonResult(input: unknown, source?: string): ComparisonResult {
  const doc = upgrade(
    input,
    "motionpr-comparison",
    COMPARISON_SCHEMA_VERSION,
    COMPARISON_MIGRATIONS,
    source,
  );
  return validate(comparisonResultSchema, doc, source, "Comparison result");
}
