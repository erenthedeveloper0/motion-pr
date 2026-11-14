import { spawn } from "node:child_process";

/** Opens a file or URL with the platform's default handler. Resolves false if it could not. */
export function openInBrowser(target: string): Promise<boolean> {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [target]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", '""', `"${target}"`]]
        : ["xdg-open", [target]];
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args as string[], {
        stdio: "ignore",
        detached: true,
        windowsVerbatimArguments: process.platform === "win32",
      });
      child.once("error", () => resolve(false));
      child.once("spawn", () => {
        child.unref();
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}
