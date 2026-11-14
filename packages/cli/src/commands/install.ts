import { installBrowsers, playwrightVersion } from "@motionpr/capture";
import { banner, makeTerminal, type GlobalOptions } from "./shared.ts";

export interface InstallCommandOptions extends GlobalOptions {
  withDeps?: boolean;
  onlyShell?: boolean;
  force?: boolean;
  dryRun?: boolean;
}

export async function installCommand(options: InstallCommandOptions): Promise<number> {
  const t = makeTerminal(options);
  banner(t, "install");
  t.step(
    `Installing Chromium for Playwright ${playwrightVersion()}${options.withDeps ? " with system dependencies" : ""}`,
  );
  if (process.platform === "linux" && !options.withDeps) {
    t.hint(
      "On a fresh Linux machine or CI runner, add --with-deps to install required system libraries.",
    );
  }
  t.write();
  const code = await installBrowsers({
    ...(options.withDeps ? { withDeps: true } : {}),
    ...(options.onlyShell ? { onlyShell: true } : {}),
    ...(options.force ? { force: true } : {}),
    ...(options.dryRun ? { dryRun: true } : {}),
  });
  t.write();
  if (code === 0) {
    t.success("Chromium is ready.");
    t.next(["npx motionpr doctor", "npx motionpr run"]);
    return 0;
  }
  t.fail(`Browser installation failed (exit code ${code}).`);
  t.hint(
    [
      "Common causes:",
      "  · no network access or a proxy: set HTTPS_PROXY, or PLAYWRIGHT_DOWNLOAD_HOST for a mirror",
      "  · missing system libraries on Linux: re-run with --with-deps (needs sudo/root)",
      "  · read-only cache: set PLAYWRIGHT_BROWSERS_PATH to a writable directory",
    ].join("\n"),
  );
  return 2;
}
