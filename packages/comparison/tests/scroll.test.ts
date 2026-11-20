import { describe, expect, it } from "vitest";
import {
  resolveConfig,
  type ScrollLink,
  type ScrollMotionRecord,
  type TimelineRecord,
} from "@motionpr/core";
import { compareScrollRecords, compareTimelineRecords, scrollMetrics } from "../src/index.ts";

const config = resolveConfig({ baseURL: "http://x", scenarios: [{ id: "x" }] }).comparison;

/** Lenis-like lerp scroll from `from` to `to`, one sample per frame starting at `t0`. */
function lerpScroll(
  to: number,
  {
    from = 0,
    lerp = 0.1,
    frame = 16.667,
    t0 = 0,
    overshoot = 0,
    source = "lenis" as "lenis" | "native",
  } = {},
): ScrollMotionRecord {
  const samples: ScrollMotionRecord["samples"] = [];
  let pos = from;
  let t = t0;
  const goal = to + overshoot;
  samples.push(sample(t, pos, to));
  for (let i = 0; i < 400; i++) {
    t += frame;
    const target = i < 30 ? goal : to;
    pos += (target - pos) * lerp;
    if (Math.abs(to - pos) < 0.5 && i >= 30) pos = to;
    samples.push(sample(t, Math.round(pos * 1000) / 1000, to));
    if (pos === to) break;
  }
  samples.push(sample(t + 200, to, to));
  return {
    id: `${source}:window:vertical`,
    source,
    sessionId: "main",
    axis: "vertical",
    wrapper: null,
    config: { lerp },
    samples,
    events: samples.length,
    prefersReducedMotion: false,
    completeness: { status: "complete", reasons: [] },
    meta: {},
  };
}

function sample(time: number, pos: number, target: number) {
  return {
    time,
    actualScroll: Math.round(pos),
    animatedScroll: pos,
    targetScroll: target,
    progress: pos / 3000,
    velocity: 0,
    direction: 1,
    isScrolling: "smooth" as const,
    isStopped: false,
    limit: 3000,
  };
}

describe("scrollMetrics", () => {
  it("derives distance, duration, peak velocity and the normalized curve", () => {
    const m = scrollMetrics(lerpScroll(1200), config);
    expect(m).toMatchObject({
      start: 0,
      end: 1200,
      target: 1200,
      distance: 1200,
      unsettled: false,
    });
    expect(m.duration!).toBeGreaterThan(500);
    expect(m.peakVelocity).toBeGreaterThan(5);
    expect(m.peakVelocityAt!).toBeLessThan(0.1); // lerp scrolls are fastest at the start
    expect(m.curve).toHaveLength(33);
    expect(m.curve![0]).toBe(0);
    expect(m.curve!.at(-1)).toBe(1);
    expect(m.overshoot).toBe(0);
  });

  it("measures overshoot and direction changes", () => {
    const m = scrollMetrics(lerpScroll(1200, { overshoot: 200 }), config);
    expect(m.overshoot).toBeGreaterThan(20);
    expect(m.directionChanges).toBe(1);
  });

  it("reports no movement for a still scroller", () => {
    const r = lerpScroll(0);
    const m = scrollMetrics(r, config);
    expect(m.duration).toBeNull();
    expect(m.curve).toBeNull();
  });

  it("flags a scroller still moving at the end of the window as unsettled", () => {
    const r = lerpScroll(1200);
    r.samples = r.samples.slice(0, 20);
    expect(scrollMetrics(r, config).unsettled).toBe(true);
  });
});

