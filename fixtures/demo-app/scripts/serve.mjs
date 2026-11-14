// Serves dist/ at /baseline/ and /candidate/ for manual inspection: node scripts/serve.mjs [port]
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist", import.meta.url));
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
};
const port = Number(process.argv[2] ?? 4600);
createServer(async (req, res) => {
  const m = /^\/(baseline|candidate)(\/.*)?$/.exec(new URL(req.url, "http://x").pathname);
  if (!m) return res.writeHead(302, { location: "/baseline/" }).end();
  let file = normalize(join(dist, m[2] ?? "/"));
  if (!file.startsWith(dist)) return res.writeHead(403).end();
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404).end();
  }
}).listen(port, () =>
  console.log(`demo app: http://localhost:${port}/baseline/  and  /candidate/`),
);
