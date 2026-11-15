/**
 * Regression tests for issues found while capturing the demo app. Each test names the problem it
 * guards against. (Capture-side regressions live in packages/capture/tests/*.integration.test.ts:
 * finished-then-cancelled animations, reversed GSAP windows, fill values in error logs,
 * fill-forwards originals leaking into replay.)
 */
import { describe, expect, it } from "vitest";
import { compareMatchedAnimation, matchAnimations } from "../src/index.ts";
import { anim, config } from "./helpers.ts";

const pair = (b: ReturnType<typeof anim>, c: ReturnType<typeof anim>) =>
  compareMatchedAnimation(
    { baseline: b, candidate: c, method: "exact", confidence: "high", notes: [] },
    config(),
  );

describe("regressions", () => {
  it("a delay added to a zero-delay animation is judged against its duration (was: always critical)", () => {
    const cmp = pair(anim({ duration: 380, delay: 0 }), anim({ duration: 380, delay: 120 }));
    expect(cmp.changes.find((c) => c.kind === "delay")!.severity).toBe("warning");
  });

  it("does not attribute an animated ancestor's movement to an opacity transition (was: 14 false warnings on nav links)", () => {
    const b = anim({
      type: "css-transition",
      name: "opacity",
      props: ["opacity"],
      translateX: [0, 0],
      opacity: [0, 1],
    });
    const c = anim({
      type: "css-transition",
      name: "opacity",
      props: ["opacity"],
      translateX: [0, 0],
      opacity: [0, 1],
    });
    // Same own values, but the box ends 117px away because the parent panel moves slower.
    for (const s of c.samples) s.box = { ...s.box!, x: s.box!.x + 117 };
    expect(pair(b, c).changes).toEqual([]);
  });

  it("still reports geometry changes for layout-property animations", () => {
    const b = anim({
      type: "css-transition",
      name: "height",
      props: ["height"],
      translateX: [0, 0],
    });
    const c = anim({
      type: "css-transition",
      name: "height",
      props: ["height"],
      translateX: [0, 0],
    });
    c.samples.at(-1)!.box = { ...c.samples.at(-1)!.box!, height: 160 };
    expect(pair(b, c).changes.map((x) => x.kind)).toContain("size");
  });

  it("does not fuzzy-match unrelated unlabeled elements that both animate transform (was: removed+added shown as changed)", () => {
    const gone = anim({ key: "test-id:gone" });
    const fresh = anim({ key: "test-id:fresh" });
    gone.element.selector = "[data-testid=gone]";
    fresh.element.selector = "[data-testid=fresh]";
    const result = matchAnimations([gone], [fresh]);
    expect(result.matches).toEqual([]);
    expect(result.removed).toHaveLength(1);
    expect(result.added).toHaveLength(1);
  });

  it("does not report where a cancelled animation stopped as a regression (was: frames and samples depended on when a timer cancelled it)", () => {
    // The same build, cancelled 120 ms in by the app: under load the cancel ran later, so the
    // replayed path ends further along. Only declared timing is definite for such a record.
    const b = anim({ translateX: [0, 36], completeness: "partial" });
    const c = anim({ translateX: [0, 60], completeness: "partial" });
    b.meta = { ...b.meta, canceled: true };
    c.meta = { ...c.meta, canceled: true };
    const cmp = pair(b, c);
    const path = cmp.changes.filter((x) => x.kind === "trajectory");
    expect(path.length).toBeGreaterThan(0);
    expect(path.every((x) => x.severity === "uncertain")).toBe(true);
    expect(path[0]!.message).toContain("cancelled mid-way");
    expect(cmp.severity).toBe("uncertain");
    // A real timing change on a cancelled animation is still definite.
    const slower = anim({ duration: 800, translateX: [0, 36], completeness: "partial" });
    slower.meta = { ...slower.meta, canceled: true };
    expect(pair(b, slower).changes.find((x) => x.kind === "duration")!.severity).not.toBe(
      "uncertain",
    );
  });
});
