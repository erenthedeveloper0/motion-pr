import { BROWSER_LABELS, BROWSER_NAMES, MotionprError, type BrowserName } from "@motionpr/core";
import { installBrowsers, isBrowserInstalled, playwrightVersion } from "@motionpr/capture";
import { loadConfig } from "../config/load.ts";
import {
  banner,
  browserList,
  cwdOf,
  makeTerminal,
  printJson,
  selectBrowsers,
  type GlobalOptions,
} from "./shared.ts";

export interface InstallCommandOptions extends GlobalOptions {
  withDeps?: boolean;
  onlyShell?: boolean;
  force?: boolean;
  dryRun?: boolean;
  all?: boolean;
}

/**
 * Engines to install: the names given, every engine with --all, otherwise the config's
 * `browser.name` (or MOTIONPR_BROWSER), and Chromium when there is no config.
 */
async function browsersToInstall(
  names: readonly string[],
  options: InstallCommandOptions,
): Promise<BrowserName[]> {
  if (options.all) return [...BROWSER_NAMES];
  if (names.length) return selectBrowsers(names, "chromium");
  let fallback: BrowserName = "chromium";
  try {
    const loaded = await loadConfig({
      cwd: cwdOf(options),
      ...(options.config ? { config: options.config } : {}),
      ...(options.env ? { env: options.env } : {}),
    });
    fallback = loaded.config.browser.name;
  } catch {
    // no (valid) config: install the default engine
  }
  return selectBrowsers(undefined, fallback);
}

export async function installCommand(
  names: string[],
  options: InstallCommandOptions,
): Promise<number> {
  const t = makeTerminal(options);
  banner(t, "install");
  const browsers = await browsersToInstall(names, options);
  if (options.onlyShell && !browsers.includes("chromium"))
    throw new MotionprError("CONFIG_INVALID", "--only-shell only applies to Chromium.", {
      hint: "Chromium has a smaller headless-only build; Firefox and WebKit do not.",
    });
  t.step(
    `Installing ${browserList(browsers)} for Playwright ${playwrightVersion()}${options.withDeps ? " with system dependencies" : ""}`,
  );
  if (process.platform === "linux" && !options.withDeps) {
    t.hint(
      "On a fresh Linux machine or CI runner, add --with-deps to install required system libraries.",
    );
  }
  if (process.platform === "win32" && browsers.includes("webkit")) {
    t.hint("WebKit on Windows is Playwright's build and is not covered by MotionPR's tests.");
  }
  t.write();
  const code = await installBrowsers({
    browsers,
    ...(options.withDeps ? { withDeps: true } : {}),
    ...(options.onlyShell ? { onlyShell: true } : {}),
    ...(options.force ? { force: true } : {}),
    ...(options.dryRun ? { dryRun: true } : {}),
  });
  t.write();
  const missing = options.dryRun ? [] : browsers.filter((b) => !isBrowserInstalled(b));
  if (options.json)
    printJson({
      browsers,
      exitCode: code,
      installed: options.dryRun ? null : browsers.filter((b) => isBrowserInstalled(b)),
    });
  if (code === 0 && !missing.length) {
    t.success(
      options.dryRun
        ? "Dry run complete."
        : `${browserList(browsers)} ${browsers.length === 1 ? "is" : "are"} ready.`,
    );
    const flag =
      browsers.length === 1 && browsers[0] === "chromium" ? "" : ` --browser ${browsers.join(",")}`;
    t.next([`npx motionpr doctor${flag}`, `npx motionpr run${flag}`]);
    return 0;
  }
  t.fail(
    code !== 0
      ? `Browser installation failed (exit code ${code}).`
      : `${browserList(missing)} ${missing.length === 1 ? "is" : "are"} still missing after installation.`,
  );
  t.hint(
    [
      "Common causes:",
      "  · no network access or a proxy: set HTTPS_PROXY, or PLAYWRIGHT_DOWNLOAD_HOST for a mirror",
      `  · missing system libraries on Linux: re-run with --with-deps (needs sudo/root)${browsers.includes("webkit") ? "; WebKit needs a supported distribution (docs/browsers/webkit.md)" : ""}`,
      "  · read-only cache: set PLAYWRIGHT_BROWSERS_PATH to a writable directory",
    ].join("\n"),
  );
  for (const b of missing) t.hint(`${BROWSER_LABELS[b]} is not installed.`);
  return 2;
}
