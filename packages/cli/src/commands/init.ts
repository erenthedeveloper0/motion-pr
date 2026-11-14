import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import * as p from "@clack/prompts";
import { MOTIONPR_INSTALL_SPEC, MotionprError, pathExists, MOTIONPR_PACKAGE } from "@motionpr/core";
import { CONFIG_FILENAMES } from "../config/load.ts";
import { MOTIONPR_DIR_GITIGNORE, configTemplate, workflowTemplate } from "../templates.ts";
import { banner, cwdOf, makeTerminal, printJson, type GlobalOptions } from "./shared.ts";

export interface InitOptions extends GlobalOptions {
  yes?: boolean;
  force?: boolean;
  baseUrl?: string;
  command?: string | false;
  github?: boolean;
  example?: boolean;
}

export interface ProjectInfo {
  framework: string;
  url: string;
  devCommand: string | null;
  packageManager: "npm" | "pnpm" | "yarn" | "bun";
  typescript: boolean;
  hasMotionprDependency: boolean;
  /** Animation engines found in package.json. */
  engines: string[];
}

interface Pkg {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const FRAMEWORKS: { dep: string; name: string; port: number; script?: string }[] = [
  { dep: "next", name: "Next.js", port: 3000 },
  { dep: "nuxt", name: "Nuxt", port: 3000 },
  { dep: "@react-router/dev", name: "React Router", port: 5173 },
  { dep: "@remix-run/dev", name: "Remix", port: 5173 },
  { dep: "astro", name: "Astro", port: 4321 },
  { dep: "@sveltejs/kit", name: "SvelteKit", port: 5173 },
  { dep: "gatsby", name: "Gatsby", port: 8000 },
  { dep: "react-scripts", name: "Create React App", port: 3000, script: "start" },
  { dep: "@angular/core", name: "Angular", port: 4200, script: "start" },
  { dep: "vite", name: "Vite", port: 5173 },
];

export async function detectProject(cwd: string): Promise<ProjectInfo> {
  let pkg: Pkg = {};
  try {
    pkg = JSON.parse(await readFile(join(cwd, "package.json"), "utf8")) as Pkg;
  } catch {
    // not a Node project; static defaults below
  }
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const packageManager = (await pathExists(join(cwd, "pnpm-lock.yaml")))
    ? "pnpm"
    : (await pathExists(join(cwd, "yarn.lock")))
      ? "yarn"
      : (await pathExists(join(cwd, "bun.lockb"))) || (await pathExists(join(cwd, "bun.lock")))
        ? "bun"
        : "npm";
  const run = { npm: "npm run", pnpm: "pnpm", yarn: "yarn", bun: "bun run" }[packageManager];
  const match = FRAMEWORKS.find((f) => deps[f.dep]);
  let framework = match?.name ?? (Object.keys(pkg).length ? "Node project" : "Static site");
  if (match?.dep === "vite" && deps.react) framework = "Vite + React";
  const port = match?.port ?? 3000;
  const script =
    match?.script && pkg.scripts?.[match.script]
      ? match.script
      : pkg.scripts?.dev
        ? "dev"
        : pkg.scripts?.start
          ? "start"
          : null;
  return {
    framework,
    url: `http://localhost:${port}`,
    devCommand: script ? `${run} ${script}` : null,
    packageManager,
    typescript: (await pathExists(join(cwd, "tsconfig.json"))) || Boolean(deps.typescript),
    engines: ["gsap", "animejs", "lenis"].filter((e) => Boolean(deps[e])),
    hasMotionprDependency: Boolean(deps[MOTIONPR_PACKAGE]),
  };
}

function cancelled(value: unknown): value is symbol {
  if (p.isCancel(value)) {
    p.cancel("Setup cancelled. Nothing was written.");
    return true;
  }
  return false;
}

export async function initCommand(options: InitOptions): Promise<number> {
  const t = makeTerminal(options);
  const cwd = cwdOf(options);
  const info = await detectProject(cwd);
  const interactive = t.interactive && !options.yes;
  const existing = (
    await Promise.all(
      CONFIG_FILENAMES.map(async (n) => ((await pathExists(join(cwd, n))) ? n : null)),
    )
  ).filter(Boolean) as string[];

  let baseURL = options.baseUrl ?? info.url;
  let devCommand: string | null =
    options.command === false ? null : (options.command ?? info.devCommand);
  let example = options.example ?? true;
  let github = options.github ?? false;
  let overwrite = options.force ?? false;

  if (interactive) {
    p.intro(
      `${t.brand("◐")} motionpr init  ${t.c.dim(`${info.framework} · ${info.packageManager}`)}`,
    );
    if (existing.length && !overwrite) {
      const answer = await p.confirm({
        message: `${existing[0]} already exists. Replace it?`,
        initialValue: false,
      });
      if (cancelled(answer)) return 2;
      overwrite = answer;
      if (!overwrite) {
        p.outro("Kept your existing config. Run `npx motionpr doctor` to check it.");
        return 0;
      }
    }
    const url = await p.text({
      message: "Where does your app run during development?",
      initialValue: baseURL,
      validate: (v) => (/^https?:\/\/.+/.test(v ?? "") ? undefined : "Enter an http(s) URL"),
    });
    if (cancelled(url)) return 2;
    baseURL = url;
    const cmd = await p.text({
      message: "Command that starts it (empty if you start it yourself)",
      initialValue: devCommand ?? "",
      placeholder: "npm run dev",
    });
    if (cancelled(cmd)) return 2;
    devCommand = cmd.trim() || null;
    const ex = await p.confirm({ message: "Add an example scenario?", initialValue: true });
    if (cancelled(ex)) return 2;
    example = ex;
    const gh = await p.confirm({
      message: "Create a GitHub Actions workflow (.github/workflows/motionpr.yml)?",
      initialValue: false,
    });
    if (cancelled(gh)) return 2;
    github = gh;
  } else {
    banner(t, "init");
    if (existing.length && !overwrite) {
      if (options.json) printJson({ created: [], skipped: existing, reason: "config exists" });
      t.warn(`${existing[0]} already exists; nothing written. Use --force to replace it.`);
      return 0;
    }
  }

  const configName = info.typescript ? "motionpr.config.ts" : "motionpr.config.mjs";
  const created: string[] = [];
  const skipped: string[] = [];
  const write = async (file: string, content: string, replace: boolean) => {
    const full = join(cwd, file);
    if (!replace && (await pathExists(full))) {
      skipped.push(file);
      return;
    }
    await mkdir(join(full, ".."), { recursive: true });
    await writeFile(full, content);
    created.push(file);
  };

  try {
    await write(
      configName,
      configTemplate({
        typescript: info.typescript,
        baseURL,
        devCommand,
        framework: info.framework,
        exampleScenario: example,
        engines: info.engines,
      }),
      overwrite,
    );
    await write(".motionpr/.gitignore", MOTIONPR_DIR_GITIGNORE, false);
    if (github)
      await write(
        ".github/workflows/motionpr.yml",
        workflowTemplate({ packageManager: info.packageManager, nodeVersion: "24" }),
        false,
      );
  } catch (error) {
    throw new MotionprError("INTERNAL", `Could not write files: ${(error as Error).message}`, {
      hint: "Check write permissions in this directory.",
    });
  }

  const add = {
    npm: `npm install -D ${MOTIONPR_INSTALL_SPEC}`,
    pnpm: `pnpm add -D ${MOTIONPR_INSTALL_SPEC}`,
    yarn: `yarn add -D ${MOTIONPR_INSTALL_SPEC}`,
    bun: `bun add -d ${MOTIONPR_INSTALL_SPEC}`,
  }[info.packageManager];
  const exec = { npm: "npx", pnpm: "pnpm exec", yarn: "yarn", bun: "bunx" }[info.packageManager];
  const next = [
    ...(info.hasMotionprDependency ? [] : [add]),
    `${exec} motionpr install`,
    `${exec} motionpr run`,
  ];

  if (options.json) {
    printJson({ created, skipped, project: info, baseURL, devCommand, next });
    return 0;
  }
  if (interactive) {
    p.note(
      [
        ...created.map((f) => `${t.c.green("+")} ${f}`),
        ...skipped.map((f) => `${t.c.dim("=")} ${f} ${t.c.dim("(kept)")}`),
      ].join("\n"),
      "Files",
    );
    p.note(
      [
        `${t.c.dim("1.")} ${t.tech(next[0]!)}`,
        ...next.slice(1).map((n, i) => `${t.c.dim(`${i + 2}.`)} ${t.tech(n)}`),
        "",
        t.c.dim("The first run has no baseline yet: review the report, then approve it with"),
        t.tech(`${exec} motionpr baseline accept`),
      ].join("\n"),
      "Next steps",
    );
    p.outro(`Config ready at ${relative(process.cwd(), join(cwd, configName)) || configName}`);
    return 0;
  }
  for (const f of created) t.success(`Created ${f}`);
  for (const f of skipped) t.info(`Kept existing ${f}`);
  t.info(
    `Detected ${info.framework} (${info.packageManager}); baseURL ${baseURL}${devCommand ? `, starts with \`${devCommand}\`` : ""}`,
  );
  t.write();
  t.write(`  ${t.c.dim("Chromium is downloaded separately (about 150 MB) the first time:")}`);
  t.next(next);
  return 0;
}
