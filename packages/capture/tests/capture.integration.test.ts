import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import type { Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  parseCaptureBundle,
  resolveConfig,
  type AnimationRecord,
  type CaptureBundle,
  type MotionprConfig,
} from "@motionpr/core";
import { launchBrowser, runCapture } from "../src/index.ts";
import { serveDirectory, type StaticServer } from "./helpers/static-server.ts";

const fixtures = fileURLToPath(new URL("./fixtures", import.meta.url));
let server: StaticServer;
let browser: Browser;
let workDir: string;

beforeAll(async () => {
  server = await serveDirectory(fixtures);
  workDir = await mkdtemp(join(tmpdir(), "motionpr-capture-"));
  browser = await launchBrowser(resolveConfig({ baseURL: server.url, scenarios: [{ id: "x" }] }));
});

afterAll(async () => {
  await browser?.close();
  await server?.close();
  await rm(workDir, { recursive: true, force: true });
});

let runCounter = 0;
async function capture(
  scenarios: MotionprConfig["scenarios"],
  extra: Partial<MotionprConfig> = {},
): Promise<{ bundle: CaptureBundle; dir: string }> {
  const config = resolveConfig({
    baseURL: server.url,
    browser: { viewport: { width: 800, height: 600 } },
    capture: { samples: 12, waitForNetworkIdle: false },
    ignore: { selectors: ["[data-testid=noise]"] },
    scenarios,
    ...extra,
  });
  const dir = join(workDir, `run-${++runCounter}`);
  const outcome = await runCapture({ config, rootDir: workDir, outputDir: dir, browser });
  // Every bundle written to disk must round-trip through schema validation.
  parseCaptureBundle(JSON.parse(await readFile(join(dir, "capture.json"), "utf8")));
  return outcome;
}

async function decode(dir: string, bundle: CaptureBundle, assetId: string): Promise<PNG> {
  return PNG.sync.read(await readFile(join(dir, bundle.assets[assetId]!.file)));
}

type Px = (r: number, g: number, b: number) => boolean;
/** Red, also when faded towards white by opacity (panel fades to 0.5). */
const reddish: Px = (r, g, b) => r > 200 && r - g > 80 && r - b > 80;
const bluish: Px = (r, g, b) => b > 200 && b - r > 80 && b - g > 80;

/** Leftmost x of pixels matching the predicate within the given rows, or -1. */
function leftmost(png: PNG, match: Px, rows: [number, number]): number {
  for (let x = 0; x < png.width; x++) {
    for (let y = rows[0]; y < rows[1]; y++) {
      const i = (y * png.width + x) * 4;
      if (match(png.data[i]!, png.data[i + 1]!, png.data[i + 2]!)) return x;
    }
  }
  return -1;
}

const byId = (animations: AnimationRecord[], id: string) => {
  const found = animations.find((a) => a.id === id);
  if (!found) throw new Error(`missing ${id}; have ${animations.map((a) => a.id).join(", ")}`);
  return found;
};

