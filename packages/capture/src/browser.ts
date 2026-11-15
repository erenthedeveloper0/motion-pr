import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserType,
  type LaunchOptions,
} from "playwright-core";
import {
  BROWSER_LABELS,
  BROWSER_NAMES,
  MotionprError,
  channelEngine,
  isBrowserName,
  type BrowserName,
  type ResolvedConfig,
} from "@motionpr/core";

const require = createRequire(import.meta.url);

const TYPES: Record<BrowserName, BrowserType> = { chromium, firefox, webkit };

export function playwrightVersion(): string {
  return (require("playwright-core/package.json") as { version: string }).version;
}

function playwrightCli(): string {
  return join(dirname(require.resolve("playwright-core/package.json")), "cli.js");
}

/** The Playwright browser type of an engine. */
export function browserType(name: BrowserName): BrowserType {
  return TYPES[name];
}

/** Engine of a launched browser, as Playwright reports it. */
export function browserNameOf(browser: Browser): BrowserName {
  const name = browser.browserType().name();
  if (!isBrowserName(name)) throw new MotionprError("INTERNAL", `Unknown browser type "${name}".`);
  return name;
}

/** Path where Playwright expects its build of an engine (may not exist yet). */
export function expectedBrowserPath(name: BrowserName): string {
  return TYPES[name].executablePath();
}

/**
 * Whether Playwright's build of an engine is downloaded (not whether it can start: see doctor).
 * Headless Chromium runs on Chromium's headless shell, which `install --only-shell` installs
 * without the full browser, so for headless use either one counts.
 */
export function isBrowserInstalled(
  name: BrowserName,
  options: { headless?: boolean } = {},
): boolean {
  try {
    const path = expectedBrowserPath(name);
    if (existsSync(path)) return true;
    if (name !== "chromium" || options.headless === false) return false;
    const shell = path.match(/^(.*[\\/])chromium-(\d+)[\\/]/);
    return Boolean(
      shell &&
      existsSync(join(`${shell[1]}chromium_headless_shell-${shell[2]}`, "INSTALLATION_COMPLETE")),
    );
  } catch {
    return false;
  }
}

/** @deprecated Use {@link expectedBrowserPath}. */
export function expectedChromiumPath(): string {
  return expectedBrowserPath("chromium");
}

/**
 * Launch options for one engine. The configured `channel` belongs to the engine it names
 * (Chromium or Firefox); `executablePath` and `args` belong to the engine in `browser.name`
 * (a binary or a command-line flag of one engine is meaningless to another);
 * `firefoxUserPrefs` apply whenever Firefox runs.
 */
export function launchOptionsFor(
  config: ResolvedConfig,
  name: BrowserName,
  overrides: { headless?: boolean } = {},
): LaunchOptions {
  const b = config.browser;
  const own = b.name === name;
  const channel = b.channel && channelEngine(b.channel) === name ? b.channel : undefined;
  return {
    headless: overrides.headless ?? b.headless,
    ...(own && b.args.length ? { args: b.args } : {}),
    ...(channel ? { channel } : {}),
    ...(own && b.executablePath ? { executablePath: b.executablePath } : {}),
    ...(name === "firefox" && b.firefoxUserPrefs ? { firefoxUserPrefs: b.firefoxUserPrefs } : {}),
  };
}

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;

function firstLine(error: unknown): string {
  const message = (error instanceof Error ? error.message : String(error)).replace(ANSI, "");
  return (
    message
      .split("\n")
      .map((l) => l.replace(/^[╔║╚═\s]+|[╗║╝═\s]+$/g, "").trim())
      .filter(Boolean)[0] ?? message
  );
}

export function isMissingExecutable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Executable doesn't exist|Looks like Playwright|please run the following command to download/i.test(
    message,
  );
}

export function isMissingDependencies(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /missing dependencies|error while loading shared librar|lib[a-z0-9_.+-]+\.so[.\d]*: cannot open|install-deps/i.test(
    message,
  );
}

/** Launches the selected engine. Never falls back to another engine when it cannot start. */
export async function launchBrowser(
  config: ResolvedConfig,
  overrides: { headless?: boolean; browserName?: BrowserName } = {},
): Promise<Browser> {
  const name = overrides.browserName ?? config.browser.name;
  const label = BROWSER_LABELS[name];
  const options = launchOptionsFor(config, name, overrides);
  try {
    return await TYPES[name].launch(options);
  } catch (error) {
    if (isMissingExecutable(error) && !options.executablePath && !options.channel) {
      throw new MotionprError("BROWSER_NOT_INSTALLED", `${label} for MotionPR is not installed.`, {
        hint: `Run \`npx motionpr install ${name}\` (add \`--with-deps\` on Linux CI to install system libraries).`,
        cause: error,
      });
    }
    if (isMissingDependencies(error)) {
      throw new MotionprError(
        "BROWSER_DEPENDENCIES_MISSING",
        `${label} cannot start: the system libraries it needs are missing.`,
        {
          hint: `Run \`npx motionpr install ${name} --with-deps\` (Linux; needs root or sudo). Supported Linux systems are listed in docs/browsers/${name}.md.`,
          cause: error,
        },
      );
    }
    throw new MotionprError(
      "BROWSER_LAUNCH_FAILED",
      `Could not launch ${label}: ${firstLine(error)}`,
      {
        hint: `Run \`npx motionpr doctor --browser ${name}\` for a full environment check.`,
        cause: error,
      },
    );
  }
}

export interface InstallOptions {
  /** Engines to install (default: Chromium). */
  browsers?: readonly BrowserName[];
  withDeps?: boolean;
  onlyShell?: boolean;
  force?: boolean;
  dryRun?: boolean;
}

/**
 * Installs Playwright's builds of the given engines (matching the bundled Playwright version).
 * Streams output to the terminal and resolves with the installer's exit code.
 */
export function installBrowsers(options: InstallOptions = {}): Promise<number> {
  const browsers = options.browsers?.length ? [...options.browsers] : (["chromium"] as const);
  for (const b of browsers)
    if (!(BROWSER_NAMES as readonly string[]).includes(b))
      return Promise.reject(new MotionprError("CONFIG_INVALID", `Unknown browser "${b}".`));
  const args = [playwrightCli(), "install"];
  if (options.withDeps) args.push("--with-deps");
  if (options.onlyShell) args.push("--only-shell");
  if (options.force) args.push("--force");
  if (options.dryRun) args.push("--dry-run");
  args.push(...browsers);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}
