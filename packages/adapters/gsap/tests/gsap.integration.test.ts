import { copyFile, cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import type { Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveConfig, type AnimationRecord, type CaptureBundle } from "@motionpr/core";
import { AGENT_SOURCE, launchBrowser, runCapture } from "@motionpr/capture";
import { serveDirectory, type StaticServer } from "../../../capture/tests/helpers/static-server.ts";

const require = createRequire(import.meta.url);
let root: string;
let server: StaticServer;
let browser: Browser;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "motionpr-gsap-"));
  await cp(fileURLToPath(new URL("./fixtures", import.meta.url)), root, { recursive: true });
  await copyFile(
    join(dirname(require.resolve("gsap/package.json")), "dist", "gsap.min.js"),
    join(root, "gsap.min.js"),
  );
  const adapter = await build({
    entryPoints: [fileURLToPath(new URL("../src/index.ts", import.meta.url))],
    bundle: true,
    format: "iife",
    globalName: "MotionprGsap",
    write: false,
    platform: "browser",
  });
  await writeFile(join(root, "adapter.js"), adapter.outputFiles[0]!.text);
  server = await serveDirectory(root);
  browser = await launchBrowser(resolveConfig({ baseURL: server.url, scenarios: [{ id: "x" }] }));
});

afterAll(async () => {
  await browser?.close();
  await server?.close();
  await rm(root, { recursive: true, force: true });
});

let n = 0;
async function capture(steps: unknown[]): Promise<CaptureBundle> {
  const config = resolveConfig({
    baseURL: server.url,
    browser: { viewport: { width: 800, height: 500 } },
    capture: { samples: 11, waitForNetworkIdle: false },
    adapters: [{ name: "gsap", required: true }],
    scenarios: [{ id: "gsap", path: "/gsap.html", steps }],
  });
  const { bundle } = await runCapture({
    config,
    rootDir: root,
    outputDir: join(root, `out-${++n}`),
    browser,
  });
  return bundle;
}

const find = (records: AnimationRecord[], key: string) => {
  const r = records.find((a) => a.element.key === key);
  if (!r) throw new Error(`no record for ${key}: ${records.map((a) => a.id).join(", ")}`);
  return r;
};

describe("GSAP adapter (real GSAP 3.15 timelines)", () => {
  let hero: CaptureBundle;
  beforeAll(async () => {
    hero = await capture([
      { type: "click", selector: "[data-testid=play]" },
      { type: "capture", label: "played" },
    ]);
  });

  it("reports timeline tweens with labels, GSAP timing and sampled eases", () => {
    const scenario = hero.scenarios[0]!;
    expect(scenario.status).toBe("passed");
    expect(scenario.diagnostics.some((d) => d.code === "ADAPTER_MISSING")).toBe(false);
    const records = scenario.checkpoints[0]!.animations;
    const title = find(records, "test-id:title");
    expect(title).toMatchObject({ type: "gsap", source: "gsap", name: "hero@intro" });
    expect(title.timing).toMatchObject({ duration: 600, delay: 0, iterations: 1, playbackRate: 1 });
    expect(title.timing.easing).toMatchObject({ value: "power3.out", kind: "gsap" });
    expect(title.timing.easing.samples).toHaveLength(65);
    expect(title.properties.map((p) => p.property)).toEqual(["opacity", "transform"]);
    expect(title.startTime).toBe(0);
    expect(title.completeness.status).toBe("complete");
  });

  it("expands staggers into per-target records with real offsets and a shared group", () => {
    const records = hero.scenarios[0]!.checkpoints[0]!.animations;
    const cards = [1, 2, 3].map((i) => find(records, `test-id:card-${i}`));
    const visibleStarts = cards.map((c) => Math.round(c.startTime! + c.timing.delay));
    expect(visibleStarts).toEqual([600, 700, 800]);
    expect(new Set(cards.map((c) => c.group)).size).toBe(1);
    expect(cards[0]!.group).toMatch(/^gsap:/);
    expect(cards[0]!.name).toBe("hero@cards");
    expect(cards[0]!.timing.easing.value).toBe("back.out(1.7)");
    expect(Math.max(...cards[0]!.timing.easing.samples!)).toBeGreaterThan(1.05);
  });

  it("samples GSAP-driven inline styles by seeking the timeline", () => {
    const records = hero.scenarios[0]!.checkpoints[0]!.animations;
    const title = find(records, "test-id:title");
    expect(title.samples[0]!.numeric).toMatchObject({ translateY: 40, opacity: 0 });
    expect(title.samples.at(-1)!.numeric.translateY!).toBeLessThan(0.5);
    expect(title.samples.at(-1)!.numeric.opacity!).toBeGreaterThan(0.99);
    const card = find(records, "test-id:card-2");
    expect(card.samples[0]!.numeric.translateX).toBe(0);
    expect(card.samples.at(-1)!.numeric.translateX!).toBeGreaterThan(99);
    const cp = hero.scenarios[0]!.checkpoints[0]!;
    expect(cp.window.end).toBeGreaterThanOrEqual(1199);
    expect(cp.frames.length).toBeGreaterThan(30);
  });

  it("replays deterministically", async () => {
    const again = await capture([
      { type: "click", selector: "[data-testid=play]" },
      { type: "capture", label: "played" },
    ]);
    const a = hero.scenarios[0]!.checkpoints[0]!;
    const b = again.scenarios[0]!.checkpoints[0]!;
    expect(b.frames.map((f) => f.asset)).toEqual(a.frames.map((f) => f.asset));
    expect(b.animations.map((r) => r.startTime)).toEqual(a.animations.map((r) => r.startTime));
  });

  it("handles reversed timelines (menu close) with a negative playback rate", async () => {
    const bundle = await capture([
      { type: "click", selector: "[data-testid=open]" },
      { type: "capture", label: "open" },
      { type: "click", selector: "[data-testid=close]" },
      { type: "capture", label: "closed" },
    ]);
    const [open, closed] = bundle.scenarios[0]!.checkpoints;
    const opened = find(open!.animations, "test-id:menu");
    expect(opened.timing).toMatchObject({ duration: 500, playbackRate: 1 });
    expect(opened.samples.at(-1)!.numeric.translateX!).toBeGreaterThan(199);
    const reversed = find(closed!.animations, "test-id:menu");
    expect(reversed.timing.playbackRate).toBe(-1);
    expect(reversed.meta.reversed).toBe(true);
    // Samples are ordered by local time; in reverse, local 0 (x = 0) is reached last.
    expect(reversed.samples[0]!.numeric.translateX).toBe(0);
    expect(reversed.samples[0]!.windowTime).toBeGreaterThan(reversed.samples.at(-1)!.windowTime);
    expect(closed!.window.end).toBeGreaterThanOrEqual(499);
  });

  it("reports repeat, yoyo and repeatDelay", async () => {
    const bundle = await capture([
      { type: "click", selector: "[data-testid=pulse-btn]" },
      { type: "capture", label: "pulsed" },
    ]);
    const pulse = find(bundle.scenarios[0]!.checkpoints[0]!.animations, "test-id:pulse");
    expect(pulse.name).toBe("pulse");
    expect(pulse.timing).toMatchObject({
      duration: 200,
      iterations: 2,
      direction: "alternate",
      activeDuration: 500,
    });
    expect(pulse.meta.repeatDelay).toBe(100);
    expect(pulse.timing.easing.value).toBe("sine.inOut");
  });
});

