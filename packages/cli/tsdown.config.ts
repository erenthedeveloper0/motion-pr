import { defineConfig, type UserConfig } from "tsdown";

const shared: UserConfig = {
  format: "esm",
  sourcemap: true,
  // Internal workspace packages are bundled; third-party dependencies stay external.
  deps: { alwaysBundle: [/^@motionpr\//] },
  tsconfig: "tsconfig.build.json",
  dts: true,
  fixedExtension: false,
};

export default defineConfig([
  {
    ...shared,
    entry: { index: "src/index.ts", bin: "src/bin.ts" },
    platform: "node",
    target: "node22",
    clean: true,
  },
  {
    ...shared,
    // Ship inside user applications: browser-only, dependency-free, one self-contained file each
    // (separate builds so no chunk is shared between them or with the Node entry).
    entry: { gsap: "src/gsap.ts" },
    platform: "browser",
    target: "es2020",
    clean: false,
  },
  {
    ...shared,
    entry: { animejs: "src/animejs.ts" },
    platform: "browser",
    target: "es2020",
    clean: false,
  },
  {
    ...shared,
    entry: { lenis: "src/lenis.ts" },
    platform: "browser",
    target: "es2020",
    clean: false,
  },
]);
