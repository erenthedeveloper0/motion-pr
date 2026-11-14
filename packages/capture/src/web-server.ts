import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { MotionprError, type ResolvedWebServer } from "@motionpr/core";

export interface WebServerHandle {
  /** URLs that are being served (started or reused). */
  readonly urls: string[];
  stop(): Promise<void>;
}

export interface WebServerLogger {
  info(message: string): void;
  output?(line: string): void;
}

/** Playwright's readiness rule: 2xx, 3xx and 400–403 count as "up". */
function isReadyStatus(status: number): boolean {
  return (status >= 200 && status < 400) || (status >= 400 && status <= 403);
}

export async function isUrlReady(url: string, timeoutMs = 2000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "manual" });
    await res.body?.cancel().catch(() => undefined);
    return isReadyStatus(res.status);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

class RingBuffer {
  #lines: string[] = [];
  readonly size: number;
  constructor(size: number) {
    this.size = size;
  }
  push(chunk: string): string[] {
    const lines = chunk.split(/\r?\n/).filter((l) => l.length);
    for (const l of lines) {
      this.#lines.push(l);
      if (this.#lines.length > this.size) this.#lines.shift();
    }
    return lines;
  }
  toString(): string {
    return this.#lines.join("\n");
  }
}

function killTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined || child.exitCode !== null) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      process.kill(-child.pid, signal);
    }
  } catch {
    try {
      child.kill(signal);
    } catch {
      // already gone
    }
  }
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((r) => child.once("exit", () => r()));
  killTree(child, "SIGTERM");
  const timeout = new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 5000).unref());
  if ((await Promise.race([exited, timeout])) === "timeout") {
    killTree(child, "SIGKILL");
    await exited;
  }
}

/**
 * Starts the configured web servers (or reuses running ones) and waits until each URL responds.
 * Always call `stop()` (it is safe to call more than once).
 */
export async function startWebServers(
  servers: readonly ResolvedWebServer[],
  options: { cwd: string; logger?: WebServerLogger; signal?: AbortSignal },
): Promise<WebServerHandle> {
  const children: ChildProcess[] = [];
  const urls: string[] = [];
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await Promise.all(children.map(stopChild));
  };

  try {
    for (const server of servers) {
      urls.push(server.url);
      const alreadyUp = await isUrlReady(server.url);
      if (alreadyUp) {
        if (server.reuseExistingServer) {
          options.logger?.info(`Reusing server already running at ${server.url}`);
          continue;
        }
        throw new MotionprError(
          "WEB_SERVER_FAILED",
          `Something is already serving ${server.url}.`,
          {
            hint: "Stop it, or set `webServer.reuseExistingServer: true` to use the running server.",
          },
        );
      }

      options.logger?.info(`Starting web server: ${server.command}`);
      const output = new RingBuffer(60);
      const child = spawn(server.command, {
        cwd: server.cwd ? resolve(options.cwd, server.cwd) : options.cwd,
        env: { ...process.env, ...server.env },
        shell: true,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });
      children.push(child);
      const onData = (data: Buffer) => {
        const lines = output.push(data.toString());
        if (server.stdout === "pipe") for (const l of lines) options.logger?.output?.(l);
      };
      child.stdout?.on("data", onData);
      child.stderr?.on("data", onData);
      let exitInfo: string | null = null;
      child.once("exit", (code, signal) => {
        exitInfo = signal ? `signal ${signal}` : `code ${code}`;
      });

      const started = Date.now();
      while (true) {
        if (options.signal?.aborted)
          throw new MotionprError("ABORTED", "Aborted while waiting for the web server.");
        if (exitInfo) {
          throw new MotionprError(
            "WEB_SERVER_FAILED",
            `Web server command exited with ${exitInfo} before ${server.url} was ready.`,
            {
              hint: `Command: ${server.command}\n--- last output ---\n${output.toString() || "(no output)"}`,
            },
          );
        }
        if (await isUrlReady(server.url, 1500)) break;
        if (Date.now() - started > server.timeout) {
          throw new MotionprError(
            "WEB_SERVER_TIMEOUT",
            `Timed out after ${server.timeout} ms waiting for ${server.url}.`,
            {
              hint: `Increase webServer.timeout or check the command.\n--- last output ---\n${output.toString() || "(no output)"}`,
            },
          );
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      options.logger?.info(`Web server ready at ${server.url} (${Date.now() - started} ms)`);
    }
  } catch (error) {
    await stop();
    throw error;
  }
  return { urls, stop };
}
