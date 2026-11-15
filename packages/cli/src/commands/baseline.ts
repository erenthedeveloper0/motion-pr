import { join } from "node:path";
import * as p from "@clack/prompts";
import {
  BROWSER_LABELS,
  BROWSER_NAMES,
  CAPTURE_FILE,
  MotionprError,
  browserLabel,
  browserPaths,
  captureBrowser,
  copyCaptureDir,
  isBrowserName,
  legacyBaseline,
  migrateLegacyBaseline,
  pathExists,
  readCaptureBundle,
  resolveBaselineDir,
  resolveCaptureRef,
  resolvePaths,
  type BrowserName,
  type CaptureBundle,
  type MotionprPaths,
} from "@motionpr/core";
import { loadConfig } from "../config/load.ts";
import type { Terminal } from "../output/terminal.ts";
import {
  banner,
  cwdOf,
  makeTerminal,
  printJson,
  selectBrowsers,
  type GlobalOptions,
} from "./shared.ts";

export interface BaselineOptions extends GlobalOptions {
  from?: string;
  yes?: boolean;
  allowFailed?: boolean;
  /** `--browser`: whose latest capture to approve (repeatable, comma lists, `all`). */
  browser?: string[];
}

function describe(bundle: CaptureBundle): string {
  const checkpoints = bundle.scenarios.reduce((n, s) => n + s.checkpoints.length, 0);
  const animations = bundle.scenarios.reduce(
    (n, s) => n + s.checkpoints.reduce((m, c) => m + c.animations.length, 0),
    0,
  );
  return `${bundle.id} · ${bundle.scenarios.length} scenarios · ${checkpoints} checkpoints · ${animations} animations · ${bundle.environment.platform} · ${browserLabel(captureBrowser(bundle))} ${bundle.environment.browser.version}`;
}

const DEFAULT_PATHS = (cwd: string) =>
  resolvePaths(
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
  );

async function pathsFor(
  options: BaselineOptions,
  allowDefaults: boolean,
): Promise<{ paths: MotionprPaths; defaultBrowser: BrowserName }> {
  const cwd = cwdOf(options);
  try {
    const loaded = await loadConfig({
      cwd,
      ...(options.config ? { config: options.config } : {}),
      ...(options.env ? { env: options.env } : {}),
    });
    return { paths: loaded.paths, defaultBrowser: loaded.config.browser.name };
  } catch (error) {
    if (allowDefaults && error instanceof MotionprError && error.code === "CONFIG_NOT_FOUND")
      return { paths: DEFAULT_PATHS(cwd), defaultBrowser: "chromium" };
    throw error;
  }
}

function rel(cwd: string, path: string): string {
  return path.startsWith(`${cwd}/`) || path.startsWith(`${cwd}\\`)
    ? path.slice(cwd.length + 1)
    : path;
}

/** Moves a 0.1-layout baseline into `baseline/<browser>/` and says so. */
async function migrateIfNeeded(t: Terminal, paths: MotionprPaths, cwd: string): Promise<boolean> {
  const moved = await migrateLegacyBaseline(paths);
  if (!moved) return false;
  t.info(
    `Moved the ${browserLabel(moved.browser)} baseline to ${rel(cwd, moved.to)} (per-browser layout; commit the move).`,
  );
  return true;
}

