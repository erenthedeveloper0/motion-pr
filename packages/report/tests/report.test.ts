import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateReport, REPORT_DATA_PLACEHOLDER } from "../src/generator/index.ts";
import {
  assertReportData,
  boxAt,
  buildModel,
  frameAt,
  progressAt,
  stepTime,
  frameTimes,
  varyingChannels,
} from "../src/viewer/model.ts";
import { matchesFilters } from "../src/viewer/components/Navigator.tsx";
import { fuzzyScore } from "../src/viewer/components/Overlays.tsx";
import { anim, bundle, checkpoint, scenario } from "../../comparison/tests/helpers.ts";
import { compareCaptures } from "@motionpr/comparison";
import { comparisonConfigSchema, type ReportData } from "@motionpr/core";

const TEMPLATE = `<!doctype html><html><body><script type="module">const x = "${REPORT_DATA_PLACEHOLDER}".length;</script><script id="motionpr-report-data" type="application/json">${REPORT_DATA_PLACEHOLDER}</script></body></html>`;

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "motionpr-report-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function fixture() {
  const frames = [
    { index: 0, time: 0, asset: "f0.png" },
    { index: 1, time: 100, asset: "f1.png" },
    { index: 2, time: 200, asset: "f2.png" },
  ];
  const assets = Object.fromEntries(
    frames.map((f) => [
      f.asset,
      { file: `assets/${f.asset}`, format: "png" as const, width: 10, height: 10, bytes: 4 },
    ]),
  );
  const b = bundle(
    [
      scenario("menu", [
        checkpoint("open", [anim({ duration: 300 }), anim({ key: "test-id:gone" })], { frames }),
      ]),
    ],
    { assets, id: "base" },
  );
  const evil = anim({ key: "test-id:label", duration: 300 });
  evil.element.label = "</script><script>alert(1)</script>";
  const c = bundle(
    [scenario("menu", [checkpoint("open", [anim({ duration: 520 }), evil], { frames })])],
    { assets, id: "cand" },
  );
  for (const side of ["b", "c"]) {
    await mkdir(join(dir, side, "assets"), { recursive: true });
    for (const f of frames) await writeFile(join(dir, side, "assets", f.asset), "png!");
  }
  const result = await compareCaptures({
    baseline: { dir: join(dir, "b"), bundle: b },
    candidate: { dir: join(dir, "c"), bundle: c },
    config: comparisonConfigSchema.parse({}),
  });
  return { b, c, result };
}

describe("generateReport", () => {
  it("embeds data inertly, copies assets once and leaves app code untouched", async () => {
    const { b, c, result } = await fixture();
    const out = join(dir, "report");
    const report = await generateReport({
      outputDir: out,
      template: TEMPLATE,
      baseline: { dir: join(dir, "b"), value: b },
      candidate: { dir: join(dir, "c"), value: c },
      comparison: { dir: join(dir, "cmp"), value: result },
    });
    const html = await readFile(report.indexPath, "utf8");
    expect(html).toContain(`const x = "${REPORT_DATA_PLACEHOLDER}".length;`);
    expect(html).not.toContain("</script><script>alert(1)");
    const json = html.slice(
      html.indexOf('type="application/json">') + 24,
      html.lastIndexOf("</script>"),
    );
    const data = assertReportData(JSON.parse(json));
    expect(data.mode).toBe("comparison");
    expect(data.candidate.scenarios[0]!.checkpoints[0]!.animations[1]!.element.label).toBe(
      "</script><script>alert(1)</script>",
    );
    expect((await readdir(join(out, "assets"))).sort()).toEqual(["f0.png", "f1.png", "f2.png"]);
    expect(data.candidate.assets["f0.png"]!.file).toBe("assets/f0.png");
  });

  it("accepts a formatter-wrapped data element (regression: reformatted template broke every report)", async () => {
    const { c } = await fixture();
    const template = `<html><body>
    <script id="motionpr-report-data" type="application/json">
      __MOTIONPR_REPORT_DATA__
    </script></body></html>`;
    const out = join(dir, "wrapped");
    await generateReport({
      outputDir: out,
      template,
      candidate: { dir: join(dir, "c"), value: c },
    });
    const html = await readFile(join(out, "index.html"), "utf8");
    expect(html).not.toContain("__MOTIONPR_REPORT_DATA__");
    expect(html).toContain('"kind":"motionpr-report"');
  });

  it("refuses templates with more than one data element", async () => {
    const { c } = await fixture();
    const el = `<script id="motionpr-report-data" type="application/json">__MOTIONPR_REPORT_DATA__</script>`;
    await expect(
      generateReport({
        outputDir: join(dir, "twice"),
        template: `<html>${el}${el}</html>`,
        candidate: { dir: join(dir, "c"), value: c },
      }),
    ).rejects.toThrow(/placeholder/);
  });

  it("refuses unsafe asset paths in capture data (security regression)", async () => {
    const { c } = await fixture();
    const evil = {
      ...c,
      assets: {
        "x.png": {
          file: "../../../etc/passwd",
          format: "png" as const,
          width: 1,
          height: 1,
          bytes: 1,
        },
      },
    };
    const el = `<script id="motionpr-report-data" type="application/json">__MOTIONPR_REPORT_DATA__</script>`;
    await expect(
      generateReport({
        outputDir: join(dir, "evil"),
        template: `<html>${el}</html>`,
        candidate: { dir: join(dir, "c"), value: evil },
      }),
    ).rejects.toThrow(/unsafe asset/);
  });

  it("refuses templates without the data element", async () => {
    const { c } = await fixture();
    await expect(
      generateReport({
        outputDir: join(dir, "r"),
        template: "<html></html>",
        candidate: { dir: join(dir, "c"), value: c },
      }),
    ).rejects.toThrow(/placeholder/);
  });
});

