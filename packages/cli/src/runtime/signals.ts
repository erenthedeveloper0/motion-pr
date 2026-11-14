/**
 * Graceful shutdown. The first Ctrl+C aborts the running operation and runs registered cleanups
 * (close the browser, stop web servers); a second Ctrl+C exits immediately.
 */
type Cleanup = () => Promise<void> | void;

const cleanups = new Set<Cleanup>();
const controller = new AbortController();
let installed = false;
let interrupted = 0;

export const abortSignal: AbortSignal = controller.signal;

export function onCleanup(fn: Cleanup): () => void {
  cleanups.add(fn);
  return () => cleanups.delete(fn);
}

export async function runCleanups(): Promise<void> {
  const list = [...cleanups].reverse();
  cleanups.clear();
  await Promise.allSettled(list.map(async (fn) => fn()));
}

export function installSignalHandlers(onInterrupt: (signal: NodeJS.Signals) => void): void {
  if (installed) return;
  installed = true;
  const handler = (signal: NodeJS.Signals) => {
    interrupted++;
    if (interrupted > 1) process.exit(signal === "SIGINT" ? 130 : 143);
    onInterrupt(signal);
    controller.abort(new Error(`Interrupted by ${signal}`));
    void runCleanups().finally(() => process.exit(signal === "SIGINT" ? 130 : 143));
  };
  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);
}