describe("compareScrollRecords", () => {
  it("ignores browser scheduling noise: time offsets and frame jitter", () => {
    const b = lerpScroll(1200);
    const c = lerpScroll(1200, { t0: 23, frame: 16.9 });
    const [cmp] = compareScrollRecords([b], [c], config);
    expect(cmp!.status).toBe("unchanged");
    expect(cmp!.changes).toEqual([]);
  });

  it("detects a slower lerp as a longer scroll with a different curve and velocity", () => {
    const [cmp] = compareScrollRecords(
      [lerpScroll(1200)],
      [lerpScroll(1200, { lerp: 0.05 })],
      config,
    );
    const kinds = cmp!.changes.map((c) => c.kind);
    expect(kinds).toContain("scroll-duration");
    expect(kinds).toContain("scroll-velocity");
    expect(kinds).toContain("scroll-config");
    expect(cmp!.severity).toBe("warning");
  });

  it("detects a new overshoot", () => {
    const [cmp] = compareScrollRecords(
      [lerpScroll(1200)],
      [lerpScroll(1200, { overshoot: 200 })],
      config,
    );
    expect(cmp!.changes.find((c) => c.kind === "scroll-overshoot")).toMatchObject({
      severity: "warning",
    });
  });

  it("detects a different destination once (target explains the end)", () => {
    const [cmp] = compareScrollRecords([lerpScroll(1200)], [lerpScroll(1500)], config);
    const positions = cmp!.changes.filter((c) => c.rule === "scroll-position");
    expect(positions.map((c) => c.kind)).toEqual(["scroll-target"]);
  });

  it("pairs a Lenis record with a native one on the same scroller and reports the engine change", () => {
    const [cmp] = compareScrollRecords(
      [lerpScroll(1200)],
      [lerpScroll(1200, { source: "native" })],
      config,
    );
    expect(cmp!.status).toBe("changed");
    expect(cmp!.changes[0]).toMatchObject({
      kind: "scroll-config",
      before: "lenis",
      after: "native",
    });
  });

  it("reports added and removed scrollers", () => {
    const out = compareScrollRecords([lerpScroll(1200)], [], config);
    expect(out[0]!.status).toBe("removed");
    const added = compareScrollRecords([], [lerpScroll(1200)], config);
    expect(added[0]!.status).toBe("added");
  });

  it("respects severity overrides", () => {
    const off = {
      ...config,
      severity: {
        "scroll-duration": "off" as const,
        "scroll-velocity": "off" as const,
        "scroll-curve": "off" as const,
      },
    };
    const [cmp] = compareScrollRecords([lerpScroll(1200)], [lerpScroll(1200, { lerp: 0.05 })], off);
    expect(
      cmp!.changes.filter((c) =>
        ["scroll-duration", "scroll-velocity", "scroll-curve"].includes(c.rule),
      ),
    ).toEqual([]);
  });
});

describe("compareTimelineRecords", () => {
  const tl = (over: Partial<TimelineRecord> = {}): TimelineRecord => ({
    id: "gsap:hero",
    source: "gsap",
    name: "hero",
    startTime: 0,
    duration: 1000,
    iterations: 1,
    direction: "normal",
    playbackRate: 1,
    playState: "finished",
    progress: 1,
    labels: [
      { name: "intro", time: 0 },
      { name: "cards", time: 400 },
    ],
    children: ["a", "b"],
    provenance: {},
    notes: [],
    meta: {},
    ...over,
  });

  it("finds no change for identical timelines", () => {
    expect(compareTimelineRecords([tl()], [tl()], config)[0]!.changes).toEqual([]);
  });

  it("reports duration, label moves, reordering, and added/removed labels", () => {
    const [cmp] = compareTimelineRecords(
      [tl()],
      [
        tl({
          duration: 1400,
          labels: [
            { name: "cards", time: 0 },
            { name: "intro", time: 500 },
            { name: "outro", time: 900 },
          ],
        }),
      ],
      config,
    );
    const messages = cmp!.changes.map((c) => c.message);
    expect(messages.some((m) => /duration 1000ms → 1400ms/.test(m))).toBe(true);
    expect(messages.some((m) => /“intro” moved 0ms → 500ms/.test(m))).toBe(true);
    expect(messages.some((m) => /reordered: intro → cards became cards → intro/.test(m))).toBe(
      true,
    );
    expect(messages.some((m) => /“outro” added/.test(m))).toBe(true);
  });
});

describe("scroll-linked progress", () => {
  it("compares ScrollTrigger-style progress at the same scroll position", async () => {
    const { scrollLinkedChange } = await import("../src/scroll-linked.ts");
    const { anim } = await import("./helpers.ts");
    const scroll = lerpScroll(1200);
    // Progress = scroll / 1200 in the baseline; the candidate starts later (trigger moved).
    const trace = (offset: number) =>
      scroll.samples.map((s) => ({
        time: s.time,
        progress: Math.min(1, Math.max(0, (s.animatedScroll - offset) / (1200 - offset))),
      }));
    const b = { ...anim({ type: "gsap" }), progressTrace: trace(0), timeline: "scroll" as const };
    const same = { ...b, progressTrace: trace(0) };
    const moved = { ...b, progressTrace: trace(400) };
    expect(scrollLinkedChange(b, same, [scroll], [scroll], config)).toBeNull();
    const change = scrollLinkedChange(b, moved, [scroll], [scroll], config);
    expect(change).toMatchObject({ kind: "scroll-progress", severity: "warning" });
    expect(change!.delta!).toBeGreaterThan(0.3);
  });
});