describe("native animation capture", () => {
  let result: { bundle: CaptureBundle; dir: string };

  beforeAll(async () => {
    result = await capture([
      {
        id: "toggle",
        path: "/native.html",
        steps: [
          { type: "click", selector: "[data-testid=toggle]" },
          { type: "capture", label: "open" },
        ],
      },
    ]);
  });

  it("records CSS transitions with declared timing and effect easing", () => {
    const scenario = result.bundle.scenarios[0]!;
    expect(scenario.status).toBe("passed");
    const cp = scenario.checkpoints[0]!;
    const panel = byId(cp.animations, "test-id:panel::css-transition::transform");
    expect(panel.type).toBe("css-transition");
    expect(panel.timing).toMatchObject({
      duration: 400,
      delay: 100,
      iterations: 1,
      playbackRate: 1,
    });
    expect(panel.timing.easing).toMatchObject({
      value: "cubic-bezier(0.16, 1, 0.3, 1)",
      kind: "css",
      scope: "effect",
    });
    expect(panel.timing.easing.samples).toHaveLength(65);
    expect(panel.element).toMatchObject({ method: "test-id", confidence: "high" });
    expect(panel.completeness.status).toBe("complete");

    const opacity = byId(cp.animations, "test-id:panel::css-transition::opacity");
    expect(opacity.properties[0]).toMatchObject({ property: "opacity", from: "1", to: "0.5" });
  });

  it("samples a monotonic trajectory from start to end value", () => {
    const panel = byId(
      result.bundle.scenarios[0]!.checkpoints[0]!.animations,
      "test-id:panel::css-transition::transform",
    );
    expect(panel.samples).toHaveLength(12);
    const xs = panel.samples.map((s) => s.numeric.translateX!);
    expect(xs[0]).toBeCloseTo(0, 0);
    expect(xs[xs.length - 1]).toBeGreaterThan(199);
    for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeGreaterThanOrEqual(xs[i - 1]! - 1e-6);
    expect(panel.samples.at(-1)!.box!.x).toBeGreaterThan(199);
    // ease-out-expo moves most of the distance early.
    expect(xs[3]!).toBeGreaterThan(100);
  });

  it("records CSS animations with per-keyframe easing as the effective easing", () => {
    const badge = byId(
      result.bundle.scenarios[0]!.checkpoints[0]!.animations,
      "motionpr-id:badge::css-animation::rise",
    );
    expect(badge.timing).toMatchObject({ duration: 300, delay: 200, fill: "forwards" });
    expect(badge.timing.easing.value).toBe("linear");
    expect(badge.timing.effectiveEasing).toMatchObject({ value: "ease-out", scope: "segment" });
    expect(badge.properties.map((p) => p.property).sort()).toEqual(["opacity", "transform"]);
  });

  it("records Web Animations with ids, steps easing and low-confidence DOM paths", () => {
    const grow = byId(
      result.bundle.scenarios[0]!.checkpoints[0]!.animations,
      "path:body>section>div>span::web-animation::grow",
    );
    expect(grow.timing.easing.value).toBe("steps(4, jump-end)");
    expect(grow.element).toMatchObject({ method: "dom-path", confidence: "low" });
    expect(grow.element.warnings[0]).toMatch(/data-motionpr-id/);
    const scales = grow.samples.map((s) => s.numeric.scaleX);
    expect(new Set(scales).size).toBeLessThanOrEqual(5);
  });

  it("excludes ignored elements and pre-trigger animations, and measures trigger latency", () => {
    const cp = result.bundle.scenarios[0]!.checkpoints[0]!;
    expect(cp.animations.some((a) => a.element.key.includes("noise"))).toBe(false);
    expect(cp.animations.some((a) => a.name === "spin")).toBe(false);
    expect(cp.diagnostics.some((d) => d.code === "PRE_TRIGGER_ANIMATIONS")).toBe(true);
    expect(cp.window.origin).toBe("trigger");
    expect(cp.window.trigger).toMatchObject({ type: "click", event: "click" });
    expect(cp.window.latency).toBeGreaterThanOrEqual(0);
    expect(cp.window.latency).toBeLessThan(100);
    expect(cp.window.end).toBeGreaterThanOrEqual(500);
  });

  it("renders a deterministic filmstrip: frames show the replayed state at each time", async () => {
    const { bundle, dir } = result;
    const cp = bundle.scenarios[0]!.checkpoints[0]!;
    expect(cp.frames.length).toBeGreaterThanOrEqual(15);
    expect(cp.frameInterval).toBeCloseTo(1000 / 30, 1);
    const first = await decode(dir, bundle, cp.frames[0]!.asset);
    const last = await decode(dir, bundle, cp.frames.at(-1)!.asset);
    const red = reddish;
    const blue = bluish;
    expect(leftmost(first, red, [40, 60])).toBeLessThan(3);
    expect(leftmost(last, red, [40, 60])).toBeGreaterThanOrEqual(198);
    // The badge is in its delay phase at t=0: the finished fill-forwards original must not leak in.
    expect(leftmost(first, blue, [200, 260])).toBe(-1);
    expect(leftmost(last, blue, [200, 260])).toBeGreaterThanOrEqual(18);
    const mid = await decode(dir, bundle, cp.frames.find((f) => f.time >= 200)!.asset);
    const midX = leftmost(mid, red, [40, 60]);
    expect(midX).toBeGreaterThan(20);
    expect(midX).toBeLessThan(198);
    expect(cp.screenshot).not.toBeNull();
  });

  it("produces identical frames and samples on a second run", async () => {
    const again = await capture([
      {
        id: "toggle",
        path: "/native.html",
        steps: [
          { type: "click", selector: "[data-testid=toggle]" },
          { type: "capture", label: "open" },
        ],
      },
    ]);
    const a = result.bundle.scenarios[0]!.checkpoints[0]!;
    const b = again.bundle.scenarios[0]!.checkpoints[0]!;
    expect(b.frames.map((f) => f.asset)).toEqual(a.frames.map((f) => f.asset));
    expect(b.animations.map((x) => x.id)).toEqual(a.animations.map((x) => x.id));
    expect(b.animations.map((x) => x.startTime)).toEqual(a.animations.map((x) => x.startTime));
    expect(b.screenshot).toBe(a.screenshot);
  });
});

