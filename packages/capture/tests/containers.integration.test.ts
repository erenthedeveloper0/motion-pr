/**
 * Scroll motion of native scroll containers (overflow elements), captured for real in the engine
 * named by MOTIONPR_TEST_BROWSER (CI runs this file in Chromium, Firefox and WebKit). Fixture:
 * fixtures/containers.html. Engines scroll with their own smooth-scroll curves and frame rates
 * (headless WebKit on macOS renders at 30 fps), so only positions, ids and findings are asserted,
 * not sample counts or durations.
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
  type CaptureBundle,
  type Checkpoint,
  type MotionprConfig,
  type ScrollMotionRecord,
} from "@motionpr/core";
import { compareCaptures, scrollMetrics } from "@motionpr/comparison";
import { launchBrowser, runCapture } from "../src/index.ts";
import { TEST_BROWSER } from "./helpers/browser.ts";
import { serveDirectory, type StaticServer } from "./helpers/static-server.ts";

const fixtures = fileURLToPath(new URL("./fixtures", import.meta.url));
let server: StaticServer;
let browser: Browser;
let workDir: string;

beforeAll(async () => {
  server = await serveDirectory(fixtures);
  workDir = await mkdtemp(join(tmpdir(), "motionpr-containers-"));
  browser = await launchBrowser(resolveConfig({ baseURL: server.url, scenarios: [{ id: "x" }] }), {
    browserName: TEST_BROWSER,
  });
});

afterAll(async () => {
  await browser?.close();
  await server?.close();
  await rm(workDir, { recursive: true, force: true });
});

const comparisonConfig = () => {
  const c = resolveConfig({ baseURL: "http://x", scenarios: [{ id: "x" }] }).comparison;
  return { ...c, visual: { ...c.visual, enabled: false } };
};

let n = 0;
async function capture(
  steps: unknown[],
  { path = "/containers.html", ...extra }: Partial<MotionprConfig> & { path?: string } = {},
): Promise<{ bundle: CaptureBundle; dir: string }> {
  const config = resolveConfig({
    baseURL: server.url,
    browser: { viewport: { width: 800, height: 600 } },
    capture: { samples: 6, waitForNetworkIdle: false, frames: { enabled: false } },
    scenarios: [{ id: "containers", path, steps }],
    ...extra,
  } as MotionprConfig);
  const dir = join(workDir, `run-${++n}`);
  const { bundle } = await runCapture({ config, rootDir: workDir, outputDir: dir, browser });
  parseCaptureBundle(JSON.parse(await readFile(join(dir, "capture.json"), "utf8")));
  return { bundle, dir };
}

function checkpoint(bundle: CaptureBundle, index = 0): Checkpoint {
  const scenario = bundle.scenarios[0]!;
  expect(scenario.status, scenario.error?.message).toBe("passed");
  return scenario.checkpoints[index]!;
}

function scroller(cp: Checkpoint, id: string): ScrollMotionRecord {
  const found = cp.scrollMotion.find((r) => r.id === id);
  if (!found) throw new Error(`no ${id}; have ${cp.scrollMotion.map((r) => r.id).join(", ")}`);
  return found;
}

const settled = (label: string, ...steps: unknown[]) => [
  ...steps,
  { type: "waitForScrollSettled" },
  { type: "capture", label },
];
const feedTo1200 = { type: "scrollTo", target: 1200, selector: "[data-testid=feed]" };
const nextSlide = { type: "click", selector: "[data-testid=next]" };
const send = { type: "click", selector: "[data-testid=send]" };

describe(`native scroll containers: recording (${TEST_BROWSER})`, () => {
  it("records a container scrolled by a scrollTo step, from rest to its destination", async () => {
    const { bundle } = await capture(settled("scrolled", feedTo1200));
    expect(bundle.settings.scrollContainers).toBe(true);
    const cp = checkpoint(bundle);
    // The document did not move: only the container is scroll motion.
    expect(cp.scrollMotion.map((r) => r.id)).toEqual(["native:test-id:feed:vertical"]);
    const feed = cp.scrollMotion[0]!;
    expect(feed).toMatchObject({
      source: "native",
      sessionId: "container",
      axis: "vertical",
      wrapper: { key: "test-id:feed", method: "test-id" },
      config: { scrollBehavior: "auto", scrollSnapType: "none" },
      completeness: { status: "complete", reasons: [] },
    });
    expect(feed.samples[0]).toMatchObject({ time: 0, animatedScroll: 0 });
    expect(feed.samples.at(-1)).toMatchObject({ animatedScroll: 1200, limit: 1700 });
    const metrics = scrollMetrics(feed, comparisonConfig());
    expect(metrics).toMatchObject({ start: 0, end: 1200, distance: 1200, unsettled: false });
    expect(metrics.duration!).toBeGreaterThan(50);
    expect(cp.window.trigger).toMatchObject({ type: "scroll-motion", event: "scroll" });
    // The card fades in when it enters the feed, while the feed scrolls.
    const card = cp.animations.find((a) => a.element.key === "test-id:card");
    expect(card).toBeDefined();
    expect(cp.correlations).toContainEqual(
      expect.objectContaining({ scroll: feed.id, animation: card!.id, kind: "overlap" }),
    );
  });

  it("scrolls the container under the pointer with a wheel step over it", async () => {
    const cp = checkpoint(
      (
        await capture(
          settled("wheel", {
            type: "wheel",
            deltaY: 600,
            steps: 6,
            selector: "[data-testid=feed]",
          }),
        )
      ).bundle,
    );
    expect(cp.scrollMotion.map((r) => r.id)).toEqual(["native:test-id:feed:vertical"]);
    const feed = cp.scrollMotion[0]!;
    expect(feed.samples[0]!.animatedScroll).toBe(0);
    expect(feed.samples.at(-1)!.animatedScroll).toBe(600);
    expect(cp.window.trigger).toMatchObject({ type: "scroll-motion", event: "wheel" });
  });

  it("records motion the page starts in a container, from where it rested before the click", async () => {
    const cp = checkpoint((await capture(settled("next", nextSlide))).bundle);
    const carousel = scroller(cp, "native:test-id:carousel:horizontal");
    expect(carousel).toMatchObject({
      axis: "horizontal",
      config: { scrollSnapType: "x mandatory" },
      completeness: { status: "complete" },
    });
    expect(carousel.samples[0]).toMatchObject({ time: 0, animatedScroll: 0 });
    expect(carousel.samples.at(-1)!.animatedScroll).toBe(400);
    expect(carousel.samples.length).toBeGreaterThan(2);
    expect(cp.window.trigger).toMatchObject({ type: "click", event: "click" });
  });

  it("starts from rest when the container only begins to overflow during the window", async () => {
    // "send" appends messages to a chat log that fitted until then, and scrolls to its end.
    const cp = checkpoint((await capture(settled("sent", send))).bundle);
    const chat = scroller(cp, "native:test-id:chat:vertical");
    expect(chat.completeness).toEqual({ status: "complete", reasons: [] });
    expect(chat.samples[0]).toMatchObject({ time: 0, animatedScroll: 0 });
    expect(chat.samples.at(-1)).toMatchObject({ animatedScroll: 250, limit: 250 });
  });

  it("records each container a scenario scrolls in its own checkpoint", async () => {
    const { bundle } = await capture([
      ...settled("feed", feedTo1200),
      ...settled("carousel", nextSlide),
    ]);
    expect(checkpoint(bundle, 0).scrollMotion.map((r) => r.id)).toEqual([
      "native:test-id:feed:vertical",
    ]);
    // The feed rests at 1200 now; only the carousel moved in the second window.
    expect(checkpoint(bundle, 1).scrollMotion.map((r) => r.id)).toEqual([
      "native:test-id:carousel:horizontal",
    ]);
  });

  it("treats an instant scroll step in a container as a state change, not scroll motion", async () => {
    const cp = checkpoint(
      (
        await capture([
          { type: "scroll", y: 500, selector: "[data-testid=feed]" },
          { type: "wait", duration: 100 },
          { type: "capture", label: "jumped" },
        ])
      ).bundle,
    );
    expect(cp.scrollMotion).toEqual([]);
  });

  it("skips containers matching ignore.selectors", async () => {
    const cp = checkpoint(
      (
        await capture(settled("ignored", feedTo1200, nextSlide), {
          ignore: { selectors: ["[data-testid=feed]"] },
        })
      ).bundle,
    );
    expect(cp.scrollMotion.map((r) => r.id)).toEqual(["native:test-id:carousel:horizontal"]);
  });

  it("records the document scroller only with capture.scrollContainers: false", async () => {
    const { bundle } = await capture(settled("off", feedTo1200), {
      capture: {
        samples: 6,
        waitForNetworkIdle: false,
        frames: { enabled: false },
        scrollContainers: false,
      },
    });
    expect(bundle.settings.scrollContainers).toBe(false);
    expect(checkpoint(bundle).scrollMotion).toEqual([]);
  });
});

describe(`native scroll containers: wheel over an element (${TEST_BROWSER})`, () => {
  it("fails the step when the element is outside the viewport or under another element", async () => {
    const failure = async (selector: string) => {
      const { bundle } = await capture([
        { type: "wheel", deltaY: 100, selector },
        { type: "capture", label: "never" },
      ]);
      const scenario = bundle.scenarios[0]!;
      expect(scenario.status).toBe("failed");
      return scenario.error!.message;
    };
    expect(await failure("[data-testid=below]")).toMatch(
      /wheel: \[data-testid=below\] is outside the viewport at \(\d+, \d+\)\. Bring it into view first/,
    );
    expect(await failure("[data-testid=covered]")).toMatch(
      /wheel: \[data-testid=covered\] is covered by div \(overlay\) at \(\d+, \d+\)/,
    );
  });
});

describe(`native scroll containers: comparison (${TEST_BROWSER})`, () => {
  const scenario = [...settled("feed", feedTo1200), ...settled("carousel", nextSlide)];

  it("finds no scroll difference between two runs of one build", async () => {
    const a = await capture(scenario);
    const b = await capture(scenario);
    const result = await compareCaptures({
      baseline: a,
      candidate: b,
      config: comparisonConfig(),
    });
    const scroll = result.differences.filter((d) => d.category === "scroll");
    if (TEST_BROWSER === "firefox") {
      // Firefox animates smooth scrolling off the main thread and its positions reach the page
      // up to a frame late: the easing curve and peak velocity of two runs differ (up to 19% and
      // 73% in these tests), which is uncertain. Positions, duration and settling agree.
      expect(scroll.every((d) => d.severity === "uncertain")).toBe(true);
      expect(scroll.every((d) => /reached the page unevenly/.test(d.detail))).toBe(true);
    } else {
      expect(scroll).toEqual([]);
    }
    expect(
      result.differences
        .filter((d) => d.severity !== "info" && d.severity !== "uncertain")
        .map((d) => d.title),
    ).toEqual([]);
  });

  it("reports where a container's scroll now ends and its changed snapping", async () => {
    const before = await capture(scenario);
    // The carousel now moves two slides per click and no longer snaps.
    const after = await capture(scenario, { path: "/containers.html?step=800&snap=none" });
    const result = await compareCaptures({
      baseline: before,
      candidate: after,
      config: comparisonConfig(),
    });
    const carousel = result.differences.filter(
      (d) => d.scrollKey === "native:test-id:carousel:horizontal",
    );
    expect(carousel.map((d) => d.detail)).toContain("Scroll target 400px → 800px (+400px)");
    expect(carousel).toContainEqual(
      expect.objectContaining({
        severity: "info",
        detail: "Scroll setting scrollSnapType: x mandatory → none",
      }),
    );
    expect(
      result.differences.filter(
        (d) => d.scrollKey === "native:test-id:feed:vertical" && d.severity !== "uncertain",
      ),
    ).toEqual([]);
  });

  it("is uncertain, not a regression, against a baseline made without container recording", async () => {
    const current = await capture(scenario);
    // What a 0.3.0-alpha baseline of the same build looks like: no container records.
    const old = structuredClone(current.bundle);
    old.settings.scrollContainers = false;
    for (const cp of old.scenarios[0]!.checkpoints) cp.scrollMotion = [];
    const result = await compareCaptures({
      baseline: { bundle: old, dir: current.dir },
      candidate: current,
      config: comparisonConfig(),
    });
    const scroll = result.differences.filter((d) => d.category === "scroll");
    expect(scroll.map((d) => [d.severity, d.title])).toEqual([
      ["uncertain", "New native scroll motion (native:test-id:feed:vertical)"],
      ["uncertain", "New native scroll motion (native:test-id:carousel:horizontal)"],
    ]);
  });
});