describe("GSAP adapter: timeline records", () => {
  it("reports timelines as TimelineRecords linked to their tweens", async () => {
    const bundle = await capture([
      { type: "click", selector: "[data-testid=play]" },
      { type: "capture", label: "played" },
    ]);
    const cp = bundle.scenarios[0]!.checkpoints[0]!;
    expect(cp.timelines.length).toBeGreaterThan(0);
    const tl = cp.timelines[0]!;
    expect(tl.source).toBe("gsap");
    expect(tl.labels.length).toBeGreaterThan(0);
    expect(tl.labels.map((l) => l.time)).toEqual(
      [...tl.labels.map((l) => l.time)].sort((a, b) => a - b),
    );
    expect(tl.children.length).toBeGreaterThan(0);
    for (const id of tl.children) {
      const child = cp.animations.find((a) => a.id === id)!;
      expect(child.parent).toBe(tl.id);
      expect(child).toMatchObject({ driver: "javascript", source: "gsap" });
      expect(child.provenance.startTime).toBe("observed");
    }
    expect(bundle.scenarios[0]!.adapters[0]).toMatchObject({
      id: "gsap",
      engineVersion: "3.15.1",
      versionStatus: "supported",
    });
  });
});

describe("GSAP adapter safety", () => {
  it("dispose() restores gsap's methods and unregisters", async () => {
    const context = await browser.newContext();
    await context.addInitScript({ content: AGENT_SOURCE });
    const page = await context.newPage();
    await page.goto(`${server.url}/gsap.html`);
    const result = await page.evaluate(() => {
      const w = window as unknown as {
        gsap: { to: () => unknown };
        MotionprGsap: { motionprGsap: { dispose(): void; isActive(): boolean } };
      };
      const isWrapped = () => String(w.gsap.to).includes("trackRoot");
      const wrappedBefore = isWrapped();
      w.MotionprGsap.motionprGsap.dispose();
      return {
        wrappedBefore,
        wrappedAfter: isWrapped(),
        active: w.MotionprGsap.motionprGsap.isActive(),
        registered: window.__MOTIONPR_AGENT__!.adapters().some((a) => a.name === "gsap"),
      };
    });
    expect(result).toEqual({
      wrappedBefore: true,
      wrappedAfter: false,
      active: false,
      registered: false,
    });
    await context.close();
  });

  it("is inert without a MotionPR agent", async () => {
    const page = await browser.newPage();
    await page.goto(`${server.url}/no-agent.html`);
    expect(
      await page.evaluate(() => [
        (window as unknown as { registered: boolean }).registered,
        (window as unknown as { untouched: boolean }).untouched,
      ]),
    ).toEqual([false, true]);
    await page.close();
  });

  it("does not re-fire callbacks or leave timelines paused after replay", async () => {
    const context = await browser.newContext();
    await context.addInitScript({ content: AGENT_SOURCE });
    const page = await context.newPage();
    await page.goto(`${server.url}/gsap.html`);
    await page.click("[data-testid=play]");
    await page.evaluate(() => window.__MOTIONPR_AGENT__!.waitForSettle(5000, 120));
    const state = await page.evaluate(() => {
      const agent = window.__MOTIONPR_AGENT__!;
      const before = (window as unknown as { completeCount: number }).completeCount;
      agent.collect();
      agent.beginReplay();
      for (const t of [0, 300, 900, 1200, 50]) agent.seek(t);
      agent.sample(8);
      agent.endReplay();
      return { before };
    });
    await page.waitForTimeout(200);
    const after = await page.evaluate(
      () => (window as unknown as { completeCount: number }).completeCount,
    );
    expect(state.before).toBe(1);
    expect(after).toBe(1);
    // The menu timeline must still respond to the application after a replay.
    await page.click("[data-testid=open]");
    await page.waitForTimeout(700);
    const x = await page.evaluate(
      () => getComputedStyle(document.querySelector("[data-testid=menu]")!).transform,
    );
    expect(x).toContain("200");
    await context.close();
  });
});
