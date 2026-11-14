import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const REPORT = pathToFileURL(resolve(".tmp/e2e/report/index.html")).href;

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(REPORT);
  await expect(page.getByRole("navigation", { name: "Scenarios" })).toBeVisible();
  return errors;
}

const playhead = (page: Page) => page.getByLabel("Playhead time");

test("loads offline from file:// with no errors and no network", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith("file:") &&
      !r.url().startsWith("data:") &&
      !r.url().startsWith("blob:")
    )
      requests.push(r.url());
  });
  const errors = await open(page);
  await expect(page.getByText("Regression")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Scenarios" }).getByRole("button")).toHaveCount(
    12,
  ); // 11 scenarios + 1 checkpoint of the selected one
  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
});

test("selects scenarios and checkpoints", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /Navigation menu opens and closes/ }).click();
  await expect(page.getByRole("button", { name: "closed" })).toBeVisible();
  await page.getByRole("button", { name: "closed" }).click();
  await expect(page.getByRole("button", { name: "closed" })).toHaveAttribute(
    "aria-current",
    "true",
  );
});

test("plays, pauses, steps and scrubs in sync", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /Navigation menu opens and closes/ }).click();
  await expect(playhead(page)).toHaveText("00.000");
  await page.getByRole("button", { name: "Next frame" }).click();
  await expect(playhead(page)).toHaveText("00.042");
  await page.keyboard.press("End");
  await expect(playhead(page)).not.toHaveText("00.042");
  await page.keyboard.press("Home");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(playhead(page)).not.toHaveText("00.000");
  await page.getByRole("button", { name: "Pause" }).click();
  const paused = await playhead(page).textContent();
  await page.waitForTimeout(150);
  await expect(playhead(page)).toHaveText(paused!);
  // Both panes show frames from the same instant.
  const labels = await page.getByText(/frame @/).allTextContents();
  expect(new Set(labels).size).toBe(1);
});

test("timeline track selection drives the inspector", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /Navigation menu opens and closes/ }).click();
  await page.locator("[data-track='motionpr-id:nav-panel::css-transition::transform']").click();
  const inspector = page.getByRole("tabpanel");
  await expect(inspector.getByRole("heading", { name: "nav-panel" })).toBeVisible();
  await expect(inspector.getByText("Duration 320ms → 560ms (+240ms, +75%)")).toBeVisible();
  await expect(inspector.getByRole("img", { name: /Baseline cubic-bezier/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(inspector.getByText("Select a track in the timeline")).toBeVisible();
});

test("switches comparison modes; the wipe divider works by keyboard", async ({ page }) => {
  await open(page);
  await page.keyboard.press("4");
  const wipe = page.getByRole("slider", { name: "Wipe position" });
  await expect(wipe).toHaveAttribute("aria-valuenow", "50");
  await wipe.focus();
  await page.keyboard.press("ArrowRight");
  await expect(wipe).toHaveAttribute("aria-valuenow", "52");
  await page.getByRole("radio", { name: "Difference blend" }).click();
  await expect(page.getByAltText("Candidate frame (difference blend)")).toBeVisible();
  await page.getByRole("radio", { name: "Onion skin + motion paths" }).click();
  await expect(page.getByRole("img", { name: /Motion paths/ })).toBeVisible();
  await page.getByRole("radio", { name: "Side by side" }).click();
  await expect(page.getByAltText(/Baseline frame at/)).toBeVisible();
});

test("difference explorer filters and navigates", async ({ page }) => {
  await open(page);
  await page.getByRole("tab", { name: /Differences/ }).click();
  await page
    .getByRole("group", { name: "Category filters" })
    .getByRole("button", { name: /Removed/ })
    .click();
  const list = page.getByRole("tabpanel").getByRole("listitem");
  await expect(list).toHaveCount(1);
  await list.first().getByRole("button").click();
  await expect(
    page.getByRole("tabpanel").getByRole("heading", { name: "case-image" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Case study image reveal/ })).toHaveAttribute(
    "aria-current",
    "true",
  );
});

test("command menu jumps to a scenario", async ({ page }) => {
  await open(page);
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Command menu" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox").fill("gsap hero");
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: /GSAP hero timeline/ })).toHaveAttribute(
    "aria-current",
    "true",
  );
});

test("exports comparison.json and shows shortcuts", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Export" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: /Download comparison.json/ }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("comparison.json");
  await page.keyboard.press("Escape");
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
});

test("remains usable with reduced motion", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await open(page);
  await page.getByRole("button", { name: /FAQ accordion/ }).click();
  await page.getByRole("button", { name: "Next frame" }).click();
  await expect(playhead(page)).not.toHaveText("00.000");
  await context.close();
});

test("filters timeline rows by engine and inspects Lenis scroll motion", async ({ page }) => {
  const errors = await open(page);
  await page.getByRole("button", { name: /Lenis smooth scroll to the journal/ }).click();
  await page.getByRole("button", { name: "scrolled" }).click();
  const filter = page.getByRole("group", { name: "Filter by engine" });
  await expect(filter.getByRole("button", { name: "Lenis" })).toBeVisible();
  await expect(filter.getByRole("button", { name: "GSAP" })).toBeVisible();
  // Scroll lane → scroll inspector with metrics and charts synchronized to the playhead.
  await page.getByRole("gridcell", { name: /Lenis · page, scroll motion/ }).click();
  await expect(page.getByText("Scroll position over time")).toBeVisible();
  await expect(page.getByText("Velocity (derived from rendered positions)")).toBeVisible();
  await expect(
    page.getByText("Normalized progress over the movement (scroll easing)"),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "lerp" }).or(page.getByText("lerp", { exact: true })),
  ).toBeVisible();
  await expect(page.getByText(/Scroll takes \d+ms → \d+ms to settle/).first()).toBeVisible();
  // Engine filter: only GSAP hides the Lenis lane and keeps the ScrollTrigger track.
  await filter.getByRole("button", { name: "GSAP" }).click();
  await expect(page.getByRole("gridcell", { name: /Lenis · page, scroll motion/ })).toHaveCount(0);
  await expect(
    page.locator("[data-track='motionpr-id:journal-image::gsap::anonymous']"),
  ).toBeVisible();
  await filter.getByRole("button", { name: "GSAP" }).click();
  await expect(page.getByRole("gridcell", { name: /Lenis · page, scroll motion/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("shows Anime.js identity, provenance and timeline membership", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /Anime\.js process timeline/ }).click();
  await expect(page.getByRole("gridcell", { name: /^process/ }).first()).toBeVisible();
  await page.locator("[data-track^='motionpr-id:process-bar']").click();
  await expect(page.getByText(/Anime\.js · rendered by JavaScript/)).toBeVisible();
  await expect(page.getByText(/timeline process/)).toBeVisible();
  await expect(page.getByText(/startTime: observed/)).toBeVisible();
});

test("difference explorer jumps to scroll records", async ({ page }) => {
  await open(page);
  await page.getByRole("tab", { name: /Differences/ }).click();
  await page.getByRole("button", { name: /Lenis scroll: Scroll setting lerp/ }).click();
  await expect(page.getByText("Scroll position over time")).toBeVisible();
});
