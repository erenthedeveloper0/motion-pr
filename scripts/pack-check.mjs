// Packs the public package (packages/cli) exactly as it will be published and verifies the
// tarball: an allowlist of files, entry points, optional engine peers, the report template, that
// the browser entry points load standalone, and that `npm pack --dry-run` agrees on the contents.
//
//   node scripts/pack-check.mjs                 pack and verify
//   node scripts/pack-check.mjs --install       also install the tarball into a clean project
//                                               outside the workspace, run the CLI, import every
//                                               entry point and type-check against them
//   node scripts/pack-check.mjs --out <dir>     keep the verified tarball in <dir>
//
// pnpm packs the tarball because it rewrites the workspace's catalog:/workspace: specifiers;
// that tarball, unchanged, is what gets published.
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const cli = join(root, "packages/cli");
const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const keepDir = outIndex >= 0 ? resolve(args[outIndex + 1] ?? "") : null;
const work = mkdtempSync(join(tmpdir(), "motionpr-pack-"));
const npmEnv = {
  ...process.env,
  npm_config_cache: join(work, "npm-cache"),
  npm_config_update_notifier: "false",
};
const failures = [];
const check = (ok, message) => {
  console.log(`  ${ok ? "✓" : "✗"} ${message}`);
  if (!ok) failures.push(message);
};

// Everything the tarball may contain. Anything else (sources, tests, docs, roadmaps, build
// status, the docs website, brand files, scripts) is a packaging mistake.
const ALLOWED = [
  /^package\.json$/,
  /^README\.md$/,
  /^LICENSE$/,
  /^THIRD_PARTY_NOTICES\.md$/,
  /^dist\/[\w.-]+\.(js|d\.ts|js\.map)$/,
  /^dist\/viewer\/index\.html$/,
  /^dist\/demo-app\/.+$/,
];

