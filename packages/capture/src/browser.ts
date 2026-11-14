import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { chromium, type Browser, type LaunchOptions } from "playwright-core";
import { MotionprError, type ResolvedConfig } from "@motionpr/core";

const require = createRequire(import.meta.url);

export function playwrightVersion(): string {
  return (require("playwright-core/package.json") as { version: string }).version;
}

function playwrightCli(): string {
  return join(dirname(require.resolve("playwright-core/package.json")), "cli.js");
}

function isMissingExecutable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Executable doesn't exist|Looks like Playwright|browserType\.launch: .*not found|install/i.test(
    message,
  );
}

export async function launchBrowser(
  config: ResolvedConfig,
  overrides: { headless?: boolean } = {},
): Promise<Browser> {
  const options: LaunchOptions = {
    headless: overrides.headless ?? config.browser.headless,
    args: config.browser.args,
    ...(config.browser.channel ? { channel: config.browser.channel } : {}),
    ...(config.browser.executablePath ? { executablePath: config.browser.executablePath } : {}),
  };
  try {
    return await chromium.launch(options);
  } catch (error) {
    if (isMissingExecutable(error) && !config.browser.executablePath && !config.browser.channel) {
      throw new MotionprError("BROWSER_NOT_INSTALLED", "Chromium for MotionPR is not installed.", {
        hint: "Run `npx motionpr install` (add `--with-deps` on Linux CI to install system libraries).",
        cause: error,
      });
    }
    throw new MotionprError(
      "BROWSER_LAUNCH_FAILED",
      `Could not launch Chromium: ${(error as Error).message.split("\n")[0]}`,
      {
        hint: "Run `npx motionpr doctor` for a full environment check.",
        cause: error,
      },
    );
  }
}

export interface InstallOptions {
  withDeps?: boolean;
  onlyShell?: boolean;
  force?: boolean;
  dryRun?: boolean;
}

/** Installs the Chromium build matching the bundled Playwright version. Streams output to the terminal. */
export function installBrowsers(options: InstallOptions = {}): Promise<number> {
  const args = [playwrightCli(), "install"];
  if (options.withDeps) args.push("--with-deps");
  if (options.onlyShell) args.push("--only-shell");
  if (options.force) args.push("--force");
  if (options.dryRun) args.push("--dry-run");
  args.push("chromium");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

/** Path where Playwright expects its Chromium build (may not exist yet). */
export function expectedChromiumPath(): string {
  return chromium.executablePath();
}