describe("viewer model", () => {
  async function model(): Promise<ReturnType<typeof buildModel>> {
    const { b, c, result } = await fixture();
    const data: ReportData = {
      kind: "motionpr-report",
      schemaVersion: 1,
      motionprVersion: "0",
      generatedAt: "",
      project: "p",
      mode: "comparison",
      baseline: b,
      candidate: c,
      comparison: result,
      notes: [],
    };
    return buildModel(data, "/demo/");
  }

  it("builds scenarios, checkpoints and tracks from the comparison", async () => {
    const m = await model();
    const cp = m.scenarios[0]!.checkpoints[0]!;
    expect(m.scenarios[0]!.changeCount).toBeGreaterThan(0);
    expect(cp.tracks.map((t) => t.status).sort()).toEqual(["added", "changed", "removed"]);
    const changed = cp.tracks.find((t) => t.status === "changed")!;
    expect(changed.baseline!.timing.duration).toBe(300);
    expect(changed.candidate!.timing.duration).toBe(520);
    expect(changed.label).toBe("panel");
  });

  it("resolves only safe asset paths", async () => {
    const m = await model();
    expect(m.assetUrl("f1.png")).toBe("/demo/assets/f1.png");
    expect(m.assetUrl("missing.png")).toBeNull();
    m.data.candidate.assets["f1.png"]!.file = "javascript:alert(1)";
    const again = buildModel(m.data, "");
    expect(again.assetUrl("f1.png")).toBeNull();
  });

  it("finds frames and steps through them", async () => {
    const m = await model();
    const cp = m.scenarios[0]!.checkpoints[0]!;
    const frames = cp.candidate!.frames;
    expect(frameAt(frames, 0)!.time).toBe(0);
    expect(frameAt(frames, 150)!.time).toBe(100);
    expect(frameAt(frames, 999)!.time).toBe(200);
    const times = frameTimes(cp);
    expect(stepTime(times, 0, 1)).toBe(100);
    expect(stepTime(times, 100, -1)).toBe(0);
    expect(stepTime(times, 200, 1)).toBe(200);
  });

  it("interpolates geometry and progress", async () => {
    const m = await model();
    const r = m.scenarios[0]!.checkpoints[0]!.tracks.find(
      (t) => t.status === "changed",
    )!.candidate!;
    expect(boxAt(r, 260)!.x).toBeCloseTo(100, 0);
    expect(progressAt(r, 260)).toBeCloseTo(0.5, 2);
    expect(progressAt(r, 9999)).toBeNull();
    expect(varyingChannels([r])).toEqual(expect.arrayContaining(["translateX", "x"]));
  });

  it("rejects foreign data", () => {
    expect(() => assertReportData({ kind: "other" })).toThrow(/MotionPR report data/);
  });
});

describe("viewer helpers", () => {
  it("filters differences by category, severity and text", () => {
    const d = {
      id: "1",
      severity: "warning" as const,
      category: "timing" as const,
      scenarioKey: "nav@d",
      checkpoint: "open",
      animationKey: "a",
      scrollKey: null,
      source: "native",
      title: "Duration 300 → 520",
      detail: "",
      measurement: "measured" as const,
    };
    expect(matchesFilters(d, ["timing"], [], "")).toBe(true);
    expect(matchesFilters(d, ["changed"], [], "")).toBe(true);
    expect(matchesFilters(d, ["easing"], [], "")).toBe(false);
    expect(matchesFilters(d, [], ["critical"], "")).toBe(false);
    expect(matchesFilters(d, [], [], "520")).toBe(true);
  });

  it("scores fuzzy matches with contiguous matches first", () => {
    expect(fuzzyScore("nav", "Navigation menu")).toBeGreaterThan(
      fuzzyScore("nvm", "Navigation menu"),
    );
    expect(fuzzyScore("xyz", "Navigation")).toBe(0);
  });
});
