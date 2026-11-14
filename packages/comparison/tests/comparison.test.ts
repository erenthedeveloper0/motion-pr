import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { comparisonResultSchema } from "@motionpr/core";
import {
  compareCaptures,
  compareMatchedAnimation,
  compareStagger,
  diffImages,
  exitCodeFor,
  matchAnimations,
  staggerIntervals,
  timingSeverity,
} from "../src/index.ts";
import { anim, bundle, checkpoint, config, scenario } from "./helpers.ts";

const pair = (b: ReturnType<typeof anim>, c: ReturnType<typeof anim>, cfg = config()) =>
  compareMatchedAnimation(
    { baseline: b, candidate: c, method: "exact", confidence: "high", notes: [] },
    cfg,
  );

const kinds = (cmp: ReturnType<typeof pair>) => cmp.changes.map((c) => c.kind);

describe("timingSeverity", () => {
  const cfg = config();
  it("follows the documented thresholds", () => {
    expect(timingSeverity(450, 450.5, cfg)).toBeNull();
    expect(timingSeverity(300, 320, cfg)).toBe("info"); // 20ms < 50ms absolute
    expect(timingSeverity(450, 700, cfg)).toBe("warning"); // +250ms, +56%
    expect(timingSeverity(100, 180, cfg)).toBe("warning"); // +80ms, +80%
    expect(timingSeverity(400, 800, cfg)).toBe("critical"); // doubled
    expect(timingSeverity(0, 120, cfg)).toBe("critical"); // from zero: infinite relative, beyond 50ms
    expect(timingSeverity(1000, 1100, cfg)).toBe("info"); // 10% < 15%
  });
});

describe("matchAnimations", () => {
  it("matches exactly, by element (rename), fuzzily, and reports the rest", () => {
    const b = [
      anim({ key: "test-id:a" }),
      anim({ key: "test-id:b", type: "css-animation", name: "fade" }),
      anim({ key: "test-id:old-id", type: "css-animation", name: "rise" }),
      anim({ key: "test-id:gone" }),
    ];
    b[2]!.element.label = "Sign up";
    const c = [
      anim({ key: "test-id:a" }),
      anim({ key: "test-id:b", type: "css-animation", name: "fade-in" }),
      anim({ key: "test-id:new-id", type: "css-animation", name: "rise" }),
      anim({ key: "test-id:fresh", type: "web-animation", name: null }),
    ];
    c[2]!.element.label = "Sign up";
    const result = matchAnimations(b, c);
    expect(result.matches.map((m) => [m.baseline.id, m.method])).toEqual([
      ["test-id:a::css-transition::transform", "exact"],
      ["test-id:b::css-animation::fade", "element"],
      ["test-id:old-id::css-animation::rise", "fuzzy"],
    ]);
    expect(result.matches[2]!.confidence).toBe("low");
    expect(result.removed.map((r) => r.id)).toEqual(["test-id:gone::css-transition::transform"]);
    expect(result.added.map((r) => r.id)).toEqual(["test-id:fresh::web-animation::anonymous"]);
  });

  it("is deterministic regardless of candidate order", () => {
    const b = [anim({ key: "test-id:a" }), anim({ key: "test-id:b" })];
    const c = [anim({ key: "test-id:b" }), anim({ key: "test-id:a" })];
    expect(matchAnimations(b, c).matches.map((m) => m.baseline.id)).toEqual(b.map((r) => r.id));
  });
});