let tarballPath;
try {
  execFileSync("pnpm", ["pack", "--pack-destination", work], { cwd: cli, stdio: "pipe" });
  const tarball = readdirSync(work).find((f) => f.endsWith(".tgz"));
  if (!tarball) throw new Error("pnpm pack produced no tarball");
  tarballPath = join(work, tarball);
  const size = statSync(tarballPath).size;
  const extract = join(work, "extract");
  mkdirSync(extract);
  execFileSync("tar", ["-xzf", tarballPath, "-C", extract]);
  const pkgDir = join(extract, "package");
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else files.push(relative(pkgDir, p).split("\\").join("/"));
    }
  };
  walk(pkgDir);
  files.sort();
  const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
  console.log(
    `${pkg.name}@${pkg.version}: ${files.length} files, ${(size / 1024).toFixed(0)} kB packed → ${tarball}`,
  );

  for (const required of [
    "dist/index.js",
    "dist/index.d.ts",
    "dist/bin.js",
    "dist/gsap.js",
    "dist/gsap.d.ts",
    "dist/animejs.js",
    "dist/animejs.d.ts",
    "dist/lenis.js",
    "dist/lenis.d.ts",
    "dist/viewer/index.html",
    "dist/demo-app/index.html",
    "README.md",
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
  ])
    check(files.includes(required), `contains ${required}`);
  const unexpected = files.filter((f) => !ALLOWED.some((re) => re.test(f)));
  check(
    unexpected.length === 0,
    `every file is on the allowlist${unexpected.length ? `: ${unexpected.join(", ")}` : ""}`,
  );

  // npm's own packer must agree with pnpm's on what ships.
  const npmList = JSON.parse(
    execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
      cwd: cli,
      env: npmEnv,
      stdio: ["ignore", "pipe", "pipe"],
    }).toString(),
  )[0]
    .files.map((f) => f.path)
    .sort();
  const onlyNpm = npmList.filter((f) => !files.includes(f));
  const onlyPnpm = files.filter((f) => !npmList.includes(f));
  check(
    onlyNpm.length === 0 && onlyPnpm.length === 0,
    `npm pack --dry-run lists the same ${npmList.length} files${onlyNpm.length || onlyPnpm.length ? ` (npm only: ${onlyNpm.join(", ")}; pnpm only: ${onlyPnpm.join(", ")})` : ""}`,
  );

  check(pkg.name === "@erenthedeveloper0/motionpr", `name is @erenthedeveloper0/motionpr`);
  check(pkg.publishConfig?.access === "public", "publishConfig.access is public");
  check(
    !pkg.publishConfig?.provenance,
    "no provenance (it can only be generated in CI, and publishing is manual)",
  );
  check(!pkg.private, "package is not private");
  for (const [entry, target] of Object.entries(pkg.exports)) {
    const paths = typeof target === "string" ? [target] : Object.values(target);
    for (const p of paths) check(existsSync(join(pkgDir, p)), `export ${entry} → ${p} exists`);
  }
  check(Object.keys(pkg.bin ?? {}).join() === "motionpr", "bin is exactly motionpr");
  check(existsSync(join(pkgDir, pkg.bin.motionpr)), "bin motionpr exists");
  check(
    readFileSync(join(pkgDir, pkg.bin.motionpr), "utf8").startsWith("#!/usr/bin/env node"),
    "bin has a node shebang",
  );

  const deps = Object.keys(pkg.dependencies ?? {});
  check(
    !deps.some((d) => d.startsWith("@motionpr/")),
    "no private @motionpr/* workspace package is a dependency",
  );
  for (const engine of ["gsap", "animejs", "lenis"]) {
    check(!deps.includes(engine), `${engine} is not a dependency`);
    check(pkg.peerDependenciesMeta?.[engine]?.optional === true, `${engine} is an optional peer`);
  }
  const allDeps = { ...pkg.dependencies, ...pkg.peerDependencies, ...pkg.devDependencies };
  check(
    !Object.values(allDeps).some(
      (v) => String(v).startsWith("workspace:") || String(v).startsWith("catalog:"),
    ),
    "no workspace:/catalog: specifiers leak into the published manifest",
  );

  for (const map of files.filter((f) => f.endsWith(".map"))) {
    const m = JSON.parse(readFileSync(join(pkgDir, map), "utf8"));
    check(
      Array.isArray(m.sourcesContent) &&
        m.sourcesContent.length === m.sources.length &&
        m.sourcesContent.every((s) => typeof s === "string"),
      `${map} embeds the sources it points at`,
    );
  }

  const readme = readFileSync(join(pkgDir, "README.md"), "utf8");
  check(
    !/\]\((?!https?:|mailto:|#)[^)]+\)|(?:src|srcset)="(?!https?:)/.test(readme),
    "README has only absolute links and images (npm renders it outside the repository)",
  );
  check(
    readme.includes(`npm install -D ${pkg.name}`),
    "README shows the install command for this package",
  );
  const viewer = readFileSync(join(pkgDir, "dist/viewer/index.html"), "utf8");
  check(
    /<script id="motionpr-report-data" type="application\/json">\s*__MOTIONPR_REPORT_DATA__\s*<\/script>/.test(
      viewer,
    ),
    "report template has exactly the data element",
  );
  check(
    !/https?:\/\/(?!www\.w3\.org)[^"' )]+\.(js|css)\b/.test(viewer),
    "report template loads no remote scripts or styles",
  );

  for (const [entry, names] of [
    ["gsap", ["motionprGsap", "gsapProperties", "SUPPORTED_GSAP_RANGE"]],
    [
      "animejs",
      ["createAnimeInstrumentation", "resolveEaseName", "sampleEase", "SUPPORTED_ANIMEJS_RANGE"],
    ],
    ["lenis", ["motionprLenis", "readState", "SUPPORTED_LENIS_RANGE"]],
  ]) {
    const file = join(pkgDir, `dist/${entry}.js`);
    const source = readFileSync(file, "utf8");
    check(
      !/^\s*import\s.+from\s/m.test(source),
      `${pkg.name}/${entry} has no imports (standalone browser code)`,
    );
    const mod = await import(pathToFileURL(file).href);
    check(
      names.every((n) => n in mod),
      `${pkg.name}/${entry} exports ${names.join(", ")}`,
    );
  }

  if (args.includes("--install")) {
    // A clean project outside the workspace, so nothing resolves through workspace symlinks.
    const app = join(work, "app");
    mkdirSync(app);
    writeFileSync(
      join(app, "package.json"),
      JSON.stringify({ name: "motionpr-install-check", private: true, type: "module" }),
    );
    execFileSync("npm", ["install", "--no-audit", "--no-fund", "--save-dev", tarballPath], {
      cwd: app,
      stdio: "pipe",
      env: npmEnv,
    });
    const bin = join(app, "node_modules/.bin/motionpr");
    const version = execFileSync(bin, ["--version"], { cwd: app }).toString().trim();
    check(version === pkg.version, `installed CLI runs (motionpr --version → ${version})`);
    const help = execFileSync(bin, ["--help"], { cwd: app }).toString();
    check(
      [
        "init",
        "install",
        "capture",
        "compare",
        "run",
        "baseline",
        "report",
        "doctor",
        "demo",
      ].every((c) => help.includes(c)),
      "motionpr --help lists every command",
    );
    const npx = execFileSync("npx", ["--no-install", "motionpr", "--version"], {
      cwd: app,
      env: npmEnv,
    })
      .toString()
      .trim();
    check(npx === pkg.version, `npx motionpr resolves the installed bin (→ ${npx})`);
    const probe = `
      const m = await import("${pkg.name}");
      const g = await import("${pkg.name}/gsap");
      const a = await import("${pkg.name}/animejs");
      const l = await import("${pkg.name}/lenis");
      const p = await import("${pkg.name}/package.json", { with: { type: "json" } });
      console.log(JSON.stringify({
        defineConfig: typeof m.defineConfig, loadConfig: typeof m.loadConfig, compareCaptures: typeof m.compareCaptures,
        gsap: typeof g.motionprGsap?.register, animejs: typeof a.createAnimeInstrumentation, lenis: typeof l.motionprLenis?.attach,
        version: m.MOTIONPR_VERSION, pkg: p.default.version,
      }));`;
    const api = JSON.parse(
      execFileSync(process.execPath, ["--input-type=module", "-e", probe], { cwd: app }).toString(),
    );
    check(
      api.defineConfig === "function" &&
        api.loadConfig === "function" &&
        api.compareCaptures === "function",
      `${pkg.name} exports defineConfig, loadConfig, compareCaptures`,
    );
    check(
      api.gsap === "function" && api.animejs === "function" && api.lenis === "function",
      "the gsap, animejs and lenis entry points resolve through the exports map",
    );
    check(
      api.version === pkg.version && api.pkg === pkg.version,
      `MOTIONPR_VERSION and package.json agree (${api.version})`,
    );
    // Type-check a consumer against the published declarations (TypeScript from the workspace).
    writeFileSync(
      join(app, "consumer.ts"),
      `import { defineConfig, type MotionprConfig } from "${pkg.name}";
import { motionprGsap, SUPPORTED_GSAP_RANGE } from "${pkg.name}/gsap";
import { createAnimeInstrumentation } from "${pkg.name}/animejs";
import { motionprLenis } from "${pkg.name}/lenis";
const config: MotionprConfig = defineConfig({ baseURL: "http://localhost:3000", scenarios: [{ id: "home", steps: [{ type: "capture", label: "loaded" }] }] });
export { config, motionprGsap, SUPPORTED_GSAP_RANGE, createAnimeInstrumentation, motionprLenis };
`,
    );
    writeFileSync(
      join(app, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          module: "nodenext",
          moduleResolution: "nodenext",
          target: "es2022",
          strict: true,
          noEmit: true,
          skipLibCheck: false,
          lib: ["es2022", "dom"],
          types: ["node"],
        },
        files: ["consumer.ts"],
      }),
    );
    // @types/node (and its undici-types) come from the workspace, so the check needs no download.
    const typesNode = join(root, "node_modules/@types/node");
    if (existsSync(typesNode)) {
      mkdirSync(join(app, "node_modules/@types"), { recursive: true });
      execFileSync("cp", ["-RL", typesNode, join(app, "node_modules/@types/node")]);
      const undici = join(realpathSync(typesNode), "../../undici-types");
      if (existsSync(undici))
        execFileSync("cp", ["-RL", undici, join(app, "node_modules/undici-types")]);
    }
    const tsc = join(root, "node_modules/typescript/bin/tsc");
    let typeErrors = "";
    try {
      execFileSync(process.execPath, [tsc, "-p", "tsconfig.json"], { cwd: app, stdio: "pipe" });
    } catch (error) {
      typeErrors = `${error.stdout ?? ""}${error.stderr ?? ""}`.trim();
    }
    check(
      typeErrors === "",
      `a consumer type-checks against the published declarations${typeErrors ? `:\n${typeErrors}` : ""}`,
    );
  }

  if (keepDir && failures.length === 0) {
    mkdirSync(keepDir, { recursive: true });
    copyFileSync(tarballPath, join(keepDir, tarball));
    console.log(`\nkept ${relative(root, join(keepDir, tarball))}`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\npack-check failed: ${failures.length} problem(s)`);
  process.exit(1);
}
console.log("\npack-check passed");
