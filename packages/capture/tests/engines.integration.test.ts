/**
 * Native motion whose details differ most between browser engines, captured for real in the
 * engine named by MOTIONPR_TEST_BROWSER (CI runs this file in Chromium, Firefox and WebKit).
 * Everything asserted here was observed to be identical in all three engines, except where a
 * comment says what differs and why.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  parseCaptureBundle,
  resolveConfig,
  type AnimationRecord,
  type CaptureBundle,
  type Checkpoint,
} from "@motionpr/core";
import { compareCaptures } from "@motionpr/comparison";
import { launchBrowser, runCapture } from "../src/index.ts";
import { TEST_BROWSER } from "./helpers/browser.ts";
import { serveDirectory, type StaticServer } from "./helpers/static-server.ts";

const fixtures = fileURLToPath(new URL("./fixtures", import.meta.url));
let server: StaticServer;
let browser: Browser;
let workDir: string;

beforeAll(async () => {
  server = await serveDirectory(fixtures);
  workDir = await mkdtemp(join(tmpdir(), "motionpr-engines-"));
  browser = await launchBrowser(resolveConfig({ baseURL: server.url, scenarios: [{ id: "x" }] }), {
    browserName: TEST_BROWSER,
  });
});

afterAll(async () => {
  await browser?.close();
  await server?.close();
  await rm(workDir, { recursive: true, force: true });
});

let n = 0;
async function capture(
  button: string,
  frames = false,
): Promise<{ bundle: CaptureBundle; dir: string; cp: Checkpoint }> {
  const config = resolveConfig({
    baseURL: server.url,
    browser: { viewport: { width: 800, height: 600 } },
    capture: {
      samples: 6,
      waitForNetworkIdle: false,
      frames: { enabled: frames, fps: 20, maxFrames: 24 },
    },
    scenarios: [
      {
        id: button,
        path: "/engines.html",
        steps: [
          { type: "click", selector: `[data-testid=${button}]` },
          { type: "capture", label: "after" },
        ],
      },
    ],
  });
  const dir = join(workDir, `run-${++n}`);
  const { bundle } = await runCapture({ config, rootDir: workDir, outputDir: dir, browser });
  parseCaptureBundle(JSON.parse(await readFile(join(dir, "capture.json"), "utf8")));
  expect(bundle.scenarios[0]!.status, bundle.scenarios[0]!.error?.message).toBe("passed");
  return { bundle, dir, cp: bundle.scenarios[0]!.checkpoints[0]! };
}

const record = (cp: Checkpoint, id: string): AnimationRecord => {
  const found = cp.animations.find((a) => a.id === id);
  if (!found) throw new Error(`missing ${id}; have ${cp.animations.map((a) => a.id).join(", ")}`);
  return found;
};
const translateX = (r: AnimationRecord) => r.samples.map((s) => s.numeric.translateX ?? 0);
const values = (r: AnimationRecord, prop: string) => r.samples.map((s) => s.values[prop]);

describe(`capture environment (${TEST_BROWSER})`, () => {
  it("records the engine, its runtime version and capabilities as the browser reports them", async () => {
    const { bundle } = await capture("transitions");
    const env = bundle.environment;
    expect(env.browser.name).toBe(TEST_BROWSER);
    expect(env.browser.version).toBe(browser.version());
    expect(env.browser.userAgent).toMatch(
      { chromium: /Chrome\//, firefox: /Firefox\//, webkit: /AppleWebKit\/.*Safari/ }[TEST_BROWSER],
    );
    expect(env.osRelease).toBeTruthy();
    expect(env.capabilities).toMatchObject({
      documentGetAnimations: true,
      elementAnimate: true,
      cssTransitionInterface: true,
      cssAnimationInterface: true,
      transitionRunEvent: true,
      devicePixelRatio: 1,
      prefersReducedMotion: false,
    });
    expect(env.capabilities!.timerResolutionMs).toBeGreaterThan(0);
    expect(env.capabilities!.frameIntervalMs).toBeGreaterThan(0);
    // Firefox and WebKit report performance.now() in whole milliseconds.
    if (TEST_BROWSER !== "chromium")
      expect(bundle.diagnostics.map((d) => d.code)).toContain("COARSE_TIMERS");
  });
});

describe(`CSS transitions (${TEST_BROWSER})`, () => {
  let cp: Checkpoint;
  beforeAll(async () => {
    ({ cp } = await capture("transitions"));
  });

  it("records each transitioned property with its own duration, delay and easing", () => {
    expect(record(cp, "test-id:multi::css-transition::transform").timing).toMatchObject({
      duration: 300,
      delay: 0,
      easing: { value: "ease-in" },
    });
    expect(record(cp, "test-id:multi::css-transition::opacity").timing).toMatchObject({
      duration: 200,
      delay: 50,
      easing: { value: "linear" },
    });
    expect(record(cp, "test-id:multi::css-transition::background-color").timing).toMatchObject({
      duration: 250,
      easing: { value: "steps(5, jump-end)" },
    });
  });

  it("samples steps() exactly at step boundaries (seeking does not drift below them)", () => {
    expect(
      values(record(cp, "test-id:multi::css-transition::background-color"), "background-color"),
    ).toEqual([
      "rgb(255, 0, 0)",
      "rgb(204, 0, 51)",
      "rgb(153, 0, 102)",
      "rgb(102, 0, 153)",
      "rgb(51, 0, 204)",
      "rgb(51, 0, 204)",
    ]);
    expect(
      values(record(cp, "test-id:multi::css-transition::opacity"), "opacity").map(Number),
    ).toEqual([1, 0.88, 0.76, 0.64, 0.52, expect.closeTo(0.4, 3)]);
  });

  it("keeps a transition that ended before the next frame (30 ms)", () => {
    const quick = record(cp, "test-id:quick::css-transition::opacity");
    expect(quick.timing.duration).toBe(30);
    expect(quick.completeness.status).toBe("complete");
    expect(Number(quick.samples.at(-1)!.values.opacity)).toBeCloseTo(0.5, 2);
  });

  it("records an interrupted transition and its shortened reversal", async () => {
    const { cp: interrupted } = await capture("interrupt");
    const first = record(interrupted, "test-id:slider::css-transition::transform");
    const reversal = record(interrupted, "test-id:slider::css-transition::transform#2");
    expect(first.timing.duration).toBe(600);
    expect(first.meta.canceled).toBe(true);
    expect(first.completeness.status).toBe("partial");
    // The reversal runs from where the slider was back to the start, shortened to the distance
    // travelled (CSS Transitions "reversing shortening"). When the 150 ms timer fires relative to
    // frames depends on the engine's scheduling (WebKit renders at 30 fps headless), so the
    // exact duration is environmental: Chromium ~133 ms, Firefox ~167 ms, WebKit ~120 ms.
    expect(reversal.timing.duration).toBeGreaterThan(90);
    expect(reversal.timing.duration).toBeLessThan(220);
    expect(reversal.properties[0]!.to).toBe("none");
    const xs = translateX(reversal);
    expect(xs[0]).toBeGreaterThan(40);
    expect(xs.at(-1)).toBeCloseTo(0, 1);
    for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeLessThanOrEqual(xs[i - 1]! + 1e-6);
  });
});

describe(`CSS animations (${TEST_BROWSER})`, () => {
  it("records iterations, direction, fill, delay and per-keyframe easing", async () => {
    const { cp } = await capture("css-anim");
    const hop = record(cp, "test-id:c-anim::css-animation::hop");
    expect(hop.timing).toMatchObject({
      duration: 200,
      delay: 50,
      iterations: 2,
      direction: "alternate-reverse",
      fill: "backwards",
      keyframeEasings: ["ease-out", "ease-in", "linear"],
      effectiveEasing: { value: "per-keyframe" },
    });
    // Offsets are normalized (Firefox stores 0.4 in single precision).
    expect(hop.properties[0]!.keyframes.map((k) => k.offset)).toEqual([0, 0.4, 1]);
    const ys = hop.samples.map((s) => Math.round(s.numeric.translateY ?? 0));
    expect(ys).toEqual([0, -25, -21, -21, -25, -0]);
  });
});

describe(`Web Animations (${TEST_BROWSER})`, () => {
  let cp: Checkpoint;
  beforeAll(async () => {
    ({ cp } = await capture("waapi"));
  });

  it("records several animations on one element separately", () => {
    const move = record(cp, "test-id:w-multi::web-animation::w-move");
    const fade = record(cp, "test-id:w-multi::web-animation::w-fade");
    expect(move.timing).toMatchObject({ duration: 400, easing: { value: "ease-out" } });
    expect(fade.timing).toMatchObject({ duration: 300, delay: 100, fill: "forwards" });
    expect(translateX(move).at(-1)).toBeCloseTo(240, 0);
    expect(Number(fade.samples.at(-1)!.values.opacity)).toBeCloseTo(0.2, 3);
  });

  it("records reversed playback with a negative rate, sampled from the end to the start", () => {
    const rev = record(cp, "test-id:w-reverse::web-animation::w-rev");
    expect(rev.timing.playbackRate).toBe(-1);
    expect(rev.startTime).toBeCloseTo(400, 0);
    const byTime = [...rev.samples].sort((a, b) => a.windowTime - b.windowTime);
    expect(byTime[0]!.numeric.translateX).toBeCloseTo(240, 0);
    expect(byTime.at(-1)!.numeric.translateX).toBeCloseTo(0, 0);
  });

  it("records a cancelled animation as partial, and the replay stops where it was cancelled", async () => {
    const { cp: withCancel } = await capture("waapi-cancel");
    const cancelled = record(withCancel, "test-id:w-cancel::web-animation::w-cancel");
    expect(cancelled.meta.canceled).toBe(true);
    expect(cancelled.completeness.status).toBe("partial");
    expect(cancelled.samples.at(-1)!.values.transform).toBe("none");
  });

  it("records delay, end delay, iterations and alternation", () => {
    const delayed = record(cp, "test-id:w-delay::web-animation::w-delay");
    expect(delayed.timing).toMatchObject({
      duration: 200,
      delay: 150,
      endDelay: 50,
      iterations: 2,
      direction: "alternate",
      fill: "both",
    });
    expect(translateX(delayed).map(Math.round)).toEqual([0, 96, 192, 192, 96, 0]);
  });

  it("records keyframe offsets and per-keyframe easing", () => {
    const keys = record(cp, "test-id:w-keys::web-animation::w-keys");
    expect(keys.properties[0]!.keyframes.map((k) => [k.offset, k.easing])).toEqual([
      [0, "ease-in"],
      [0.3, "ease-out"],
      [1, "linear"],
    ]);
    expect(translateX(keys).map(Math.round)).toEqual([0, 31, 101, 169, 219, 240]);
  });

  it("keeps an animation finished at creation (finish()) as timing-only, not as pre-interaction motion", () => {
    const finished = record(cp, "test-id:w-finish::web-animation::w-finish");
    expect(finished.timing.duration).toBe(1000);
    expect(finished.meta.finishedOnCreation).toBe(true);
    expect(finished.completeness.status).toBe("metadata-only");
    expect(finished.startTime).toBeNull();
    expect(cp.diagnostics.some((d) => d.code === "PRE_TRIGGER_ANIMATIONS")).toBe(false);
    expect(cp.window.end).toBeCloseTo(550, 0); // w-delay: 150 + 2 × 200 + 50
  });
});

describe(`trigger latency (${TEST_BROWSER})`, () => {
  it("is measured from the interaction that caused the motion, not the window's first step", async () => {
    // Regression: "scroll, waitForAnimations, click" measured latency from the scroll, so it
    // included the settle wait; on a loaded CI runner two runs of one build differed by 128 ms.
    const config = resolveConfig({
      baseURL: server.url,
      browser: { viewport: { width: 800, height: 600 } },
      capture: { samples: 4, waitForNetworkIdle: false, frames: { enabled: false } },
      scenarios: [
        {
          id: "latency",
          path: "/engines.html",
          steps: [
            { type: "scroll", y: 40 },
            { type: "waitForAnimations" },
            { type: "click", selector: "[data-testid=transitions]" },
            { type: "capture", label: "after" },
          ],
        },
      ],
    });
    const { bundle } = await runCapture({
      config,
      rootDir: workDir,
      outputDir: join(workDir, `run-${++n}`),
      browser,
    });
    const cp = bundle.scenarios[0]!.checkpoints[0]!;
    expect(cp.window.trigger).toMatchObject({ step: 2, type: "click", event: "click" });
    expect(cp.window.latency).not.toBeNull();
    // About one frame between the click and the transitions' start (33 ms in headless WebKit).
    expect(cp.window.latency!).toBeLessThan(100);
    expect(cp.animations.some((a) => a.id === "test-id:multi::css-transition::transform")).toBe(
      true,
    );
  });
});

describe(`scroll track start (${TEST_BROWSER})`, () => {
  it("starts from the rest position when the last still and first moved samples share a timestamp", async () => {
    // Regression: with 1 ms timers, Lenis in WebKit emitted a still event and the first moving
    // one in the same millisecond; the moved one was kept as the "rest" sample, so the same
    // build's scroll seemed to start a frame's distance (87 px) later.
    const { AGENT_SOURCE } = await import("../src/index.ts");
    const context = await browser.newContext();
    await context.addInitScript({ content: AGENT_SOURCE });
    const page = await context.newPage();
    await page.goto(`${server.url}/engines.html`);
    const first = await page.evaluate(() => {
      const agent = window.__MOTIONPR_AGENT__!;
      agent.openWindow();
      const t0 = performance.now();
      agent.beginStep(0, "scroll-motion");
      const state = (y: number) => ({
        actualScroll: y,
        animatedScroll: y,
        targetScroll: 400,
        progress: y / 1000,
        velocity: 0,
        direction: 1,
        isScrolling: "smooth" as const,
        isStopped: false,
        limit: 1000,
      });
      const samples = [
        { t: t0 - 5, ...state(100) },
        { t: t0 + 20, ...state(100) },
        { t: t0 + 20, ...state(220) },
        { t: t0 + 53, ...state(330) },
        { t: t0 + 86, ...state(400) },
      ];
      agent.registerAdapter({
        name: "scroll-test",
        collect: () => [],
        collectScroll: () => [
          {
            sessionId: "s1",
            axis: "vertical",
            wrapper: null,
            config: {},
            prefersReducedMotion: false,
            samples,
            events: samples.length,
          },
        ],
      });
      const track = agent.collect().scrollTracks.find((x) => x.sessionId === "s1")!;
      return track.samples.slice(0, 2).map((x) => [x.time, x.animatedScroll]);
    });
    expect(first[0]).toEqual([0, 100]);
    expect(first[1]![1]).toBe(220);
    await context.close();
  });
});

describe(`same-engine determinism (${TEST_BROWSER})`, () => {
  // The scenario's motion is started by the click alone. (An app that cancels or reverses motion
  // on a wall-clock timer behaves differently under load; see the cancelled-animation tests and
  // packages/comparison/tests/regressions.test.ts.)
  it("captures the same build twice with identical samples, frames and no differences", async () => {
    const a = await capture("waapi", true);
    const b = await capture("waapi", true);
    const strip = (cp: Checkpoint) =>
      cp.animations.map((r) => [r.id, r.samples.map((s) => s.values)]);
    expect(strip(b.cp)).toEqual(strip(a.cp));
    expect(b.cp.frames.map((f) => f.asset)).toEqual(a.cp.frames.map((f) => f.asset));
    const result = await compareCaptures({
      baseline: { dir: a.dir, bundle: a.bundle },
      candidate: { dir: b.dir, bundle: b.bundle },
      config: resolveConfig({ baseURL: server.url, scenarios: [{ id: "x" }] }).comparison,
    });
    expect(result.crossBrowser).toBe(false);
    expect(result.differences.filter((d) => d.severity !== "info").map((d) => d.title)).toEqual([]);
    expect(result.scenarios[0]!.checkpoints[0]!.visual?.status).toBe("identical");
  });
});
