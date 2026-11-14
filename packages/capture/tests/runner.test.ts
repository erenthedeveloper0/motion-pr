import { describe, expect, it } from "vitest";
import { resolveConfig, type RawAnimation, type RawSample } from "@motionpr/core";
import {
  describeStep,
  frameTimes,
  normalizeAnimations,
  pngSize,
  selectScenarios,
} from "../src/index.ts";
import { errorMessage } from "../src/runner.ts";

describe("frameTimes", () => {
  it("covers the window at the requested fps and always includes the end", () => {
    const { times, interval } = frameTimes(500, 30, 90);
    expect(interval).toBeCloseTo(33.333, 2);
    expect(times[0]).toBe(0);
    expect(times.at(-1)).toBe(500);
    expect(times).toHaveLength(16);
  });

  it("widens the interval to respect maxFrames", () => {
    const { times, interval } = frameTimes(6000, 30, 61);
    expect(interval).toBe(100);
    expect(times).toHaveLength(61);
  });

  it("returns a single frame for empty windows", () => {
    expect(frameTimes(0, 30, 90)).toEqual({ times: [0], interval: 0 });
  });
});

describe("describeStep", () => {
  it("never includes fill values", () => {
    expect(describeStep({ type: "fill", selector: "#password", value: "hunter2" })).toBe(
      "fill #password (value hidden)",
    );
  });

  it("describes every step type", () => {
    expect(describeStep({ type: "scroll", y: 400 })).toBe("scroll to y=400");
    expect(describeStep({ type: "capture", label: "open" })).toBe('capture "open"');
    expect(describeStep({ type: "waitFor", selector: ".x" })).toBe("wait for .x (visible)");
  });
});

describe("selectScenarios", () => {
  const config = resolveConfig({
    baseURL: "http://localhost:3000",
    scenarios: [{ id: "nav-open" }, { id: "nav-close" }, { id: "modal" }],
  });

  it("matches ids exactly, by glob, and comma lists", () => {
    expect(selectScenarios(config, ["modal"]).map((s) => s.id)).toEqual(["modal"]);
    expect(selectScenarios(config, ["nav-*"]).map((s) => s.id)).toEqual(["nav-open", "nav-close"]);
    expect(selectScenarios(config, ["modal,nav-open"]).map((s) => s.id)).toEqual([
      "nav-open",
      "modal",
    ]);
    expect(selectScenarios(config, undefined)).toHaveLength(3);
  });

  it("lists available scenarios when nothing matches", () => {
    expect(() => selectScenarios(config, ["nope"])).toThrow(/No scenario matches nope/);
  });
});

describe("errorMessage", () => {
  it("redacts fill values (raw and JSON-escaped) and strips ANSI codes", () => {
    const err = new Error('\u001b[31mlocator.fill\u001b[39m: failed\n  - fill("p\\"w")\n  - p"w');
    const message = errorMessage(err, ['p"w']);
    expect(message).not.toContain('p"w');
    expect(message).not.toContain('p\\"w');
    expect(message).toContain("<redacted>");
    expect(message).not.toContain("\u001b");
  });
});

