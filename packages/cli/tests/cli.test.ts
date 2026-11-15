import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { comparisonMarkdown, mdEscape, resolveConfig } from "@motionpr/core";
import { PINNED_ACTIONS } from "../src/actions.ts";
import { detectProject } from "../src/commands/init.ts";
import { parseThreshold } from "../src/commands/compare.ts";
import { viewportFilter } from "../src/commands/capture.ts";
import { configTemplate, workflowTemplate } from "../src/templates.ts";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "motionpr-cli-unit-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("detectProject", () => {
  it("detects Next.js with pnpm", async () => {
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({ scripts: { dev: "next dev" }, dependencies: { next: "15", react: "19" } }),
    );
    await writeFile(join(dir, "pnpm-lock.yaml"), "");
    await writeFile(join(dir, "tsconfig.json"), "{}");
    expect(await detectProject(dir)).toMatchObject({
      framework: "Next.js",
      url: "http://localhost:3000",
      devCommand: "pnpm dev",
      packageManager: "pnpm",
      typescript: true,
    });
  });

  it("detects Vite + React with npm and no TypeScript", async () => {
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({
        scripts: { dev: "vite" },
        devDependencies: { vite: "8" },
        dependencies: { react: "19" },
      }),
    );
    expect(await detectProject(dir)).toMatchObject({
      framework: "Vite + React",
      url: "http://localhost:5173",
      devCommand: "npm run dev",
      typescript: false,
    });
  });

  it("falls back to a static site", async () => {
    expect(await detectProject(dir)).toMatchObject({ framework: "Static site", devCommand: null });
  });
});

describe("templates", () => {
  it("generates configs that load and validate", async () => {
    for (const typescript of [true, false]) {
      for (const exampleScenario of [true, false]) {
        const file = join(
          dir,
          `config-${typescript}-${exampleScenario}.${typescript ? "ts" : "mjs"}`,
        );
        const source = configTemplate({
          typescript,
          baseURL: "http://localhost:3000",
          devCommand: "npm run dev",
          framework: "Vite",
          exampleScenario,
        }).replace(
          'from "@erenthedeveloper0/motionpr"',
          `from ${JSON.stringify(new URL("../../core/src/index.ts", import.meta.url).pathname)}`,
        );
        await writeFile(file, source);
        const jiti = createJiti(import.meta.url, { moduleCache: false });
        const raw = await jiti.import(file, { default: true });
        expect(() => resolveConfig(raw)).not.toThrow();
      }
    }
  });

  it("pre-configures detected engines and keeps the config valid", async () => {
    const source = configTemplate({
      typescript: true,
      baseURL: "http://localhost:3000",
      devCommand: null,
      framework: "Vite",
      exampleScenario: true,
      engines: ["gsap", "animejs", "lenis"],
    });
    expect(source).toContain('{ name: "gsap", required: true }');
    expect(source).toContain('{ name: "animejs", required: true }');
    expect(source).toContain('{ name: "lenis", required: true }');
    expect(source).toContain("motionprLenis.attach(lenis)");
    const file = join(dir, "config-engines.ts");
    await writeFile(
      file,
      source.replace(
        'from "@erenthedeveloper0/motionpr"',
        `from ${JSON.stringify(new URL("../../core/src/index.ts", import.meta.url).pathname)}`,
      ),
    );
    const raw = await createJiti(import.meta.url, { moduleCache: false }).import(file, {
      default: true,
    });
    expect(resolveConfig(raw).adapters.map((a) => a.name)).toEqual(["gsap", "animejs", "lenis"]);
  });

  it("pins workflow actions to full commit SHAs", () => {
    const yaml = workflowTemplate({ packageManager: "npm", nodeVersion: "24" });
    const uses = [...yaml.matchAll(/uses: (\S+)/g)].map((m) => m[1]!);
    expect(uses.length).toBeGreaterThanOrEqual(3);
    for (const u of uses) expect(u).toMatch(/@[0-9a-f]{40}$/);
    expect(yaml).toContain("permissions:\n  contents: read");
    expect(yaml).not.toContain("pull_request_target");
    for (const value of Object.values(PINNED_ACTIONS)) expect(value).toMatch(/@[0-9a-f]{40} # v\d/);
  });
});

describe("argument helpers", () => {
  it("validates thresholds", () => {
    expect(parseThreshold("warning")).toBe("warning");
    expect(parseThreshold(undefined)).toBeUndefined();
    expect(() => parseThreshold("loud")).toThrow(/Invalid --threshold/);
  });

  it("merges --viewport and --project lists", () => {
    expect(viewportFilter({ viewport: ["desktop,mobile"], project: ["tablet"] })).toEqual([
      "desktop",
      "mobile",
      "tablet",
    ]);
    expect(viewportFilter({})).toBeUndefined();
  });
});

describe("markdown summaries", () => {
  it("escapes page-controlled text", () => {
    expect(mdEscape("<img src=x onerror=alert(1)> | pipe")).toBe(
      "&lt;img src=x onerror=alert(1)&gt; \\| pipe",
    );
  });

  it("renders a summary table", () => {
    const md = comparisonMarkdown(
      {
        schemaVersion: 2,
        kind: "motionpr-comparison",
        motionprVersion: "0",
        createdAt: "",
        baseline: {
          id: "b",
          createdAt: "",
          motionprVersion: "0",
          browser: "chromium 1",
          browserName: "chromium",
          platform: "linux-x64",
          configHash: "",
        },
        candidate: {
          id: "c",
          createdAt: "",
          motionprVersion: "0",
          browser: "chromium 1",
          browserName: "chromium",
          platform: "linux-x64",
          configHash: "",
        },
        crossBrowser: false,
        failOn: "critical",
        failOnUncertain: false,
        summary: {
          status: "failed",
          highestSeverity: "critical",
          counts: { critical: 1, warning: 0, info: 0, uncertain: 0 },
          scenarios: { total: 1, changed: 1, added: 0, removed: 0, failed: 0 },
          animations: { matched: 0, changed: 0, added: 0, removed: 1, unchanged: 0 },
        },
        scenarios: [
          {
            key: "menu@default",
            id: "menu",
            name: "menu",
            viewport: "default",
            status: "changed",
            baselineStatus: "passed",
            candidateStatus: "passed",
            checkpoints: [],
            severity: "critical",
          },
        ],
        differences: [
          {
            id: "d1",
            severity: "critical",
            category: "removed",
            scenarioKey: "menu@default",
            checkpoint: "open",
            animationKey: "x",
            scrollKey: null,
            source: "native",
            title: "Removed: <b>glow</b>",
            detail: "",
            measurement: "measured",
          },
        ],
        assets: {},
        diagnostics: [],
      },
      { artifactName: "motionpr-report" },
    );
    expect(md).toContain("❌ Failed");
    expect(md).toContain("Removed: &lt;b&gt;glow&lt;/b&gt;");
    expect(md).toContain("`motionpr-report`");
  });
});