/** `motionpr baseline accept`: explicitly approve a capture as one engine's new baseline. */
export async function baselineAcceptCommand(options: BaselineOptions): Promise<number> {
  const t = makeTerminal(options);
  banner(t, "baseline accept");
  selectBrowsers(options.browser, "chromium"); // usage errors before anything else
  const cwd = cwdOf(options);
  const { paths, defaultBrowser } = await pathsFor(options, Boolean(options.from));
  const requested =
    options.browser?.length || process.env.MOTIONPR_BROWSER
      ? selectBrowsers(options.browser, defaultBrowser)
      : null;

  // What to approve, per engine. A capture can only become the baseline of the engine it was
  // taken with: a Firefox capture never replaces the Chromium baseline.
  const sources: { browser: BrowserName; dir: string; bundle: CaptureBundle }[] = [];
  if (options.from) {
    if (requested && requested.length > 1)
      throw new MotionprError(
        "CONFIG_INVALID",
        "--from names one capture; pass a single --browser with it.",
      );
    const dir = await resolveCaptureRef(options.from, paths, cwd, requested?.[0]);
    const bundle = await readCaptureBundle(dir);
    const engine = captureBrowser(bundle);
    if (!isBrowserName(engine))
      throw new MotionprError(
        "CAPTURE_FAILED",
        `Capture ${bundle.id} has an unknown browser "${engine}".`,
      );
    if (requested && requested[0] !== engine)
      throw new MotionprError(
        "BROWSER_MISMATCH",
        `Capture ${bundle.id} was taken with ${BROWSER_LABELS[engine]}; it can only become the ${engine} baseline.`,
        { hint: `Drop --browser ${requested[0]}, or approve a ${requested[0]} capture.` },
      );
    sources.push({ browser: engine, dir, bundle });
  } else {
    for (const browser of requested ?? [defaultBrowser]) {
      const dir = await resolveCaptureRef("latest", paths, cwd, browser);
      sources.push({ browser, dir, bundle: await readCaptureBundle(dir) });
    }
  }

  await migrateIfNeeded(t, paths, cwd);
  const accepted: { browser: BrowserName; id: string; replaced: string | null; dir: string }[] = [];
  for (const source of sources) {
    const target = browserPaths(paths, source.browser).baseline;
    if (source.dir === target)
      throw new MotionprError(
        "BASELINE_EXISTS",
        `That capture already is the ${source.browser} baseline.`,
      );
    const failed = source.bundle.scenarios.filter((s) => s.status === "failed");
    if (failed.length && !options.allowFailed) {
      throw new MotionprError(
        "CAPTURE_FAILED",
        `Capture ${source.bundle.id} has ${failed.length} failed scenario(s): ${failed.map((s) => s.key).join(", ")}.`,
        {
          hint: "Fix the scenarios and capture again, or pass --allow-failed to approve it anyway.",
        },
      );
    }
    const current = (await pathExists(join(target, CAPTURE_FILE)))
      ? await readCaptureBundle(target).catch(() => null)
      : null;

    t.write(`  ${t.c.dim("Browser")}        ${BROWSER_LABELS[source.browser]}`);
    t.write(`  ${t.c.dim("New baseline")}   ${describe(source.bundle)}`);
    t.write(
      `  ${t.c.dim("Replaces")}       ${current ? describe(current) : t.c.dim("(no baseline yet)")}`,
    );
    t.write(`  ${t.c.dim("Location")}       ${t.tech(target)}`);
    t.write();

    if (current && !options.yes) {
      if (!t.interactive) {
        throw new MotionprError(
          "BASELINE_EXISTS",
          `Refusing to replace the approved ${source.browser} baseline without confirmation.`,
          {
            hint: "Re-run with --yes to confirm (this is deliberate: baselines are never overwritten silently).",
          },
        );
      }
      const ok = await p.confirm({
        message: `Replace the approved ${BROWSER_LABELS[source.browser]} baseline with this capture?`,
        initialValue: false,
      });
      if (p.isCancel(ok) || !ok) {
        t.info(`${BROWSER_LABELS[source.browser]} baseline unchanged.`);
        continue;
      }
    }
    await copyCaptureDir(source.dir, target);
    accepted.push({
      browser: source.browser,
      id: source.bundle.id,
      replaced: current?.id ?? null,
      dir: target,
    });
    t.success(`${BROWSER_LABELS[source.browser]} baseline set to ${source.bundle.id}`);
  }
  if (options.json) {
    const first = accepted[0];
    printJson(
      accepted.length === 1 && first
        ? {
            baseline: first.dir,
            browser: first.browser,
            accepted: first.id,
            replaced: first.replaced,
          }
        : { baselines: accepted },
    );
  }
  if (accepted.length) {
    t.hint("Commit the baseline directory so CI compares against it:");
    t.next([`git add ${rel(cwd, paths.baseline)}`, 'git commit -m "Update MotionPR baseline"']);
  }
  return 0;
}