describe("pngSize", () => {
  it("reads dimensions from the IHDR chunk", () => {
    const header = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 5,
      160, 0, 0, 3, 132,
    ]);
    expect(pngSize(header)).toEqual({ width: 1440, height: 900 });
    expect(pngSize(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe("normalizeAnimations", () => {
  const raw = (over: Partial<RawAnimation> = {}): RawAnimation => ({
    uid: "n1",
    type: "css-animation",
    source: "native",
    driver: "css",
    provenance: {},
    parent: null,
    easingKind: null,
    easingSamplesSource: null,
    progressTrace: [],
    name: "rise",
    element: {
      key: "test-id:card",
      method: "test-id",
      confidence: "high",
      selector: "[data-testid=card]",
      tag: "div",
      warnings: [],
    },
    startTime: 16.7,
    timing: {
      duration: 300,
      delay: 0,
      endDelay: 0,
      iterations: 1,
      iterationStart: 0,
      direction: "normal",
      fill: "both",
      easing: "linear",
      playbackRate: 1,
      activeDuration: 300,
      endTime: 300,
    },
    keyframes: [
      {
        offset: 0,
        easing: "ease-out",
        composite: "auto",
        values: { opacity: "0", transform: "translateY(20px)" },
      },
      {
        offset: 1,
        easing: "ease-out",
        composite: "auto",
        values: { opacity: "1", transform: "none" },
      },
    ],
    properties: ["opacity", "transform"],
    easingSamples: null,
    timeline: "document",
    playState: "finished",
    group: null,
    meta: {},
    notes: [],
    samplable: true,
    ...over,
  });
  const sample = (t: number, opacity: string, ty: number): RawSample => ({
    t,
    local: t,
    values: { opacity, transform: `matrix(1, 0, 0, 1, 0, ${ty})` },
    box: { x: 0, y: ty, width: 10, height: 10 },
    iterationProgress: t / 300,
  });

  it("derives uniform keyframe easing as the effective segment easing and decomposes transforms", () => {
    const [record] = normalizeAnimations(
      [raw()],
      [[sample(0, "0", 20), sample(299.99, "1", 0)]],
      [],
      2,
    );
    expect(record!.id).toBe("test-id:card::css-animation::rise");
    expect(record!.timing.effectiveEasing).toMatchObject({
      value: "ease-out",
      scope: "segment",
      kind: "css",
    });
    expect(record!.timing.keyframeEasings).toEqual(["ease-out", "ease-out"]);
    expect(record!.samples[0]!.numeric).toMatchObject({ opacity: 0, translateY: 20 });
    expect(record!.properties.find((p) => p.property === "opacity")).toMatchObject({
      from: "0",
      to: "1",
    });
    expect(record!.completeness.status).toBe("complete");
  });

  it("marks mixed keyframe easings as per-keyframe", () => {
    const mixed = raw({
      keyframes: [
        { offset: 0, easing: "ease-in", composite: "auto", values: { opacity: "0" } },
        { offset: 0.5, easing: "linear", composite: "auto", values: { opacity: "0.5" } },
        { offset: 1, easing: "ease", composite: "auto", values: { opacity: "1" } },
      ],
      properties: ["opacity"],
    });
    const [record] = normalizeAnimations([mixed], [[]], [], 2);
    expect(record!.timing.effectiveEasing).toMatchObject({
      value: "per-keyframe",
      kind: "per-keyframe",
    });
    expect(record!.completeness.status).toBe("metadata-only");
  });

  it("suffixes duplicate ids and keeps adapter easing samples", () => {
    const gsap = raw({
      source: "gsap",
      type: "gsap",
      name: "hero",
      keyframes: [],
      timing: { ...raw().timing, easing: "power2.out" },
      easingSamples: [0, 0.5, 1],
    });
    const records = normalizeAnimations([gsap, gsap], [[], []], [], 2);
    expect(records.map((r) => r.id)).toEqual([
      "test-id:card::gsap::hero",
      "test-id:card::gsap::hero#2",
    ]);
    expect(records[0]!.timing.easing).toMatchObject({
      value: "power2.out",
      kind: "gsap",
      samples: [0, 0.5, 1],
    });
  });

  it("links samples to the nearest filmstrip frame", () => {
    const frames = [
      { index: 0, time: 0, asset: "a.png" },
      { index: 1, time: 33.3, asset: "b.png" },
    ];
    const [record] = normalizeAnimations(
      [raw()],
      [[sample(0, "0", 20), sample(30, "0.1", 18)]],
      frames,
      2,
    );
    expect(record!.samples.map((s) => s.frame)).toEqual(["a.png", "b.png"]);
  });
});
