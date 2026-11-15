import { copyFile, cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import type { Browser } from "playwright-core";
import { resolveConfig, type CaptureBundle, type MotionprConfig } from "@motionpr/core";
import { launchBrowser, runCapture } from "@motionpr/capture";
import { serveDirectory, type StaticServer } from "../../../capture/tests/helpers/static-server.ts";
import { TEST_BROWSER } from "../../../capture/tests/helpers/browser.ts";

const require = createRequire(import.meta.url);

export interface Harness {
  root: string;
  server: StaticServer;
  browser: Browser;
  capture(path: string, steps: unknown[], over?: Partial<MotionprConfig>): Promise<CaptureBundle>;
  close(): Promise<void>;
}

/** Serves the fixtures with Anime.js (UMD) and the adapter bundled as an IIFE (`MotionprAnime`). */
export async function startHarness(): Promise<Harness> {
  const root = await mkdtemp(join(tmpdir(), "motionpr-anime-"));
  await cp(fileURLToPath(new URL("./fixtures", import.meta.url)), root, { recursive: true });
  await copyFile(
    join(dirname(require.resolve("animejs/package.json")), "dist", "bundles", "anime.umd.min.js"),
    join(root, "anime.umd.min.js"),
  );
  const adapter = await build({
    entryPoints: [fileURLToPath(new URL("../src/index.ts", import.meta.url))],
    bundle: true,
    format: "iife",
    globalName: "MotionprAnime",
    write: false,
    platform: "browser",
  });
  await writeFile(join(root, "adapter.js"), adapter.outputFiles[0]!.text);
  const server = await serveDirectory(root);
  const browser = await launchBrowser(
    resolveConfig({ baseURL: server.url, scenarios: [{ id: "x" }] }),
    {
      browserName: TEST_BROWSER,
    },
  );
  let n = 0;
  return {
    root,
    server,
    browser,
    async capture(path, steps, over = {}) {
      const config = resolveConfig({
        baseURL: server.url,
        browser: { viewport: { width: 900, height: 600 } },
        capture: { samples: 11, waitForNetworkIdle: false, frames: { enabled: false } },
        adapters: [{ name: "animejs", required: true }],
        scenarios: [{ id: "anime", path, steps }],
        ...over,
      } as MotionprConfig);
      const { bundle } = await runCapture({
        config,
        rootDir: root,
        outputDir: join(root, `out-${++n}`),
        browser,
      });
      return bundle;
    },
    async close() {
      await browser.close();
      await server.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}
