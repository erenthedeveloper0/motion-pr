import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ConfigError,
  MOTIONPR_VERSION,
  configHash,
  deepMerge,
  defineConfig,
  joinUrl,
  resolveConfig,
  resolveViewports,
  scenarioUrl,
  scenarioViewports,
} from "../src/index.ts";

const minimal = {
  baseURL: "http://localhost:3000",
  scenarios: [{ id: "home", steps: [{ type: "capture", label: "loaded" }] }],
};

function issuesOf(fn: () => unknown) {
  try {
    fn();
  } catch (error) {
    if (error instanceof ConfigError) return error.issues;
    throw error;
  }
  throw new Error("expected ConfigError");
}

describe("resolveConfig", () => {
  it("applies documented defaults", () => {
    const config = resolveConfig(minimal);
    expect(config.output).toEqual({
      directory: ".motionpr",
      baseline: "baseline",
      captures: "captures",
      report: "report",
      keep: 5,
    });
    expect(config.browser.viewport).toEqual({ width: 1440, height: 900 });
    expect(config.browser).toMatchObject({
      name: "chromium",
      headless: true,
      colorScheme: "light",
      locale: "en-US",
      timezoneId: "UTC",
      reducedMotion: "no-preference",
    });
    expect(config.capture.frames).toEqual({
      enabled: true,
      fps: 30,
      maxFrames: 90,
      format: "png",
      quality: 80,
    });
    expect(config.comparison.failOn).toBe("critical");
    expect(config.comparison.timing.startToleranceMs).toBe(34);
    expect(config.privacy.maskInputs).toBe(true);
  });

  it("defineConfig is an identity function with type inference", () => {
    const input = {
      baseURL: "http://localhost:3000",
      scenarios: [{ id: "home", steps: [{ type: "capture" as const, label: "loaded" }] }],
    };
    const cfg = defineConfig(input);
    expect(cfg).toBe(input);
  });

  it("reports precise issue paths for invalid steps", () => {
    const issues = issuesOf(() =>
      resolveConfig({
        baseURL: "http://localhost:3000",
        scenarios: [{ id: "x", steps: [{ type: "click" }, { type: "teleport" }] }],
      }),
    );
    expect(issues.map((i) => i.path)).toEqual(
      expect.arrayContaining(["scenarios[0].steps[0].selector", "scenarios[0].steps[1].type"]),
    );
  });

  it("rejects duplicate scenario ids and checkpoint labels", () => {
    const issues = issuesOf(() =>
      resolveConfig({
        baseURL: "http://localhost:3000",
        scenarios: [
          {
            id: "a",
            steps: [
              { type: "capture", label: "one" },
              { type: "capture", label: "one" },
            ],
          },
          { id: "a", steps: [] },
        ],
      }),
    );
    expect(issues.some((i) => i.message.includes('duplicate checkpoint label "one"'))).toBe(true);
  });

  it("detects duplicate scenario ids after schema validation", () => {
    const issues = issuesOf(() =>
      resolveConfig({ baseURL: "http://localhost:3000", scenarios: [{ id: "a" }, { id: "a" }] }),
    );
    expect(issues).toContainEqual({
      path: "scenarios[1].id",
      message: 'duplicate scenario id "a"',
    });
  });

  it("requires a URL source", () => {
    const issues = issuesOf(() => resolveConfig({ scenarios: [{ id: "a" }] }));
    expect(issues[0]!.message).toMatch(/baseURL/);
  });

  it("rejects non-http base URLs", () => {
    const issues = issuesOf(() => resolveConfig({ ...minimal, baseURL: "javascript:alert(1)" }));
    expect(issues[0]!.path).toBe("baseURL");
  });

  it("uses webServer.url when baseURL is omitted", () => {
    const config = resolveConfig({
      webServer: { command: "npm run dev", url: "http://127.0.0.1:5173" },
      scenarios: [{ id: "a", path: "/menu" }],
    });
    expect(scenarioUrl(config, config.scenarios[0]!)).toBe("http://127.0.0.1:5173/menu");
    expect(config.webServer).toMatchObject({ reuseExistingServer: false, timeout: 60_000 });
  });

  it("merges named environments and env vars, then CLI overrides", () => {
    const config = resolveConfig(
      {
        ...minimal,
        environments: { ci: { capture: { concurrency: 4 }, browser: { headless: true } } },
      },
      {
        env: "ci",
        envVars: { MOTIONPR_BASE_URL: "http://example.test:8080" },
        overrides: { browser: { headless: false } },
      },
    );
    expect(config.capture.concurrency).toBe(4);
    expect(config.baseURL).toBe("http://example.test:8080");
    expect(config.browser.headless).toBe(false);
  });

  it("reports unknown environments with the available names", () => {
    expect(() =>
      resolveConfig({ ...minimal, environments: { ci: {} } }, { env: "staging" }),
    ).toThrow(/Unknown environment "staging"/);
  });

  it("resolves named viewports and validates scenario viewport references", () => {
    const config = resolveConfig({
      ...minimal,
      browser: {
        viewports: [
          { name: "desktop", width: 1440, height: 900 },
          { name: "mobile", width: 390, height: 844, deviceScaleFactor: 2 },
        ],
      },
      scenarios: [{ id: "a", viewports: ["mobile"] }, { id: "b" }],
    });
    expect(resolveViewports(config).map((v) => `${v.name}:${v.deviceScaleFactor}`)).toEqual([
      "desktop:1",
      "mobile:2",
    ]);
    expect(scenarioViewports(config, config.scenarios[0]!).map((v) => v.name)).toEqual(["mobile"]);
    expect(scenarioViewports(config, config.scenarios[1]!)).toHaveLength(2);
    const issues = issuesOf(() =>
      resolveConfig({ ...minimal, scenarios: [{ id: "a", viewports: ["tablet"] }] }),
    );
    expect(issues[0]!.message).toMatch(/unknown viewport "tablet"/);
  });

  it("validates severity overrides by rule name", () => {
    expect(
      resolveConfig({ ...minimal, comparison: { severity: { easing: "critical", fill: "off" } } })
        .comparison.severity,
    ).toEqual({ easing: "critical", fill: "off" });
    expect(() =>
      resolveConfig({ ...minimal, comparison: { severity: { wobble: "critical" } } }),
    ).toThrow(ConfigError);
  });
});

