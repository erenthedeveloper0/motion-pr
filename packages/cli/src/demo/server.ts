import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".json": "application/json",
};

export interface DemoServer {
  url: string;
  close(): Promise<void>;
}

/**
 * Serves the bundled demo app under two prefixes, `/baseline/` and `/candidate/`. Both map to the
 * same files; the app reads the prefix to decide which variant of its motion to play.
 */
export async function serveDemo(root: string, port = 0): Promise<DemoServer> {
  const base = resolve(root);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const match = /^\/(baseline|candidate)(\/.*)?$/.exec(url.pathname);
    if (!match) {
      res.writeHead(302, { location: "/baseline/" }).end();
      return;
    }
    let file = normalize(join(base, decodeURIComponent(match[2] ?? "/")));
    if (!file.startsWith(base)) {
      res.writeHead(403).end();
      return;
    }
    try {
      if ((await stat(file)).isDirectory()) file = join(file, "index.html");
      await stat(file);
      res.writeHead(200, {
        "content-type": TYPES[extname(file)] ?? "application/octet-stream",
        "cache-control": "no-store",
      });
      createReadStream(file).pipe(res);
    } catch {
      res.writeHead(404, { "content-type": "text/plain" }).end("not found");
    }
  });
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("demo server has no address");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((r) => server.close(() => r())),
  };
}
