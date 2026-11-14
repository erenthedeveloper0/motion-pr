// Prepares a release of @erenthedeveloper0/motionpr for a MANUAL publish.
// It never publishes: it builds, runs the release gates, writes the verified tarball to
// release/, asks npm for a dry run of publishing exactly that file, and prints the command.
//
//   pnpm release:prepare                 everything below
//   pnpm release:prepare --skip-tests    build + packaging gates only (for a second look)
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const skipTests = args.includes("--skip-tests");
const { name, version } = JSON.parse(readFileSync(join(root, "packages/cli/package.json"), "utf8"));
const distTag = /-alpha(?:\.|$)/.test(version)
  ? "alpha"
  : /-beta(?:\.|$)/.test(version)
    ? "beta"
    : /-rc(?:\.|$)/.test(version)
      ? "next"
      : "latest";
const releaseDir = join(root, "release");
const tarball = `${name.replace(/^@/, "").replace("/", "-")}-${version}.tgz`;

const step = (title) => console.log(`\n── ${title}`);
const run = (cmd, cmdArgs, opts = {}) =>
  execFileSync(cmd, cmdArgs, { cwd: root, stdio: "inherit", ...opts });
const fail = (message) => {
  console.error(`\n✗ ${message}`);
  process.exit(1);
};

console.log(`Preparing ${name}@${version} (dist-tag: ${distTag})`);

step("Version metadata");
run("node", ["scripts/sync-version.mjs", "--check"]);
const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
const entry = new RegExp(
  `^## \\[${version.replace(/[.]/g, "\\.")}\\] — \\d{4}-\\d{2}-\\d{2}$`,
  "m",
);
if (!entry.test(changelog)) fail(`CHANGELOG.md has no dated entry "## [${version}] — YYYY-MM-DD".`);
console.log(`  ✓ CHANGELOG.md has a dated entry for ${version}`);

step("Git state");
const status = execFileSync("git", ["status", "--porcelain"], { cwd: root }).toString().trim();
if (status)
  console.log("  ! the working tree has uncommitted changes; publish from a clean, pushed commit");
else console.log("  ✓ working tree is clean");
let tagged = "";
try {
  tagged = execFileSync("git", ["tag", "--points-at", "HEAD"], { cwd: root }).toString().trim();
} catch {
  // no commits yet
}
console.log(
  tagged.split("\n").includes(`v${version}`)
    ? `  ✓ HEAD is tagged v${version}`
    : `  ! HEAD is not tagged v${version} yet (tag it before publishing)`,
);

step("Build");
run("pnpm", ["build"]);

if (!skipTests) {
  step("Quality gates");
  for (const script of [
    "typecheck",
    "lint",
    "format:check",
    "test",
    "test:integration",
    "test:e2e",
  ])
    run("pnpm", [script]);
}

step("Package (packed, installed in a clean project, kept in release/)");
rmSync(releaseDir, { recursive: true, force: true });
run("node", ["scripts/pack-check.mjs", "--install", "--out", releaseDir]);
const kept = existsSync(releaseDir)
  ? readdirSync(releaseDir).filter((f) => f.endsWith(".tgz"))
  : [];
if (kept.length !== 1 || kept[0] !== tarball)
  fail(`expected release/${tarball}, found ${kept.join(", ") || "nothing"}`);

step("npm publish --dry-run (nothing is uploaded)");
const cache = mkdtempSync(join(tmpdir(), "motionpr-npm-cache-"));
try {
  // "./" matters: without it npm reads "release/<file>" as a GitHub owner/repo shorthand.
  run(
    "npm",
    ["publish", `./release/${tarball}`, "--access", "public", "--tag", distTag, "--dry-run"],
    {
      env: { ...process.env, npm_config_cache: cache, npm_config_update_notifier: "false" },
    },
  );
} finally {
  rmSync(cache, { recursive: true, force: true });
}

console.log(`
Ready. Nothing has been published.

Publish it yourself, from the repository root:

  npm publish ./release/${tarball} --access public --tag ${distTag}
`);