describe("capture edge cases", () => {
  it("records page-load animations, including infinite ones, without a trigger", async () => {
    const { bundle } = await capture([
      { id: "load", path: "/native.html", steps: [{ type: "capture", label: "load" }] },
    ]);
    const cp = bundle.scenarios[0]!.checkpoints[0]!;
    const spin = cp.animations.find((a) => a.name === "spin")!;
    expect(spin.timing.iterations).toBe("infinite");
    expect(spin.samples.length).toBe(12);
    expect(cp.window.origin).toBe("motion-start");
    expect(cp.diagnostics.some((d) => d.code === "INFINITE_ANIMATIONS")).toBe(true);
  });

  it("marks animations whose element was removed as metadata-only", async () => {
    const { bundle } = await capture([
      {
        id: "toast",
        path: "/removal.html",
        steps: [
          { type: "click", selector: "[data-testid=dismiss]" },
          { type: "capture", label: "dismissed" },
        ],
      },
    ]);
    const anim = bundle.scenarios[0]!.checkpoints[0]!.animations[0]!;
    expect(anim.name).toBe("out");
    expect(anim.completeness.status).toBe("metadata-only");
    expect(anim.completeness.reasons.join(" ")).toMatch(/left the document/);
    expect(anim.timing.duration).toBe(200);
  });

  it("works on pages with a strict Content-Security-Policy", async () => {
    const { bundle } = await capture([
      {
        id: "csp",
        path: "/csp.html",
        steps: [
          { type: "click", selector: "[data-testid=go]" },
          { type: "capture", label: "moved" },
        ],
      },
    ]);
    const scenario = bundle.scenarios[0]!;
    expect(scenario.status).toBe("passed");
    expect(scenario.checkpoints[0]!.animations.map((a) => a.id)).toEqual([
      "test-id:box::css-transition::transform",
    ]);
  });

  it("reports failing steps with a message, skipped remainder and a failure screenshot", async () => {
    const { bundle } = await capture([
      {
        id: "broken",
        path: "/native.html",
        steps: [
          { type: "click", selector: "[data-testid=missing]", timeout: 500 },
          { type: "capture", label: "never" },
        ],
      },
    ]);
    const scenario = bundle.scenarios[0]!;
    expect(scenario.status).toBe("failed");
    expect(scenario.error!.message).toMatch(/Step 1 \(click \[data-testid=missing\]\) failed/);
    expect(scenario.steps.map((s) => s.status)).toEqual(["failed", "skipped"]);
    expect(scenario.failureScreenshot).not.toBeNull();
  });

  it("adds an implicit final capture and runs once per viewport", async () => {
    const { bundle } = await capture([{ id: "implicit", path: "/native.html" }], {
      browser: {
        viewports: [
          { name: "wide", width: 900, height: 600 },
          { name: "narrow", width: 400, height: 700 },
        ],
      },
    });
    expect(bundle.scenarios.map((s) => s.key)).toEqual(["implicit@wide", "implicit@narrow"]);
    expect(bundle.scenarios[0]!.checkpoints[0]!.label).toBe("final");
    expect(bundle.scenarios[1]!.viewport).toMatchObject({ width: 400, height: 700 });
  });

  it("never writes fill values into the capture", async () => {
    const { dir } = await capture([
      {
        id: "form",
        path: "/native.html",
        steps: [
          {
            type: "fill",
            selector: "[data-testid=toggle]",
            value: "top-secret-value",
            timeout: 300,
          },
          { type: "capture", label: "x" },
        ],
      },
    ]);
    expect(await readFile(join(dir, "capture.json"), "utf8")).not.toContain("top-secret-value");
  });
});

describe("agent memory (regression: tracked animations were never released)", () => {
  it("keeps bookkeeping bounded across many windows of short animations", async () => {
    const { AGENT_SOURCE } = await import("../src/index.ts");
    const context = await browser.newContext();
    await context.addInitScript({ content: AGENT_SOURCE });
    const page = await context.newPage();
    await page.goto(`${server.url}/native.html`);
    const stats = await page.evaluate(async () => {
      const agent = window.__MOTIONPR_AGENT__!;
      const el = document.createElement("div");
      document.body.append(el);
      const sizes: number[] = [];
      for (let w = 0; w < 6; w++) {
        agent.openWindow();
        for (let i = 0; i < 50; i++) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 20 });
        await agent.waitForSettle(3000, 50);
        agent.collect();
        sizes.push(agent.stats().tracked);
      }
      agent.openWindow();
      return { sizes, after: agent.stats().tracked };
    });
    // Each window holds only its own 50 animations; earlier windows are released.
    expect(Math.max(...stats.sizes)).toBeLessThanOrEqual(60);
    expect(stats.after).toBeLessThanOrEqual(10);
    await context.close();
  });
});
