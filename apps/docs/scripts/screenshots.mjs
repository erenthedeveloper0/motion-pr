// Real screenshots of the MotionPR report viewer for the documentation (docs/images/), taken from
// a report of the demo app (pnpm demo:capture --html .tmp/demo-report).
//   node apps/docs/scripts/screenshots.mjs [--report <dir>]
import { chromium } from "playwright-core";
import { resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const args = process.argv.slice(2);
const i = args.indexOf("--report");
const report = resolve(i >= 0 ? args[i + 1] : `${root}.tmp/demo-report`);
const out = `${root}docs/images`;
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  colorScheme: "dark",
  reducedMotion: "reduce",
});
await page.goto(pathToFileURL(`${report}/index.html`).href);
await page.waitForTimeout(1500);
const target = process.env.SHOT ?? "overview";
await page.screenshot({ path: `${out}/report-${target}.png` });
console.log(`wrote docs/images/report-${target}.png`);
await browser.close();