describe("configHash", () => {
  it("is stable across key order and excludes fill values", () => {
    const a = resolveConfig({
      ...minimal,
      scenarios: [{ id: "f", steps: [{ type: "fill", selector: "#q", value: "secret-1" }] }],
    });
    const b = resolveConfig({
      scenarios: [{ steps: [{ value: "secret-2", selector: "#q", type: "fill" }], id: "f" }],
      baseURL: "http://localhost:3000",
    });
    expect(configHash(a)).toBe(configHash(b));
    const c = resolveConfig({ ...minimal, capture: { samples: 12 } });
    expect(configHash(c)).not.toBe(configHash(resolveConfig(minimal)));
  });
});

describe("utilities", () => {
  it("deepMerge merges objects and replaces arrays", () => {
    expect(deepMerge({ a: { b: 1, c: [1, 2] }, d: 1 }, { a: { c: [3] }, e: 2 })).toEqual({
      a: { b: 1, c: [3] },
      d: 1,
      e: 2,
    });
  });

  it("joinUrl keeps base sub-paths", () => {
    expect(joinUrl("http://localhost:3000", "/menu")).toBe("http://localhost:3000/menu");
    expect(joinUrl("http://localhost:3000/app", "/menu?x=1")).toBe(
      "http://localhost:3000/app/menu?x=1",
    );
    expect(joinUrl("http://localhost:3000/app/", "")).toBe("http://localhost:3000/app/");
    expect(joinUrl("http://a.test", "https://b.test/x")).toBe("https://b.test/x");
  });

  it("MOTIONPR_VERSION matches the published package version", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../../cli/package.json", import.meta.url), "utf8"),
    ) as { version: string };
    expect(MOTIONPR_VERSION).toBe(pkg.version);
  });
});
