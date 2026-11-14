// Copies non-code assets into dist/: the report viewer template and the demo application.
import { cp, mkdir, copyFile, access, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const dist = here("../dist/");
const must = async (path, hint) => {
  try {
    await access(path);
  } catch {
    console.error(`copy-assets: missing ${path}\n  ${hint}`);
    process.exit(1);
  }
};

const viewer = here("../../report/dist/index.html");
await must(viewer, "Build the viewer first: pnpm --filter @motionpr/report build");
await mkdir(`${dist}viewer`, { recursive: true });
await copyFile(viewer, `${dist}viewer/index.html`);

const demo = here("../../../fixtures/demo-app/dist/");
await must(`${demo}index.html`, "Build the demo app first: pnpm --filter @motionpr/demo-app build");
await cp(demo, `${dist}demo-app`, { recursive: true });

// npm shows the README without the repository around it: make relative links and images
// absolute (GitHub blob links for documents, raw URLs for images).
const REPO = "https://github.com/erenthedeveloper0/motion-pr";
const RAW = "https://raw.githubusercontent.com/erenthedeveloper0/motion-pr/main";
export function absolutizeReadme(markdown) {
  return markdown
    .replace(/(src|srcset)="(?!https?:)([^"]+)"/g, (_, attr, path) => `${attr}="${RAW}/${path}"`)
    .replace(/\]\((?!https?:|mailto:|#)([^)\s]+)\)/g, (_, path) => `](${REPO}/blob/main/${path})`);
}

for (const file of ["README.md", "LICENSE", "THIRD_PARTY_NOTICES.md"]) {
  const source = here(`../../../${file}`);
  try {
    await access(source);
  } catch {
    continue;
  }
  if (file === "README.md") {
    await writeFile(here(`../${file}`), absolutizeReadme(await readFile(source, "utf8")));
  } else {
    await copyFile(source, here(`../${file}`));
  }
}
console.log("copy-assets: viewer and demo app copied");
