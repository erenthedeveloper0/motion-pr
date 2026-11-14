/**
 * End-to-end CLI tests: spawn the built binary (packages/cli/dist/bin.js) in temporary
 * projects and check behaviour and the exit-code contract. Requires `pnpm build` first.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const BIN = fileURLToPath(new URL("../dist/bin.js", import.meta.url));
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));

interface Result {
  code: number | null;
  stdout: string;
  stderr: string;
}

function cli(args: string[], cwd: string, env: Record<string, string> = {}): Promise<Result> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      cwd,
      env: {
        ...process.env,
        NO_COLOR: "1",
        CI: "",
        GITHUB_ACTIONS: "",
        GITHUB_STEP_SUMMARY: "",
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("exit", (code) => resolve({ code, stdout, stderr }));
  });
}

const PAGE = (duration: number) => `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#fff}
.panel{position:absolute;left:0;top:0;width:200px;height:200px;background:#222;transform:translateX(-100%);transition:transform ${duration}ms cubic-bezier(.16,1,.3,1)}
.open .panel{transform:none}
button{position:absolute;right:20px;top:20px}
</style></head><body>
<button data-testid="toggle" onclick="document.body.classList.toggle('open')">Toggle</button>
<div class="panel" data-testid="panel"></div>
</body></html>`;

const SERVER = `import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
createServer(async (_req, res) => {
  res.writeHead(200, { "content-type": "text/html" }).end(await readFile(new URL("./index.html", import.meta.url)));
}).listen(Number(process.env.PORT));
`;

let dir: string;
let port: number;

beforeAll(async () => {
  if (!existsSync(BIN)) throw new Error("Build the CLI first: pnpm build");
  dir = await mkdtemp(join(tmpdir(), "motionpr-cli-"));
  port = 43000 + Math.floor(Math.random() * 2000);
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({ name: "cli-fixture", type: "module", scripts: { dev: "node server.mjs" } }),
  );
  await writeFile(join(dir, "server.mjs"), SERVER);
  await writeFile(join(dir, "index.html"), PAGE(300));
  // The config imports the package like a user's would; link the workspace package.
  await mkdir(join(dir, "node_modules/@erenthedeveloper0"), { recursive: true });
  const { symlink } = await import("node:fs/promises");
  await symlink(
    join(ROOT, "packages/cli"),
    join(dir, "node_modules/@erenthedeveloper0/motionpr"),
    "dir",
  );
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("motionpr CLI", () => {
  it("prints its version and rejects unknown commands with exit 2", async () => {
    const v = await cli(["--version"], dir);
    expect(v.code).toBe(0);
    expect(v.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    expect((await cli(["frobnicate"], dir)).code).toBe(2);
    // Regression: usage errors on subcommands exited 1 ("regression found").
    expect((await cli(["capture", "--frobnicate"], dir)).code).toBe(2);
    expect((await cli(["baseline", "accept", "--nope"], dir)).code).toBe(2);
    expect((await cli(["compare", "--help"], dir)).code).toBe(0);
  });

  it("init --yes writes a valid commented config without overwriting", async () => {
    const r = await cli(
      ["init", "--yes", "--base-url", `http://127.0.0.1:${port}`, "--command", "npm run dev"],
      dir,
    );
    expect(r.code).toBe(0);
    const config = await readFile(join(dir, "motionpr.config.mjs"), "utf8");
    expect(config).toContain('import { defineConfig } from "@erenthedeveloper0/motionpr"');
    expect(config).toContain(`url: "http://127.0.0.1:${port}"`);
    expect(await readFile(join(dir, ".motionpr/.gitignore"), "utf8")).toContain("captures/");
    const again = await cli(["init", "--yes"], dir);
    expect(again.code).toBe(0);
    expect(again.stderr).toContain("already exists");
  });

  it("doctor --json reports a healthy environment", async () => {
    const r = await cli(["doctor", "--json"], dir);
    const report = JSON.parse(r.stdout) as {
      ok: boolean;
      checks: { name: string; status: string }[];
    };
    expect(r.code).toBe(0);
    expect(report.ok).toBe(true);
    expect(report.checks.find((c) => c.name === "Config")!.status).toBe("ok");
    expect(report.checks.find((c) => c.name === "Browser launch")!.status).toBe("ok");
  });

  it("runs the full journey: no baseline → accept → unchanged → regression", async () => {
    const config = (await readFile(join(dir, "motionpr.config.mjs"), "utf8")).replace(
      /scenarios: \[[\s\S]*?\n {2}\],/,
      `scenarios: [{ id: "panel", path: "/", steps: [{ type: "click", selector: "[data-testid=toggle]" }, { type: "capture", label: "open" }] }],`,
    );
    await writeFile(join(dir, "motionpr.config.mjs"), config);
    const env = { PORT: String(port) };

    const first = await cli(["run"], dir, env);
    expect(first.code, first.stderr).toBe(0);
    expect(first.stderr).toContain("No approved baseline yet");
    expect(existsSync(join(dir, ".motionpr/report/index.html"))).toBe(true);

    const ci = await cli(["run", "--ci"], dir, env);
    expect(ci.code).toBe(2);

    expect((await cli(["baseline", "accept"], dir)).code).toBe(0);
    expect(existsSync(join(dir, ".motionpr/baseline/capture.json"))).toBe(true);

    const same = await cli(["run", "--json"], dir, env);
    expect(same.code, same.stderr).toBe(0);
    const sameResult = JSON.parse(same.stdout) as {
      summary: { status: string; counts: { critical: number; warning: number } };
    };
    expect(sameResult.summary.status).toBe("passed");
    expect(sameResult.summary.counts.critical + sameResult.summary.counts.warning).toBe(0);

    await writeFile(join(dir, "index.html"), PAGE(650));
    const summaryFile = join(dir, "summary.md");
    const changed = await cli(["run"], dir, { ...env, GITHUB_STEP_SUMMARY: summaryFile });
    expect(changed.code).toBe(1);
    expect(changed.stderr).toContain("Duration 300ms → 650ms");
    expect(await readFile(summaryFile, "utf8")).toContain("motion regression detected");

    const lenient = await cli(["compare", "--threshold", "never", "--no-report"], dir);
    expect(lenient.code).toBe(0);

    const json = await cli(["compare", "--format", "json", "--no-report"], dir);
    expect(json.code).toBe(1);
    const result = JSON.parse(json.stdout) as { kind: string; differences: { title: string }[] };
    expect(result.kind).toBe("motionpr-comparison");
    expect(result.differences[0]!.title).toContain("Duration 300ms → 650ms");

    const md = await cli(["compare", "--format", "markdown", "--no-report"], dir);
    expect(md.stdout).toContain("| Result | Critical |");
  }, 180_000);

  it("never replaces a baseline non-interactively without --yes", async () => {
    const r = await cli(["baseline", "accept"], dir);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("Refusing to replace the approved baseline");
    const yes = await cli(["baseline", "accept", "--yes"], dir);
    expect(yes.code).toBe(0);
  });

  it("reports invalid configs with issue paths and exit 2", async () => {
    const bad = join(dir, "bad");
    await mkdir(bad, { recursive: true });
    await writeFile(
      join(bad, "motionpr.config.mjs"),
      `export default { baseURL: "ftp://x", scenarios: [{ id: "a b", steps: [{ type: "click" }] }] };`,
    );
    const r = await cli(["capture", "--json"], bad);
    expect(r.code).toBe(2);
    const error = JSON.parse(r.stdout) as { error: { code: string; issues: { path: string }[] } };
    expect(error.error.code).toBe("CONFIG_INVALID");
    expect(error.error.issues.map((i) => i.path)).toEqual(
      expect.arrayContaining(["baseURL", "scenarios[0].id", "scenarios[0].steps[0].selector"]),
    );
  });

  it("explains a missing config", async () => {
    const empty = await mkdtemp(join(tmpdir(), "motionpr-empty-"));
    const r = await cli(["run"], empty);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("npx motionpr init");
    await rm(empty, { recursive: true, force: true });
  });
});

describe("motionpr run with GSAP, Anime.js and Lenis in one app", () => {
  it("captures, compares and reports records from all three engines", async () => {
    const { serveDemo } = await import("../src/demo/server.ts");
    const server = await serveDemo(join(ROOT, "fixtures/demo-app/dist"));
    const project = await mkdtemp(join(tmpdir(), "motionpr-engines-"));
    try {
      await writeFile(
        join(project, "package.json"),
        JSON.stringify({ name: "engines", type: "module" }),
      );
      await mkdir(join(project, "node_modules/@erenthedeveloper0"), { recursive: true });
      const { symlink } = await import("node:fs/promises");
      await symlink(
        join(ROOT, "packages/cli"),
        join(project, "node_modules/@erenthedeveloper0/motionpr"),
        "dir",
      );
      await writeFile(
        join(project, "motionpr.config.mjs"),
        `import { defineConfig } from "@erenthedeveloper0/motionpr";
export default defineConfig({
  baseURL: process.env.APP_URL,
  browser: { viewport: { width: 1280, height: 800 } },
  capture: { waitForNetworkIdle: false, frames: { enabled: true, fps: 12, maxFrames: 16 } },
  adapters: [
    { name: "gsap", required: true },
    { name: "animejs", required: true },
    { name: "lenis", required: true },
  ],
  scenarios: [
    { id: "gsap-intro", steps: [{ type: "click", selector: "[data-testid=play-intro]" }, { type: "capture", label: "played" }] },
    { id: "anime-services", steps: [
      { type: "scrollIntoView", selector: "[data-testid=services]", block: "start" },
      { type: "waitForAnimations" },
      { type: "click", selector: "[data-testid=reveal-services]" },
      { type: "capture", label: "revealed" },
    ] },
    { id: "lenis-journal", steps: [
      { type: "scrollTo", target: "[data-testid=journal]" },
      { type: "waitForScrollSettled" },
      { type: "capture", label: "scrolled" },
    ] },
  ],
});
`,
      );
      const first = await cli(["run"], project, { APP_URL: `${server.url}/baseline/` });
      expect(first.code, first.stderr).toBe(0);
      const accepted = await cli(["baseline", "accept", "--yes"], project, {
        APP_URL: `${server.url}/baseline/`,
      });
      expect(accepted.code, accepted.stderr + accepted.stdout).toBe(0);
      const same = await cli(["run", "--json"], project, { APP_URL: `${server.url}/baseline/` });
      expect(same.code, same.stderr + same.stdout.slice(0, 2000)).toBe(0);
      const unchanged = JSON.parse(same.stdout) as {
        differences: { severity: string; title: string }[];
      };
      expect(
        unchanged.differences.filter((d) => d.severity !== "info").map((d) => d.title),
      ).toEqual([]);

      const changed = await cli(["run", "--json", "--threshold", "warning"], project, {
        APP_URL: `${server.url}/candidate/`,
      });
      expect(changed.code, changed.stderr).toBe(1);
      const result = JSON.parse(changed.stdout) as {
        differences: { source: string | null; category: string; title: string }[];
        report: string;
      };
      const sources = new Set(result.differences.map((d) => d.source));
      expect([...sources]).toEqual(expect.arrayContaining(["gsap", "animejs", "lenis"]));
      expect(result.differences.some((d) => d.category === "scroll")).toBe(true);

      // The report embeds the real records of every engine.
      const html = await readFile(result.report, "utf8");
      for (const marker of [
        '"source":"animejs"',
        '"source":"gsap"',
        '"source":"lenis"',
        '"scrollMotion":[{',
      ]) {
        expect(html, marker).toContain(marker);
      }
      const capture = JSON.parse(
        await readFile(join(project, ".motionpr/baseline/capture.json"), "utf8"),
      ) as { scenarios: { adapters: { id: string; status: string }[] }[] };
      for (const scenario of capture.scenarios)
        expect(scenario.adapters.map((a) => `${a.id}:${a.status}`).sort()).toEqual([
          "animejs:active",
          "gsap:active",
          "lenis:active",
        ]);
    } finally {
      await server.close();
      await rm(project, { recursive: true, force: true });
    }
  }, 180_000);
});
