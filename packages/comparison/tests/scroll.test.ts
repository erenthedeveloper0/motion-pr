import { describe, expect, it } from "vitest";
import { resolveConfig, type ScrollMotionRecord, type TimelineRecord } from "@motionpr/core";
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