interface BaselineStatusEntry {
  dir: string;
  id: string;
  createdAt: string;
  browserVersion: string;
  scenarios: string[];
  legacyLayout: boolean;
}

export async function baselineStatusCommand(options: BaselineOptions): Promise<number> {
  const t = makeTerminal(options);
  banner(t, "baseline status");
  const { paths, defaultBrowser } = await pathsFor(options, false);
  const entries: Partial<Record<BrowserName, BaselineStatusEntry | null>> = {};
  for (const browser of BROWSER_NAMES) {
    const found = await resolveBaselineDir(paths, browser);
    if (!found) {
      entries[browser] = null;
      continue;
    }
    const bundle = await readCaptureBundle(found.dir);
    entries[browser] = {
      dir: found.dir,
      id: bundle.id,
      createdAt: bundle.createdAt,
      browserVersion: bundle.environment.browser.version,
      scenarios: bundle.scenarios.map((s) => s.key),
      legacyLayout: found.legacy,
    };
  }
  if (options.json) {
    const own = entries[defaultBrowser];
    printJson({
      baseline: own
        ? { dir: own.dir, id: own.id, createdAt: own.createdAt, scenarios: own.scenarios }
        : null,
      baselines: entries,
    });
    return 0;
  }
  const any = BROWSER_NAMES.some((b) => entries[b]);
  for (const browser of BROWSER_NAMES) {
    const e = entries[browser];
    const name = BROWSER_LABELS[browser].padEnd(9);
    if (!e) {
      t.write(`  ${t.c.dim(name)} ${t.c.dim("no baseline")}`);
      continue;
    }
    t.write(
      `  ${t.c.bold(name)} ${e.id} · ${e.scenarios.length} scenarios · ${BROWSER_LABELS[browser]} ${e.browserVersion} · ${e.createdAt}`,
    );
    t.write(
      `  ${" ".repeat(9)} ${t.tech(e.dir)}${e.legacyLayout ? t.c.yellow("  (0.1 layout)") : ""}`,
    );
  }
  if (!any) {
    t.write();
    t.warn("No approved baseline.");
    t.next(["npx motionpr run", "npx motionpr baseline accept"]);
  } else if (BROWSER_NAMES.some((b) => entries[b]?.legacyLayout)) {
    t.write();
    t.hint(
      "`npx motionpr baseline migrate` moves the 0.1-layout baseline into its browser's folder.",
    );
  }
  return 0;
}

/** `motionpr baseline migrate`: move a 0.1-layout baseline to `baseline/<browser>/`. */
export async function baselineMigrateCommand(options: BaselineOptions): Promise<number> {
  const t = makeTerminal(options);
  banner(t, "baseline migrate");
  const cwd = cwdOf(options);
  const { paths } = await pathsFor(options, true);
  const legacy = await legacyBaseline(paths);
  if (!legacy) {
    if (options.json) printJson({ migrated: null });
    t.success("Nothing to migrate: baselines already use the per-browser layout.");
    return 0;
  }
  const moved = await migrateLegacyBaseline(paths);
  if (options.json) printJson({ migrated: moved });
  if (moved) {
    t.success(`Moved the ${browserLabel(moved.browser)} baseline to ${rel(cwd, moved.to)}.`);
    t.next([
      `git add -A ${rel(cwd, paths.baseline)}`,
      'git commit -m "Move MotionPR baseline to the per-browser layout"',
    ]);
  }
  return 0;
}
