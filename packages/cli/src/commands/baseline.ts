import { join } from "node:path";
import * as p from "@clack/prompts";
import {
  CAPTURE_FILE,
  MotionprError,
  copyCaptureDir,
  pathExists,
  readCaptureBundle,
  resolveCaptureRef,
  resolvePaths,
  type CaptureBundle,
} from "@motionpr/core";
import { loadConfig } from "../config/load.ts";
import { banner, cwdOf, makeTerminal, printJson, type GlobalOptions } from "./shared.ts";

export interface BaselineOptions extends GlobalOptions {
  from?: string;
  yes?: boolean;
  allowFailed?: boolean;
}

function describe(bundle: CaptureBundle): string {
  const checkpoints = bundle.scenarios.reduce((n, s) => n + s.checkpoints.length, 0);
  const animations = bundle.scenarios.reduce(
    (n, s) => n + s.checkpoints.reduce((m, c) => m + c.animations.length, 0),
    0,
  );
  return `${bundle.id} · ${bundle.scenarios.length} scenarios · ${checkpoints} checkpoints · ${animations} animations · ${bundle.environment.platform} · Chromium ${bundle.environment.browser.version}`;
}

/** `motionpr baseline accept`: explicitly approve a capture as the new baseline. */
export async function baselineAcceptCommand(options: BaselineOptions): Promise<number> {
  const t = makeTerminal(options);
  banner(t, "baseline accept");
  const cwd = cwdOf(options);
  const loaded = await loadConfig({
    cwd,
    ...(options.config ? { config: options.config } : {}),
    ...(options.env ? { env: options.env } : {}),
  }).catch((error: unknown) => {
    if (error instanceof MotionprError && error.code === "CONFIG_NOT_FOUND" && options.from) {
      return {
        paths: resolvePaths(
          {
            output: {
              directory: ".motionpr",
              baseline: "baseline",
              captures: "captures",
              report: "report",
              keep: 5,
            },
          },
          cwd,
        ),
      };
    }
    throw error;
  });
  const { paths } = loaded;
  const sourceDir = await resolveCaptureRef(options.from ?? "latest", paths, cwd);
  if (sourceDir === paths.baseline)
    throw new MotionprError("BASELINE_EXISTS", "That capture already is the baseline.");
  const source = await readCaptureBundle(sourceDir);
  const failed = source.scenarios.filter((s) => s.status === "failed");
  if (failed.length && !options.allowFailed) {
    throw new MotionprError(
      "CAPTURE_FAILED",
      `Capture ${source.id} has ${failed.length} failed scenario(s): ${failed.map((s) => s.key).join(", ")}.`,
      {
        hint: "Fix the scenarios and capture again, or pass --allow-failed to approve it anyway.",
      },
    );
  }
  const current = (await pathExists(join(paths.baseline, CAPTURE_FILE)))
    ? await readCaptureBundle(paths.baseline).catch(() => null)
    : null;

  t.write(`  ${t.c.dim("New baseline")}   ${describe(source)}`);
  t.write(
    `  ${t.c.dim("Replaces")}       ${current ? describe(current) : t.c.dim("(no baseline yet)")}`,
  );
  t.write(`  ${t.c.dim("Location")}       ${t.tech(paths.baseline)}`);
  t.write();

  if (current && !options.yes) {
    if (!t.interactive) {
      throw new MotionprError(
        "BASELINE_EXISTS",
        "Refusing to replace the approved baseline without confirmation.",
        {
          hint: "Re-run with --yes to confirm (this is deliberate: baselines are never overwritten silently).",
        },
      );
    }
    const ok = await p.confirm({
      message: "Replace the approved baseline with this capture?",
      initialValue: false,
    });
    if (p.isCancel(ok) || !ok) {
      t.info("Baseline unchanged.");
      return 0;
    }
  }
  await copyCaptureDir(sourceDir, paths.baseline);
  if (options.json)
    printJson({ baseline: paths.baseline, accepted: source.id, replaced: current?.id ?? null });
  t.success(`Baseline set to ${source.id}`);
  t.hint("Commit the baseline directory so CI compares against it:");
  t.next([
    `git add ${paths.baseline.startsWith(cwd) ? paths.baseline.slice(cwd.length + 1) : paths.baseline}`,
    'git commit -m "Update MotionPR baseline"',
  ]);
  return 0;
}

export async function baselineStatusCommand(options: GlobalOptions): Promise<number> {
  const t = makeTerminal(options);
  banner(t, "baseline status");
  const { paths } = await loadConfig({
    cwd: cwdOf(options),
    ...(options.config ? { config: options.config } : {}),
  });
  if (!(await pathExists(join(paths.baseline, CAPTURE_FILE)))) {
    if (options.json) printJson({ baseline: null });
    t.warn("No approved baseline.");
    t.next(["npx motionpr run", "npx motionpr baseline accept"]);
    return 0;
  }
  const bundle = await readCaptureBundle(paths.baseline);
  if (options.json) {
    printJson({
      baseline: {
        dir: paths.baseline,
        id: bundle.id,
        createdAt: bundle.createdAt,
        scenarios: bundle.scenarios.map((s) => s.key),
      },
    });
    return 0;
  }
  t.write(`  ${t.c.dim("Baseline")}  ${describe(bundle)}`);
  t.write(`  ${t.c.dim("Created")}   ${bundle.createdAt}`);
  t.write(`  ${t.c.dim("Location")}  ${t.tech(paths.baseline)}`);
  return 0;
}
