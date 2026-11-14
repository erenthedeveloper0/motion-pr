import { describe, expect, it } from "vitest";
import {
  EasingParseError,
  canonicalEasing,
  compareEasingSamples,
  cssEasingSamples,
  cssEasingsEquivalent,
  describeEasingShape,
  evaluateCssEasing,
  formatCssEasing,
  parseCssEasing,
  resampleEasing,
  sampleEasing,
  tryParseCssEasing,
} from "../src/easing/index.ts";

describe("parseCssEasing", () => {
  it("parses keywords into their cubic-bezier definitions", () => {
    expect(parseCssEasing("ease")).toEqual({
      type: "cubic-bezier",
      x1: 0.25,
      y1: 0.1,
      x2: 0.25,
      y2: 1,
      keyword: "ease",
    });
    expect(parseCssEasing("EASE-OUT")).toMatchObject({
      x1: 0,
      y1: 0,
      x2: 0.58,
      y2: 1,
      keyword: "ease-out",
    });
    expect(parseCssEasing("linear")).toEqual({ type: "linear" });
  });

  it("parses cubic-bezier and recognises keyword-equivalent curves", () => {
    expect(parseCssEasing("cubic-bezier(0.16, 1, 0.3, 1)")).toEqual({
      type: "cubic-bezier",
      x1: 0.16,
      y1: 1,
      x2: 0.3,
      y2: 1,
    });
    expect(parseCssEasing("cubic-bezier(0.42, 0, 1, 1)")).toMatchObject({ keyword: "ease-in" });
    expect(parseCssEasing("cubic-bezier(.34,1.56,.64,1)")).toMatchObject({ y1: 1.56 });
  });

  it("rejects cubic-bezier x values outside [0, 1]", () => {
    expect(() => parseCssEasing("cubic-bezier(1.2, 0, 0.5, 1)")).toThrow(EasingParseError);
  });

  it("parses steps with every position keyword", () => {
    expect(parseCssEasing("steps(4)")).toEqual({ type: "steps", steps: 4, position: "jump-end" });
    expect(parseCssEasing("steps(4, start)")).toEqual({
      type: "steps",
      steps: 4,
      position: "jump-start",
    });
    expect(parseCssEasing("steps(3, jump-both)")).toEqual({
      type: "steps",
      steps: 3,
      position: "jump-both",
    });
    expect(parseCssEasing("step-start")).toEqual({
      type: "steps",
      steps: 1,
      position: "jump-start",
    });
    expect(parseCssEasing("step-end")).toEqual({ type: "steps", steps: 1, position: "jump-end" });
    expect(() => parseCssEasing("steps(1, jump-none)")).toThrow(/at least 2/);
    expect(() => parseCssEasing("steps(0)")).toThrow();
  });

  it("parses linear() and resolves missing inputs per CSS Easing Level 2", () => {
    const parsed = parseCssEasing("linear(0, 0.25, 1)");
    expect(parsed).toEqual({
      type: "linear-function",
      points: [
        { input: 0, output: 0 },
        { input: 0.5, output: 0.25 },
        { input: 1, output: 1 },
      ],
    });
    const withPercents = parseCssEasing("linear(0, 0.9 25%, 1 50% 100%)");
    expect(
      withPercents.type === "linear-function" && withPercents.points.map((p) => p.input),
    ).toEqual([0, 0.25, 0.5, 1]);
  });

  it("returns null from tryParseCssEasing for non-CSS easings", () => {
    expect(tryParseCssEasing("power2.out")).toBeNull();
    expect(tryParseCssEasing("cubic-bezier(1, 2)")).toBeNull();
  });
});

