// Builds the static demo app into dist/: copies the page, vendors GSAP (+ ScrollTrigger), Anime.js
// and Lenis with MotionPR's adapters (as IIFEs), and bundles the Geist font so screenshots look
// the same on every OS.
import { cp, copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
await rm(dist, { recursive: true, force: true });
await cp(join(root, "src"), dist, { recursive: true });
await mkdir(join(dist, "vendor"), { recursive: true });
const gsapDist = join(dirname(require.resolve("gsap/package.json")), "dist");
await copyFile(join(gsapDist, "gsap.min.js"), join(dist, "vendor", "gsap.min.js"));
await copyFile(
  join(gsapDist, "ScrollTrigger.min.js"),
  join(dist, "vendor", "ScrollTrigger.min.js"),
);
await copyFile(
  join(dirname(require.resolve("animejs/package.json")), "dist", "bundles", "anime.umd.min.js"),
  join(dist, "vendor", "anime.umd.min.js"),
);
// lenis does not export ./package.json; its entry sits in dist/.
const lenisDist = dirname(require.resolve("lenis"));
await copyFile(join(lenisDist, "lenis.min.js"), join(dist, "vendor", "lenis.min.js"));
await copyFile(join(lenisDist, "lenis.css"), join(dist, "vendor", "lenis.css"));

// MotionPR adapters as IIFEs (the published @erenthedeveloper0/motionpr/gsap|animejs|lenis are the same code as ESM).
const adapters = [
  ["gsap", "MotionprGsap"],
  ["animejs", "MotionprAnime"],
  ["lenis", "MotionprLenis"],
];
for (const [name, globalName] of adapters) {
  const result = await build({
    entryPoints: [
      fileURLToPath(new URL(`../../../packages/adapters/${name}/src/index.ts`, import.meta.url)),
    ],
    bundle: true,
    format: "iife",
    globalName,
    platform: "browser",
    target: "es2020",
    minify: true,
    write: false,
  });
  await writeFile(join(dist, "vendor", `motionpr-${name}.js`), result.outputFiles[0].text);
}
const font = (pkg, file) => join(dirname(require.resolve(`${pkg}/package.json`)), "files", file);
await mkdir(join(dist, "fonts"), { recursive: true });
await copyFile(
  font("@fontsource-variable/geist", "geist-latin-wght-normal.woff2"),
  join(dist, "fonts", "geist.woff2"),
);
await copyFile(
  font("@fontsource-variable/geist-mono", "geist-mono-latin-wght-normal.woff2"),
  join(dist, "fonts", "geist-mono.woff2"),
);
console.log("demo-app built");