describe("scroll-linked positions", () => {
  const link = (over: Partial<ScrollLink> = {}): ScrollLink => ({
    start: 400,
    end: 1300,
    axis: "vertical",
    scroller: null,
    scrub: 0,
    toggleActions: null,
    ...over,
  });
  const linked = async (l: ScrollLink | undefined) => {
    const { anim } = await import("./helpers.ts");
    return {
      ...anim({ type: "gsap" }),
      startTime: null,
      timeline: "scroll" as const,
      ...(l ? { scrollLink: l } : {}),
    };
  };
  const changes = async (b: ScrollLink | undefined, c: ScrollLink | undefined) => {
    const { scrollLinkChanges } = await import("../src/scroll-linked.ts");
    return scrollLinkChanges(await linked(b), await linked(c), config);
  };

  it("finds nothing when the resolved positions and settings are equal", async () => {
    expect(await changes(link(), link())).toEqual([]);
    // Within positionTolerancePx (2px): subpixel layout differences are not changes.
    expect(await changes(link(), link({ start: 401.5, end: 1298.5 }))).toEqual([]);
  });

  it("reports a moved start or end with the scroll-position rule", async () => {
    const found = await changes(link(), link({ start: 550, end: 1310 }));
    expect(found).toEqual([
      {
        kind: "scroll-start",
        rule: "scroll-position",
        before: 400,
        after: 550,
        delta: 150,
        unit: "px",
        measurement: "measured",
        severity: "warning",
        message: "Starts at scroll position 400px → 550px (+150px)",
      },
      expect.objectContaining({
        kind: "scroll-end",
        // Below warnPositionPx (24px): informational.
        severity: "info",
        delta: 10,
        message: "Ends at scroll position 1300px → 1310px (+10px)",
      }),
    ]);
    expect((await changes(link(), link({ start: 300 })))![0]!.message).toBe(
      "Starts at scroll position 400px → 300px (-100px)",
    );
  });

  it("reports scrub and toggleActions changes as scroll settings", async () => {
    expect(await changes(link(), link({ scrub: 500 }))).toEqual([
      expect.objectContaining({
        kind: "scroll-config",
        rule: "scroll-curve",
        property: "scrub",
        before: 0,
        after: 500,
        delta: 500,
        severity: "info",
        message: "Scroll setting scrub: on → 500ms",
      }),
    ]);
    // Scrubbed → played once triggered changes what drives the animation.
    const triggered = link({ scrub: null, toggleActions: "play none none none" });
    expect(await changes(link(), triggered)).toEqual([
      expect.objectContaining({
        property: "scrub",
        severity: "warning",
        message: "Scroll setting scrub: on → off (plays once triggered)",
      }),
    ]);
    expect(
      await changes(triggered, { ...triggered, toggleActions: "play none none reverse" }),
    ).toEqual([
      expect.objectContaining({
        property: "toggleActions",
        severity: "info",
        message: "Scroll setting toggleActions: play none none none → play none none reverse",
      }),
    ]);
  });

  it("does not compare positions on different scrollers or axes", async () => {
    const found = await changes(link(), link({ scroller: "test-id:panel", start: 100 }));
    expect(found).toEqual([
      expect.objectContaining({
        kind: "scroll-config",
        property: "scroller",
        severity: "warning",
        message: "Scroll-linked to document → test-id:panel",
      }),
    ]);
    expect((await changes(link(), link({ axis: "horizontal" })))![0]!.message).toBe(
      "Scroll-linked to document → document (horizontal)",
    );
  });

  it("returns null when either capture has no resolved positions", async () => {
    expect(await changes(link(), undefined)).toBeNull();
    expect(await changes(undefined, link())).toBeNull();
  });

  describe("in a comparison", () => {
    // Progress traces that disagree at the same scroll position, as live recordings under native
    // smooth scrolling can between two runs of one build.
    const scroll = lerpScroll(1200);
    const trace = (offset: number) =>
      scroll.samples.map((s) => ({
        time: s.time,
        progress: Math.min(1, Math.max(0, (s.animatedScroll - offset) / (1200 - offset))),
      }));
    const run = async (b: ScrollLink | undefined, c: ScrollLink | undefined) => {
      const { bundle, checkpoint, scenario } = await import("./helpers.ts");
      const { compareCaptures } = await import("../src/index.ts");
      const side = async (l: ScrollLink | undefined, offset: number) =>
        bundle([
          scenario("s", [
            checkpoint("scrolled", [{ ...(await linked(l)), progressTrace: trace(offset) }], {
              scrollMotion: [scroll],
            }),
          ]),
        ]);
      const result = await compareCaptures({
        baseline: { bundle: await side(b, 0), dir: "." },
        candidate: { bundle: await side(c, 400), dir: "." },
        config: { ...config, visual: { ...config.visual, enabled: false } },
      });
      return result.differences.filter((d) => d.source === "gsap").map((d) => d.detail);
    };

    it("relies on resolved positions instead of live progress when both captures have them", async () => {
      expect(await run(link(), link())).toEqual([]);
      expect(await run(link(), link({ start: 550 }))).toEqual([
        "Starts at scroll position 400px → 550px (+150px)",
      ]);
    });

    it("falls back to progress at the same scroll position for captures without them", async () => {
      const found = await run(undefined, link());
      expect(found).toHaveLength(1);
      expect(found[0]).toMatch(/^Scroll-linked progress at the same scroll position differs/);
    });
  });
});

