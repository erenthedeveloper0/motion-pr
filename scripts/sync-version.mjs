// Keeps every workspace package and packages/core/src/version.ts on the version of the public
// package (packages/cli/package.json).
//
//   node scripts/sync-version.mjs 0.1.0-alpha.1   set the version everywhere
//   node scripts/sync-version.mjs                 copy packages/cli's version everywhere
//   node scripts/sync-version.mjs --check         exit 1 when anything is out of sync
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const check = args.includes("--check");
const requested = args.find((a) => !a.startsWith("--"));
// Semantic Versioning 2.0.0, with the prerelease identifiers this project publishes.
const SEMVER = /^\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)(?:\.\d+)?)?$/;

const cliFile = `${root}packages/cli/package.json`;
const cliText = await readFile(cliFile, "utf8");
const current = JSON.parse(cliText).version;
if (requested && !SEMVER.test(requested)) {
  console.error(
    `"${requested}" is not a version this project publishes (x.y.z or x.y.z-alpha[.n], -beta[.n], -rc[.n]).`,
  );
  process.exit(2);
}
const version = requested ?? current;
let drift = 0;

const packages = [
  "packages/cli",
  "packages/core",
  "packages/capture",
  "packages/comparison",
  "packages/report",
  "packages/adapters/gsap",
  "packages/adapters/animejs",
  "packages/adapters/lenis",
];
for (const dir of packages) {
  const file = `${root}${dir}/package.json`;
  const text = await readFile(file, "utf8");
  const json = JSON.parse(text);
  if (json.version === version) continue;
  drift++;
  console.log(`${dir}: ${json.version} → ${version}`);
  if (!check)
    await writeFile(file, text.replace(`"version": "${json.version}"`, `"version": "${version}"`));
}
const versionFile = `${root}packages/core/src/version.ts`;
const source = await readFile(versionFile, "utf8");
const updated = source.replace(/MOTIONPR_VERSION = "[^"]+"/, `MOTIONPR_VERSION = "${version}"`);
if (updated !== source) {
  drift++;
  console.log(`packages/core/src/version.ts → ${version}`);
  if (!check) await writeFile(versionFile, updated);
}
if (check && drift) process.exit(1);
console.log(drift ? `synced to ${version}` : `all packages at ${version}`);