describe("compareMatchedAnimation", () => {
  it("reports nothing for identical animations", () => {
    const cmp = pair(anim(), anim());
    expect(cmp.status).toBe("unchanged");
    expect(cmp.changes).toEqual([]);
  });

  it("measures duration and delay changes with deltas", () => {
    const cmp = pair(anim({ duration: 450, delay: 100 }), anim({ duration: 700, delay: 180 }));
    const duration = cmp.changes.find((c) => c.kind === "duration")!;
    expect(duration).toMatchObject({
      before: 450,
      after: 700,
      delta: 250,
      unit: "ms",
      severity: "warning",
      measurement: "measured",
    });
    expect(duration.message).toBe("Duration 450ms → 700ms (+250ms, +55.56%)");
    expect(cmp.changes.find((c) => c.kind === "delay")).toMatchObject({
      before: 100,
      after: 180,
      delta: 80,
      severity: "warning",
    });
  });

  it("treats start-time changes as frame-quantized estimates within tolerance", () => {
    expect(kinds(pair(anim({ start: 0 }), anim({ start: 16.7 })))).not.toContain("start");
    const cmp = pair(anim({ start: 0 }), anim({ start: 120 }));
    expect(cmp.changes.find((c) => c.kind === "start")).toMatchObject({
      measurement: "estimated",
      severity: "warning",
      delta: 120,
    });
  });

  it("compares easing curves numerically and flags overshoot", () => {
    const same = pair(
      anim({ easing: "ease" }),
      anim({ easing: "cubic-bezier(0.25, 0.1, 0.25, 1)" }),
    );
    expect(kinds(same)).not.toContain("easing");
    expect(same.easing?.maxDeviation).toBe(0);

    const cmp = pair(
      anim({ easing: "ease-out" }),
      anim({ easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" }),
    );
    const easing = cmp.changes.find((c) => c.kind === "easing")!;
    expect(easing.severity).toBe("warning");
    expect(easing.message).toMatch(/now overshoots/);
    expect(cmp.easing!.maxDeviation).toBeGreaterThan(0.1);
  });

  it("detects property set and end-value changes", () => {
    const cmp = pair(
      anim({ props: ["transform"], translateX: [0, 0] }),
      anim({ props: ["transform", "opacity"], translateX: [0, 80], opacity: [0, 1] }),
    );
    expect(cmp.changes.find((c) => c.kind === "property-added")).toMatchObject({
      property: "opacity",
    });
    const traj = cmp.changes.find(
      (c) => c.kind === "trajectory" && c.property === "translateX (end)",
    )!;
    expect(traj).toMatchObject({
      before: 0,
      after: 80,
      delta: 80,
      unit: "px",
      severity: "warning",
    });
    expect(traj.message).toBe("translateX at end: 0px → 80px (+80px)");
  });

  it("ignores sub-pixel layout noise", () => {
    expect(pair(anim({ translateX: [0, 200] }), anim({ translateX: [0, 201] })).changes).toEqual(
      [],
    );
  });

  it("downgrades changes on DOM-path matches to uncertain", () => {
    const cmp = pair(
      anim({ confidence: "low", duration: 300 }),
      anim({ confidence: "low", duration: 600 }),
    );
    expect(cmp.changes[0]).toMatchObject({ kind: "duration", severity: "uncertain" });
    expect(cmp.changes[0]!.message).toMatch(/DOM position/);
    const trusted = pair(
      anim({ confidence: "low", duration: 300 }),
      anim({ confidence: "low", duration: 600 }),
      config({ uncertainOnLowConfidence: false }),
    );
    expect(trusted.changes[0]!.severity).toBe("critical");
  });

  it("marks sample-based changes as incomplete when capture data is partial", () => {
    const cmp = pair(
      anim({ completeness: "partial", translateX: [0, 0] }),
      anim({ translateX: [0, 60] }),
    );
    expect(cmp.changes.find((c) => c.kind === "trajectory")!.measurement).toBe("incomplete");
    expect(cmp.changes.find((c) => c.kind === "completeness")!.severity).toBe("uncertain");
  });

  it("applies severity overrides and disables rules", () => {
    const cfg = config({ severity: { easing: "critical", duration: "off" } });
    const cmp = pair(
      anim({ easing: "ease-out", duration: 300 }),
      anim({ easing: "linear", duration: 900 }),
      cfg,
    );
    expect(kinds(cmp)).not.toContain("duration");
    expect(cmp.changes.find((c) => c.kind === "easing")!.severity).toBe("critical");
  });

  it("flags infinite/finite iteration flips as critical", () => {
    const cmp = pair(anim({ iterations: 1 }), anim({ iterations: "infinite" }));
    expect(cmp.changes.find((c) => c.kind === "iterations")!.severity).toBe("critical");
  });
});

describe("stagger", () => {
  const cards = (interval: number) =>
    Array.from({ length: 5 }, (_, i) =>
      anim({
        key: `test-id:card-${i + 1}`,
        type: "web-animation",
        name: "reveal",
        delay: i * interval,
      }),
    );

  it("computes the median interval for sibling families", () => {
    expect([...staggerIntervals(cards(60)).values()]).toEqual([{ interval: 60, members: 5 }]);
  });

  it("reports stagger interval changes", () => {
    const changes = compareStagger(cards(60), cards(110), config());
    expect(changes).toEqual([
      expect.objectContaining({
        baselineInterval: 60,
        candidateInterval: 110,
        delta: 50,
        members: 5,
        severity: "warning",
      }),
    ]);
  });
});

describe("compareCaptures", () => {
  const source = (b: ReturnType<typeof bundle>) => ({ dir: "/nonexistent", bundle: b });

  it("produces a schema-valid result with flattened differences", async () => {
    const b = bundle([
      scenario("menu", [
        checkpoint("open", [anim({ duration: 300 }), anim({ key: "test-id:gone" })]),
      ]),
    ]);
    const c = bundle([
      scenario("menu", [
        checkpoint("open", [
          anim({ duration: 520 }),
          anim({ key: "test-id:new", type: "web-animation", name: "pop" }),
        ]),
      ]),
    ]);
    const result = await compareCaptures({
      baseline: source(b),
      candidate: source(c),
      config: config(),
    });
    expect(() => comparisonResultSchema.parse(result)).not.toThrow();
    expect(result.summary.counts).toMatchObject({ critical: 1, warning: 2 });
    expect(result.summary.animations).toEqual({
      matched: 1,
      changed: 1,
      added: 1,
      removed: 1,
      unchanged: 0,
    });
    expect(result.differences[0]).toMatchObject({
      severity: "critical",
      category: "removed",
      animationKey: "test-id:gone::css-transition::transform",
    });
    expect(result.summary.status).toBe("failed");
    expect(exitCodeFor(result)).toBe(1);
    expect(new Set(result.differences.map((d) => d.id)).size).toBe(result.differences.length);
  });

  it("honours failOn thresholds and failOnUncertain", async () => {
    const b = bundle([scenario("s", [checkpoint("x", [anim({ duration: 300 })])])]);
    const c = bundle([scenario("s", [checkpoint("x", [anim({ duration: 520 })])])]);
    const run = (cfg: Record<string, unknown>) =>
      compareCaptures({ baseline: source(b), candidate: source(c), config: config(cfg) });
    expect(exitCodeFor(await run({ failOn: "critical" }))).toBe(0);
    expect(exitCodeFor(await run({ failOn: "warning" }))).toBe(1);
    expect(exitCodeFor(await run({ failOn: "never" }))).toBe(0);

    const lowB = bundle([
      scenario("s", [checkpoint("x", [anim({ duration: 300, confidence: "low" })])]),
    ]);
    const lowC = bundle([
      scenario("s", [checkpoint("x", [anim({ duration: 900, confidence: "low" })])]),
    ]);
    const uncertain = await compareCaptures({
      baseline: source(lowB),
      candidate: source(lowC),
      config: config({ failOn: "warning" }),
    });
    expect(uncertain.summary.counts.uncertain).toBeGreaterThan(0);
    expect(exitCodeFor(uncertain)).toBe(0);
    const strict = await compareCaptures({
      baseline: source(lowB),
      candidate: source(lowC),
      config: config({ failOn: "warning", failOnUncertain: true }),
    });
    expect(exitCodeFor(strict)).toBe(1);
  });

  it("reports structural changes: failed, removed and added scenarios and checkpoints", async () => {
    const b = bundle([
      scenario("a", [checkpoint("one", []), checkpoint("two", [])]),
      scenario("b", []),
      scenario("gone", []),
    ]);
    const c = bundle([
      scenario("a", [checkpoint("one", []), checkpoint("three", [])]),
      scenario("b", [], { status: "failed", error: { message: "Step 1 failed" } }),
      scenario("new", []),
    ]);
    const result = await compareCaptures({
      baseline: source(b),
      candidate: source(c),
      config: config(),
    });
    expect(result.scenarios.map((s) => `${s.id}:${s.status}`)).toEqual([
      "a:changed",
      "b:failed",
      "gone:removed",
      "new:added",
    ]);
    const titles = result.differences.map((d) => `${d.severity}:${d.title}`);
    expect(titles).toContain("critical:Scenario failed: b");
    expect(titles).toContain("critical:Scenario removed: gone");
    expect(titles).toContain("critical:Checkpoint “two” missing");
    expect(titles).toContain("warning:New checkpoint “three”");
    expect(titles).toContain("info:New scenario: new");
  });

  it("compares trigger latency per checkpoint", async () => {
    const b = bundle([
      scenario("s", [
        checkpoint("x", [anim()], {
          window: { origin: "trigger", latency: 16, end: 400, capped: false },
        }),
      ]),
    ]);
    const c = bundle([
      scenario("s", [
        checkpoint("x", [anim()], {
          window: { origin: "trigger", latency: 316, end: 400, capped: false },
        }),
      ]),
    ]);
    const result = await compareCaptures({
      baseline: source(b),
      candidate: source(c),
      config: config(),
    });
    expect(result.scenarios[0]!.checkpoints[0]!.latency).toEqual({
      baseline: 16,
      candidate: 316,
      delta: 300,
    });
    expect(result.differences[0]!.title).toBe("Motion begins 300ms later after the interaction");
  });

  it("warns about environment differences", async () => {
    const b = bundle([]);
    const c = bundle([], {
      environment: {
        ...b.environment,
        platform: "darwin",
        browser: { ...b.environment.browser, version: "159" },
      },
    });
    const result = await compareCaptures({
      baseline: source(b),
      candidate: source(c),
      config: config(),
    });
    expect(result.diagnostics.map((d) => d.code)).toEqual([
      "BROWSER_VERSION_DIFFERS",
      "PLATFORM_DIFFERS",
    ]);
  });
});

describe("diffImages", () => {
  const image = (fill: (x: number, y: number) => [number, number, number]) => {
    const png = new PNG({ width: 20, height: 10 });
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 20; x++) {
        const i = (y * 20 + x) * 4;
        const [r, g, b] = fill(x, y);
        png.data[i] = r;
        png.data[i + 1] = g;
        png.data[i + 2] = b;
        png.data[i + 3] = 255;
      }
    }
    return png;
  };
  const white = image(() => [255, 255, 255]);
  const marked = image((x) => (x < 5 ? [0, 0, 0] : [255, 255, 255]));

  it("counts differing pixels and writes a diff image", () => {
    const out = diffImages(white, marked, config(), { output: true, scale: 1 })!;
    expect(out.mismatch).toBe(50);
    expect(out.total).toBe(200);
    expect(PNG.sync.read(out.diffPng!).width).toBe(20);
  });

  it("excludes ignore regions", () => {
    const cfg = config({ visual: { ignoreRegions: [{ x: 0, y: 0, width: 5, height: 10 }] } });
    expect(diffImages(white, marked, cfg, { output: false, scale: 1 })!.mismatch).toBe(0);
  });

  it("returns null for different sizes", () => {
    expect(
      diffImages(white, new PNG({ width: 10, height: 10 }), config(), { output: false, scale: 1 }),
    ).toBeNull();
  });
});