describe("scroll-linked values", () => {
  /**
   * A ScrollTrigger-style record sampled at scroll progress `lo`..`hi` (as the agent does: only
   * where the scroll went), writing translateY = `distance` × progress and a color.
   */
  async function scrollSampled(
    distance: number,
    [lo, hi]: [number, number],
    color = (p: number) => `rgb(${Math.round(255 * p)}, 0, 0)`,
  ) {
    const { anim } = await import("./helpers.ts");
    const base = anim({ type: "gsap", props: ["transform", "background-color"], samples: 11 });
    return {
      ...base,
      startTime: null,
      timeline: "scroll" as const,
      samples: base.samples.map((s, i) => {
        const p = lo + ((hi - lo) * i) / 10;
        return {
          ...s,
          scrollProgress: p,
          values: { "background-color": color(p) },
          numeric: { ...s.numeric, translateX: 0, translateY: distance * p },
        };
      }),
    };
  }
  const compare = async (
    b: Awaited<ReturnType<typeof scrollSampled>>,
    c: Awaited<ReturnType<typeof scrollSampled>>,
  ) => {
    const { compareMatchedAnimation } = await import("../src/diff-animation.ts");
    return compareMatchedAnimation(
      { baseline: b, candidate: c, method: "exact", confidence: "high", notes: [] },
      config,
    ).changes;
  };

  it("compares at equal progress, not by sample index, when the scrolls covered different ranges", async () => {
    // Same animation; the candidate's scroll began further in. By index, every sample differs.
    const changes = await compare(
      await scrollSampled(-120, [0, 1]),
      await scrollSampled(-120, [0.3, 1]),
    );
    expect(changes).toEqual([]);
  });

  it("reports a changed distance with the progress where it differs most", async () => {
    const changes = await compare(
      await scrollSampled(-120, [0, 0.8]),
      await scrollSampled(-240, [0.2, 1]),
    );
    expect(changes.map((c) => c.message)).toEqual([
      "Scroll-linked translateY differs by up to 96px at the same scroll progress (at 80%: -96px → -192px)",
    ]);
    expect(changes[0]).toMatchObject({
      kind: "trajectory",
      severity: "warning",
      before: -96,
      after: -192,
      delta: -96,
      measurement: "measured",
    });
  });

  it("reports other properties (colors) at equal progress", async () => {
    const changes = await compare(
      await scrollSampled(-120, [0, 1]),
      await scrollSampled(-120, [0, 1], (p) => `rgb(0, 0, ${Math.round(255 * p)})`),
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "keyframes", property: "background-color (scroll)" });
    expect(changes[0]!.message).toBe(
      "Scroll-linked background-color differs at the same scroll progress (at 100%: rgba(255, 0, 0, 1) → rgba(0, 0, 255, 1))",
    );
  });

  it("is uncertain when the two scrolls reached no common progress", async () => {
    const changes = await compare(
      await scrollSampled(-120, [0, 0.4]),
      await scrollSampled(-240, [0.6, 1]),
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "completeness", severity: "uncertain" });
    expect(changes[0]!.message).toMatch(
      /reached 0%–40% scroll progress in the baseline and 60%–100%/,
    );
  });

  it("does not compare values against a baseline captured before they were sampled", async () => {
    const { anim } = await import("./helpers.ts");
    const old = {
      ...anim({ type: "gsap", props: ["transform", "background-color"] }),
      startTime: null,
      timeline: "scroll" as const,
      samples: [],
      completeness: { status: "metadata-only" as const, reasons: ["metadata only"] },
    };
    const changes = await compare(old as never, await scrollSampled(-240, [0, 1]));
    expect(changes.map((c) => [c.kind, c.severity])).toEqual([["completeness", "uncertain"]]);
  });
});
