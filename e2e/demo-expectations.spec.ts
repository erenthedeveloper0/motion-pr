import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { ComparisonResult } from "@motionpr/core";
import { demoBrowsers, demoReportDir } from "./browsers.ts";

/**
 * The demo app's candidate variant contains one intentional change per scenario (see
 * packages/cli/src/demo/config.ts). These tests assert MotionPR reports exactly those, in every
 * engine the demo was captured in (MOTIONPR_E2E_BROWSERS; CI captures Chromium, Firefox and
 * WebKit). Each engine compares against its own baseline capture.
 */
for (const browser of demoBrowsers()) {
  test.describe(browser, () => {
    const result = (): ComparisonResult =>
      JSON.parse(
        readFileSync(`${demoReportDir(browser)}/comparison.json`, "utf8"),
      ) as ComparisonResult;
    const titles = (key: string) =>
      result()
        .differences.filter((d) => d.scenarioKey === `${key}@default`)
        .map((d) => `${d.severity}: ${d.title}`);

    test("both captures were taken with this engine", () => {
      const r = result();
      expect(r.baseline.browserName).toBe(browser);
      expect(r.candidate.browserName).toBe(browser);
      expect(r.crossBrowser).toBe(false);
    });

    test("every scenario passes capture in both variants", () => {
      const r = result();
      expect(r.scenarios).toHaveLength(11);
      expect(
        r.scenarios.every((s) => s.baselineStatus === "passed" && s.candidateStatus === "passed"),
      ).toBe(true);
    });

    test("navigation: panel duration 320→560ms and easing change", () => {
      const t = titles("navigation");
      expect(t).toContain(
        "warning: css-transition “transform” on nav-panel: Duration 320ms → 560ms (+240ms, +75%)",
      );
      expect(
        t.some(
          (x) =>
            x.startsWith("warning:") &&
            x.includes("Easing cubic-bezier(0.16, 1, 0.3, 1) → ease-in-out"),
        ),
      ).toBe(true);
      // Links only move because their parent does: no findings may be attributed to them.
      expect(t.some((x) => x.includes("nav-link"))).toBe(false);
    });

    test("modal: entrance easing now overshoots", () => {
      expect(
        titles("modal").some((x) => x.includes("dialog-in") && x.includes("now overshoots")),
      ).toBe(true);
    });

    test("work grid: stagger 70→120ms and an uncertain change on an unidentified element", () => {
      const t = titles("work-grid");
      expect(t).toContain("warning: Stagger interval 70ms → 120ms across 6 elements");
      expect(t.some((x) => x.startsWith("uncertain:") && x.includes("DOM position"))).toBe(true);
    });

    test("faq: 120ms delay added", () => {
      expect(titles("faq")).toContain(
        "warning: css-transition “grid-template-rows” on faq-answer-1: Delay 0ms → 120ms (+120ms)",
      );
    });

    test("cta hover: lift −2px → −6px", () => {
      expect(titles("cta-hover").some((x) => x.includes("translateY at end: -2px → -6px"))).toBe(
        true,
      );
    });

    test("image reveal: removed animation is critical", () => {
      expect(titles("image-reveal")).toEqual([
        "critical: Removed: css-animation “wipe-in” on case-image",
      ]);
    });

    test("features: added badge animation", () => {
      expect(titles("features")).toEqual(["warning: Added: css-animation “pop” on feature-badge"]);
    });

    test("gsap: timeline duration and ease changes are measured from GSAP", () => {
      const t = titles("gsap-intro");
      expect(t).toContain(
        "warning: gsap “hero-intro@lines” on hero-line-1: Duration 600ms → 900ms (+300ms, +50%)",
      );
      expect(
        t.some(
          (x) => x.includes("Easing power3.out → back.out(1.7)") && x.includes("now overshoots"),
        ),
      ).toBe(true);
      expect(t.some((x) => x.includes("hero-underline") && x.includes("Starts +300ms later"))).toBe(
        true,
      );
    });

    test("anime.js: per-target stagger 60→110ms, recorded with Anime.js identity", () => {
      const t = titles("anime-services");
      expect(t).toContain("warning: Stagger interval 60ms → 110ms across 4 elements");
      expect(t).toContain("warning: animejs on service-4: Delay 180ms → 330ms (+150ms, +83.33%)");
      const services = result().differences.filter(
        (d) => d.scenarioKey === "anime-services@default",
      );
      expect(services.filter((d) => d.animationKey).every((d) => d.source === "animejs")).toBe(
        true,
      );
    });

    test("anime.js: timeline sequence change (label moved, children start later, bar longer)", () => {
      const t = titles("anime-process");
      expect(t).toContain("warning: Anime.js timeline “process”: Timeline duration 840ms → 1080ms");
      expect(t).toContain("warning: Anime.js timeline “process”: Label “ship” moved 600ms → 840ms");
      expect(t).toContain(
        "warning: animejs “process@discover” on process-bar: Duration 700ms → 900ms (+200ms, +28.57%)",
      );
      // Start offsets are frame-quantized observations: compare the measured delta, not the text.
      const ship = result().differences.find(
        (d) =>
          d.scenarioKey === "anime-process@default" &&
          d.animationKey?.includes("process-ship") &&
          /Starts/.test(d.title),
      );
      expect(Math.abs((ship?.delta ?? 0) - 240)).toBeLessThan(3);
    });

    test("lenis: slower lerp and a moved ScrollTrigger start are scroll differences", () => {
      const t = titles("lenis-journal");
      expect(
        t.some((x) => /^warning: Lenis scroll: Scroll takes \d+ms → \d+ms to settle/.test(x)),
      ).toBe(true);
      expect(t).toContain("info: Lenis scroll: Scroll setting lerp: 0.1 → 0.06");
      expect(
        t.some((x) =>
          /^warning: gsap on journal-image: Scroll-linked progress at the same scroll position/.test(
            x,
          ),
        ),
      ).toBe(true);
      const scroll = result().differences.filter(
        (d) => d.scenarioKey === "lenis-journal@default" && d.scrollKey,
      );
      expect(scroll.every((d) => d.source === "lenis" && d.category === "scroll")).toBe(true);
    });

    test("overall result fails on the critical removal", () => {
      const r = result();
      expect(r.summary.status).toBe("failed");
      expect(r.summary.counts.critical).toBe(1);
    });

    test("lenis: peak velocity is measured over whole frames, not timer noise", () => {
      // Coarse timers (1 ms in Firefox and WebKit) once produced "78 px/ms" from two samples 1 ms
      // apart; the slower lerp lowers the peak by roughly a third in every engine.
      const v = result().differences.find(
        (d) => d.scenarioKey === "lenis-journal@default" && /Peak scroll velocity/.test(d.title),
      );
      if (v) {
        expect(Number(v.before)).toBeLessThan(12);
        expect(Number(v.after)).toBeLessThan(Number(v.before));
      }
    });
  });
}
