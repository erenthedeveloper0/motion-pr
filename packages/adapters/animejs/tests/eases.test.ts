import { eases } from "animejs";
import { describe, expect, it } from "vitest";
import { resolveEaseName, sampleEase } from "../src/eases.ts";

const NAMES = [
  "linear",
  "none",
  "in",
  "out",
  "inOut",
  "outIn",
  "in(3)",
  "out(3)",
  "inOut(1.5)",
  "out(2)",
  ...["Quad", "Cubic", "Quart", "Quint", "Sine", "Circ", "Expo", "Bounce"].flatMap((n) =>
    ["in", "out", "inOut", "outIn"].map((t) => `${t}${n}`),
  ),
  "inBack",
  "outBack",
  "outBack(3)",
  "inOutBack(1.2)",
  "outElastic",
  "outElastic(1, .5)",
  "inOutElastic(2, 0.4)",
];

describe("Anime.js ease port", () => {
  it.each(NAMES)("matches Anime.js 4.5 for %s", (name) => {
    const ours = sampleEase(resolveEaseName(name)!)!;
    const theirs = sampleEase(resolveEaseName(name, eases as unknown as Record<string, unknown>)!)!;
    expect(ours).toHaveLength(65);
    expect(ours).toEqual(theirs);
  });

  it("returns null for unknown names instead of guessing", () => {
    expect(resolveEaseName("outWobble")).toBeNull();
    expect(resolveEaseName("cubicBezier(0.1, 0, 0, 1)")).toBeNull();
  });

  it("does not sample functions that throw or return non-numbers", () => {
    expect(sampleEase(() => Number.NaN)).toBeNull();
    expect(
      sampleEase(() => {
        throw new Error("boom");
      }),
    ).toBeNull();
  });
});