describe("evaluateCssEasing", () => {
  it("evaluates endpoints exactly", () => {
    for (const e of [
      "ease",
      "ease-in",
      "ease-out",
      "ease-in-out",
      "linear",
      "cubic-bezier(0.16, 1, 0.3, 1)",
    ]) {
      expect(evaluateCssEasing(e, 0)).toBeCloseTo(0, 6);
      expect(evaluateCssEasing(e, 1)).toBeCloseTo(1, 6);
    }
  });

  it("matches Chromium's own evaluation (ground truth recorded from Chromium 158 via WAAPI)", () => {
    const chromium: Record<string, number[]> = {
      ease: [0.094796, 0.408511, 0.802403, 0.960459, 0.994316],
      "ease-in": [0.017027, 0.093465, 0.315357, 0.621862, 0.839428],
      "ease-out": [0.160572, 0.378138, 0.684643, 0.906535, 0.982973],
      "ease-in-out": [0.019722, 0.129162, 0.5, 0.870838, 0.980278],
      "cubic-bezier(0.16, 1, 0.3, 1)": [0.494391, 0.825622, 0.971779, 0.997677, 0.999878],
      "cubic-bezier(0.34, 1.56, 0.64, 1)": [0.403933, 0.816289, 1.087401, 1.059647, 1.012616],
      "steps(4)": [0, 0.25, 0.5, 0.75, 0.75],
      "linear(0, 0.25, 1)": [0.05, 0.125, 0.25, 0.625, 0.85],
    };
    for (const [easing, expected] of Object.entries(chromium)) {
      const actual = [0.1, 0.25, 0.5, 0.75, 0.9].map((x) => evaluateCssEasing(easing, x));
      actual.forEach((value, i) => expect(value, `${easing} @ ${i}`).toBeCloseTo(expected[i]!, 4));
    }
  });

  it("supports overshooting curves", () => {
    const max = Math.max(...sampleEasing("cubic-bezier(0.34, 1.56, 0.64, 1)", 101));
    expect(max).toBeGreaterThan(1.05);
  });

  it("evaluates steps per the spec", () => {
    expect([0, 0.24, 0.25, 0.5, 0.99, 1].map((x) => evaluateCssEasing("steps(4)", x))).toEqual([
      0, 0, 0.25, 0.5, 0.75, 1,
    ]);
    expect([0, 0.1, 0.5, 1].map((x) => evaluateCssEasing("steps(2, jump-start)", x))).toEqual([
      0.5, 0.5, 1, 1,
    ]);
    expect([0, 0.4, 0.6, 1].map((x) => evaluateCssEasing("steps(2, jump-none)", x))).toEqual([
      0, 0, 1, 1,
    ]);
    expect([0, 0.5, 1].map((x) => evaluateCssEasing("steps(2, jump-both)", x))).toEqual([
      1 / 3,
      2 / 3,
      1,
    ]);
  });

  it("evaluates linear() by interpolating between control points", () => {
    expect(evaluateCssEasing("linear(0, 0.25, 1)", 0.25)).toBeCloseTo(0.125, 6);
    expect(evaluateCssEasing("linear(0, 0.25, 1)", 0.75)).toBeCloseTo(0.625, 6);
  });
});

describe("formatting and equivalence", () => {
  it("round-trips canonical forms", () => {
    expect(formatCssEasing(parseCssEasing("cubic-bezier(0.25, 0.1, 0.25, 1)"))).toBe("ease");
    expect(formatCssEasing(parseCssEasing("steps(3,start)"))).toBe("steps(3, jump-start)");
    expect(canonicalEasing(" cubic-bezier(.16,1,.3,1) ")).toBe("cubic-bezier(0.16, 1, 0.3, 1)");
    expect(canonicalEasing("power2.out")).toBe("power2.out");
  });

  it("treats keywords and their bezier definitions as equivalent", () => {
    expect(cssEasingsEquivalent("ease", "cubic-bezier(0.25, 0.1, 0.25, 1)")).toBe(true);
    expect(cssEasingsEquivalent("linear", "cubic-bezier(0.3, 0.3, 0.7, 0.7)")).toBe(true);
    expect(cssEasingsEquivalent("ease", "ease-out")).toBe(false);
  });
});

describe("compareEasingSamples", () => {
  it("reports identical curves as equivalent", () => {
    const s = cssEasingSamples("ease-out")!;
    const result = compareEasingSamples(s, s);
    expect(result.equivalent).toBe(true);
    expect(result.maxDeviation).toBe(0);
  });

  it("quantifies the difference between linear and ease-out", () => {
    const result = compareEasingSamples(cssEasingSamples("linear")!, cssEasingSamples("ease-out")!);
    expect(result.equivalent).toBe(false);
    expect(result.maxDeviation).toBeGreaterThan(0.15);
    expect(result.maxDeviationAt).toBeGreaterThan(0.2);
    expect(result.maxDeviationAt).toBeLessThan(0.6);
    expect(result.checkpoints.find((c) => c.at === 0.5)!.delta).toBeGreaterThan(0);
  });

  it("flags overshoot on either side", () => {
    const result = compareEasingSamples(
      cssEasingSamples("ease-out")!,
      cssEasingSamples("cubic-bezier(0.34, 1.56, 0.64, 1)")!,
    );
    expect(result.baselineOvershoot).toBe(false);
    expect(result.candidateOvershoot).toBe(true);
  });

  it("rejects mismatched sample lengths and resamples on request", () => {
    expect(() => compareEasingSamples([0, 1], [0, 0.5, 1])).toThrow(RangeError);
    expect(resampleEasing([0, 0.5, 1], 5)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });
});

describe("describeEasingShape", () => {
  it("describes curves from their samples", () => {
    expect(describeEasingShape(cssEasingSamples("linear")!)).toBe("linear");
    expect(describeEasingShape(cssEasingSamples("ease-out")!)).toContain("decelerating");
    expect(describeEasingShape(cssEasingSamples("ease-in")!)).toContain("accelerating");
    expect(describeEasingShape(cssEasingSamples("cubic-bezier(0.34, 1.56, 0.64, 1)")!)).toContain(
      "overshoots",
    );
    expect(describeEasingShape(cssEasingSamples("steps(4)")!)).toBe("stepped");
  });
});
