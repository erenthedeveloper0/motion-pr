import { z } from "zod";
import { BROWSER_NAMES } from "../browsers.ts";

const selector = z.string().min(1, "selector must not be empty");
const httpUrl = z.url({ protocol: /^https?$/, error: "must be an http(s) URL" });
const ms = (max = 600_000) => z.number().int().min(0).max(max);
const position = z.object({ x: z.number(), y: z.number() });

/** Labels become file-system and URL friendly identifiers in reports. */
const label = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9 _.-]*$/, "use letters, digits, spaces, '.', '_' or '-'");

// ---------------------------------------------------------------------------------------------
// Scenario steps (the interaction DSL)
// ---------------------------------------------------------------------------------------------

export const gotoStepSchema = z.object({
  type: z.literal("goto"),
  /** Path relative to `baseURL`. */
  path: z.string().optional(),
  /** Absolute URL (takes precedence over `path`). */
  url: httpUrl.optional(),
  waitUntil: z.enum(["load", "domcontentloaded", "networkidle", "commit"]).optional(),
});

export const clickStepSchema = z.object({
  type: z.literal("click"),
  selector,
  button: z.enum(["left", "right", "middle"]).optional(),
  clickCount: z.number().int().min(1).max(3).optional(),
  /** Click position relative to the element's top-left corner. */
  position: position.optional(),
  /** Skip Playwright's actionability checks. */
  force: z.boolean().optional(),
  timeout: ms().optional(),
});

export const hoverStepSchema = z.object({
  type: z.literal("hover"),
  selector,
  position: position.optional(),
  force: z.boolean().optional(),
  timeout: ms().optional(),
});

export const moveStepSchema = z.object({
  type: z.literal("move"),
  /** Viewport coordinates in CSS pixels. */
  x: z.number(),
  y: z.number(),
  /** Number of intermediate mousemove events. */
  steps: z.number().int().min(1).max(100).optional(),
});

export const scrollStepSchema = z.object({
  type: z.literal("scroll"),
  /** Absolute scroll position in CSS pixels. Omitted axes keep their current position. */
  x: z.number().optional(),
  y: z.number().optional(),
  /** Scroll a container instead of the window. */
  selector: selector.optional(),
});

export const scrollToStepSchema = z.object({
  type: z.literal("scrollTo"),
  /** Destination: px offset on the scroll axis, or a selector of an element to bring into view. */
  target: z.union([z.number(), selector]),
  /** `smooth` lets the page's scroll engine (Lenis or the browser) animate; `instant` jumps. */
  behavior: z.enum(["smooth", "instant"]).default("smooth"),
  /**
   * `auto` uses a registered Lenis instance when present, otherwise native scrolling.
   * `lenis` requires a Lenis adapter; `native` always uses the browser's scrollTo.
   */
  via: z.enum(["auto", "lenis", "native"]).default("auto"),
  /** Scroll axis for numeric targets (default: the Lenis orientation, else vertical). */
  axis: z.enum(["vertical", "horizontal"]).optional(),
  /** Pixels added to the destination (Lenis `offset`; native: added to the position). */
  offset: z.number().optional(),
  /** Scroll a container instead of the document (native scrolling only). */
  selector: selector.optional(),
});

export const wheelStepSchema = z.object({
  type: z.literal("wheel"),
  /** Wheel delta in CSS pixels, like a real mouse wheel or trackpad. */
  deltaX: z.number().default(0),
  deltaY: z.number().default(0),
  /** Split the delta into this many wheel events, `interval` ms apart (default 1). */
  steps: z.number().int().min(1).max(100).default(1),
  interval: ms(1000).default(16),
  /**
   * Move the pointer over this element first (its centre), so the wheel scrolls the scroll
   * container under it. It must be in the viewport: MotionPR does not scroll to reach it.
   */
  selector: selector.optional(),
  /**
   * Where the pointer goes first: viewport CSS px, or with `selector` relative to the element's
   * top-left corner. Defaults to the viewport centre (the element's centre with `selector`).
   */
  position: position.optional(),
});

export const waitForScrollSettledStepSchema = z.object({
  type: z.literal("waitForScrollSettled"),
  /** Give up (with a warning diagnostic, not a failure) after this many ms. */
  timeout: ms().default(5000),
  /** Movement per sample (px) below which the scroller counts as still. */
  threshold: z.number().min(0).max(100).default(0.5),
  /** Consecutive still samples required. */
  stableFrames: z.number().int().min(1).max(120).default(6),
  /** Minimum still time in ms, so low frame rates cannot settle early. */
  minStableMs: ms(10_000).default(100),
});

export const scrollIntoViewStepSchema = z.object({
  type: z.literal("scrollIntoView"),
  selector,
  block: z.enum(["start", "center", "end", "nearest"]).optional(),
  timeout: ms().optional(),
});

export const fillStepSchema = z.object({
  type: z.literal("fill"),
  selector,
  /** Value to type. Never written to capture files or reports. */
  value: z.string(),
  timeout: ms().optional(),
});

export const pressStepSchema = z.object({
  type: z.literal("press"),
  /** Key name as understood by Playwright, e.g. `Enter`, `Escape`, `Tab`, `ArrowDown`. */
  key: z.string().min(1),
  /** Focus this element first. */
  selector: selector.optional(),
  timeout: ms().optional(),
});

export const waitForStepSchema = z.object({
  type: z.literal("waitFor"),
  selector,
  state: z.enum(["attached", "detached", "visible", "hidden"]).optional(),
  timeout: ms().optional(),
});

export const waitForAnimationsStepSchema = z.object({
  type: z.literal("waitForAnimations"),
  /** Maximum time to wait for running finite animations, in ms. */
  timeout: ms().optional(),
});

export const waitStepSchema = z.object({
  type: z.literal("wait"),
  /** Fixed delay in ms. Prefer `waitFor` / `waitForAnimations`; use this only for timers. */
  duration: ms(60_000),
});

export const captureStepSchema = z.object({
  type: z.literal("capture"),
  /** Checkpoint name, unique within the scenario. */
  label,
  /** Capture a filmstrip of frames across the motion window (default: `capture.frames.enabled`). */
  frames: z.boolean().optional(),
  /** Override `capture.maxWindow` for this checkpoint (ms). */
  maxWindow: ms(60_000).optional(),
  /** Take the settled screenshot used for visual comparison (default true). */
  screenshot: z.boolean().optional(),
});

export const screenshotStepSchema = z.object({
  type: z.literal("screenshot"),
  /** Checkpoint name, unique within the scenario. */
  label,
  fullPage: z.boolean().optional(),
  /** Screenshot a single element instead of the viewport. */
  selector: selector.optional(),
});

export const stepSchema = z.discriminatedUnion("type", [
  gotoStepSchema,
  clickStepSchema,
  hoverStepSchema,
  moveStepSchema,
  scrollStepSchema,
  scrollToStepSchema,
  wheelStepSchema,
  waitForScrollSettledStepSchema,
  scrollIntoViewStepSchema,
  fillStepSchema,
  pressStepSchema,
  waitForStepSchema,
  waitForAnimationsStepSchema,
  waitStepSchema,
  captureStepSchema,
  screenshotStepSchema,
]);

export const scenarioSchema = z
  .object({
    /** Stable identifier used to match scenarios across captures. */
    id: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/, "use letters, digits, '.', '_' or '-' (no spaces)"),
    name: z.string().min(1).optional(),
    /** Path relative to `baseURL` to open before the steps run (default `/`). */
    path: z.string().optional(),
    /** Absolute URL to open instead of `baseURL` + `path`. */
    url: httpUrl.optional(),
    /** Names of viewports to run this scenario in (default: all). */
    viewports: z.array(z.string()).optional(),
    steps: z.array(stepSchema).default([]),
    /** Overall scenario timeout in ms. */
    timeout: ms(1_800_000).optional(),
    /** Skip the scenario. A string documents why. */
    skip: z.union([z.boolean(), z.string()]).optional(),
    tags: z.array(z.string()).optional(),
  })
  .superRefine((scenario, ctx) => {
    const seen = new Set<string>();
    scenario.steps.forEach((step, index) => {
      if (step.type !== "capture" && step.type !== "screenshot") return;
      if (seen.has(step.label)) {
        ctx.addIssue({
          code: "custom",
          path: ["steps", index, "label"],
          message: `duplicate checkpoint label "${step.label}" in scenario "${scenario.id}"`,
        });
      }
      seen.add(step.label);
    });
  });

// ---------------------------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------------------------

export const viewportConfigSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/, "use letters, digits, '.', '_' or '-'"),
  width: z.number().int().min(100).max(7680),
  height: z.number().int().min(100).max(4320),
  deviceScaleFactor: z.number().min(0.5).max(4).optional(),
});

export const webServerSchema = z.object({
  /** Shell command that starts the server, e.g. `npm run dev`. */
  command: z.string().min(1),
  /** URL polled until it responds with 2xx, 3xx or 400–403 (Playwright's readiness rule). */
  url: httpUrl,
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  /** Use a server that is already listening on `url` instead of starting one. */
  reuseExistingServer: z.boolean().default(false),
  /** Startup timeout in ms. */
  timeout: ms().default(60_000),
  /** Print the server's output (always printed on failure). */
  stdout: z.enum(["pipe", "ignore"]).default("ignore"),
});

const severityOverride = z.enum(["critical", "warning", "info", "uncertain", "off"]);

export const SEVERITY_RULES = [
  "scenario-failed",
  "scenario-added",
  "scenario-removed",
  "checkpoint-added",
  "checkpoint-removed",
  "animation-added",
  "animation-removed",
  "duration",
  "delay",
  "end-delay",
  "start",
  "easing",
  "iterations",
  "direction",
  "playback-rate",
  "fill",
  "property-added",
  "property-removed",
  "keyframes",
  "trajectory",
  "opacity",
  "size",
  "stagger",
  "visual",
  "timeline",
  "scroll-added",
  "scroll-removed",
  "scroll-position",
  "scroll-duration",
  "scroll-curve",
  "scroll-velocity",
  "scroll-overshoot",
] as const;
export type SeverityRule = (typeof SEVERITY_RULES)[number];

export const ignoreRegionSchema = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().positive(),
  height: z.number().positive(),
});

export const comparisonConfigSchema = z.object({
  /** Exit with code 1 when any difference at or above this severity is found. */
  failOn: z.enum(["critical", "warning", "info", "never"]).default("critical"),
  /** Also fail when uncertain differences are found. */
  failOnUncertain: z.boolean().default(false),
  timing: z
    .object({
      /** Differences in declared duration/delay up to this many ms are ignored. */
      toleranceMs: z.number().min(0).default(1),
      /** Start-time differences up to this many ms are ignored (start times are frame-quantized). */
      startToleranceMs: z.number().min(0).default(34),
      /** A timing change is a warning when it exceeds both thresholds below. */
      warnRelative: z.number().min(0).default(0.15),
      warnAbsoluteMs: z.number().min(0).default(50),
      /** A timing change is critical when the relative change reaches this value (1 = doubled/halved). */
      criticalRelative: z.number().min(0).nullable().default(1),
    })
    .prefault({}),
  easing: z
    .object({
      /** Curves whose max deviation is below this are considered equivalent. */
      tolerance: z.number().min(0).default(0.005),
      /** Max deviation (0..1 progress) at which an easing change becomes a warning. */
      warnDeviation: z.number().min(0).default(0.05),
    })
    .prefault({}),
  properties: z
    .object({
      /** Position differences (px) up to this are ignored (layout/font noise). */
      positionTolerancePx: z.number().min(0).default(2),
      /** Position differences at or above this are warnings. */
      warnPositionPx: z.number().min(0).default(12),
      sizeTolerancePx: z.number().min(0).default(2),
      opacityTolerance: z.number().min(0).max(1).default(0.02),
      warnOpacity: z.number().min(0).max(1).default(0.15),
    })
    .prefault({}),
  visual: z
    .object({
      enabled: z.boolean().default(true),
      /** Per-pixel color difference threshold passed to pixelmatch (0 strict … 1 lenient). */
      pixelThreshold: z.number().min(0).max(1).default(0.1),
      /** Ratio of differing pixels above which a checkpoint counts as visually changed. */
      maxDiffRatio: z.number().min(0).max(1).default(0.002),
      /** Count anti-aliased pixels as differences. */
      includeAntialiasing: z.boolean().default(false),
      /** Viewport regions excluded from visual comparison. */
      ignoreRegions: z.array(ignoreRegionSchema).default([]),
      /** Compare filmstrip frames pairwise to chart visual divergence over time. */
      frameDivergence: z.boolean().default(true),
    })
    .prefault({}),
  scroll: z
    .object({
      /** Position differences (px) up to this are ignored. */
      positionTolerancePx: z.number().min(0).default(2),
      /** Start/end/target position differences at or above this are warnings. */
      warnPositionPx: z.number().min(0).default(24),
      /** Scroll duration / settle-time differences up to this many ms are ignored. */
      durationToleranceMs: z.number().min(0).default(60),
      /** A duration change is a warning when it exceeds both thresholds. */
      warnDurationRelative: z.number().min(0).default(0.2),
      warnDurationMs: z.number().min(0).default(120),
      /** Normalized progress-curve deviation (0..1) ignored as scheduling noise. */
      curveTolerance: z.number().min(0).max(1).default(0.04),
      /** Curve deviation at or above this is a warning. */
      warnCurveDeviation: z.number().min(0).max(1).default(0.1),
      /** Relative peak-velocity change ignored (0.25 = ±25%). */
      velocityTolerance: z.number().min(0).default(0.25),
      /** Overshoot differences (px) ignored. */
      overshootTolerancePx: z.number().min(0).default(4),
      /** Velocity (px/ms) below which a scroller counts as settled. */
      settleVelocity: z.number().min(0).default(0.02),
    })
    .prefault({}),
  /** Treat changes on elements matched only by DOM path as `uncertain`. */
  uncertainOnLowConfidence: z.boolean().default(true),
  /** Override the severity of a rule, or turn it `off`. See docs/features/severity.md. */
  severity: z.partialRecord(z.enum(SEVERITY_RULES), severityOverride).default({}),
});

export const configSchema = z.object({
  project: z
    .object({
      /** Shown in reports. Defaults to the package.json name. */
      name: z.string().optional(),
    })
    .prefault({}),
  /** Base URL for scenario paths, e.g. `http://localhost:3000`. */
  baseURL: httpUrl.optional(),
  output: z
    .object({
      /** Root directory for MotionPR data, relative to the config file. */
      directory: z.string().default(".motionpr"),
      /** Approved baseline, relative to `directory`. Commit this directory. */
      baseline: z.string().default("baseline"),
      /** Latest captures, relative to `directory`. */
      captures: z.string().default("captures"),
      /** Generated HTML report, relative to `directory`. */
      report: z.string().default("report"),
      /** Number of captures to keep in the captures directory. */
      keep: z.number().int().min(1).max(100).default(5),
    })
    .prefault({}),
  browser: z
    .object({
      /**
       * Engine to capture with: `chromium`, `firefox` or `webkit` (Playwright's builds). The CLI's
       * `--browser` (or MOTIONPR_BROWSER) picks another engine, or several, for one run.
       */
      name: z.enum(BROWSER_NAMES).default("chromium"),
      /**
       * An installed browser channel instead of Playwright's build: a Chromium channel (`chrome`,
       * `msedge`, …) is used whenever Chromium runs, a Firefox channel (`moz-firefox`, …) whenever
       * Firefox runs. WebKit has no channels.
       */
      channel: z.string().min(1).optional(),
      /** Browser binary for the engine named in `name` (other engines use Playwright's builds). */
      executablePath: z.string().optional(),
      headless: z.boolean().default(true),
      /** Command-line flags for the engine named in `name` (flags are engine specific). */
      args: z.array(z.string()).default([]),
      /** Firefox preferences (`about:config`), applied whenever Firefox runs. */
      firefoxUserPrefs: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
        .optional(),
      /** Default viewport when `viewports` is not set. */
      viewport: z
        .object({
          width: z.number().int().min(100).max(7680).default(1440),
          height: z.number().int().min(100).max(4320).default(900),
        })
        .prefault({}),
      /** Named viewports; each scenario runs once per viewport. */
      viewports: z.array(viewportConfigSchema).min(1).optional(),
      deviceScaleFactor: z.number().min(0.5).max(4).default(1),
      colorScheme: z.enum(["light", "dark", "no-preference"]).default("light"),
      locale: z.string().default("en-US"),
      timezoneId: z.string().default("UTC"),
      /** Keep `no-preference` to capture full motion; `reduce` captures the reduced-motion variant. */
      reducedMotion: z.enum(["no-preference", "reduce"]).default("no-preference"),
      userAgent: z.string().optional(),
    })
    .prefault({}),
  webServer: z.union([webServerSchema, z.array(webServerSchema)]).optional(),
  scenarios: z.array(scenarioSchema).min(1, "define at least one scenario"),
  capture: z
    .object({
      /** Property samples per animation across its active duration. */
      samples: z.number().int().min(2).max(240).default(24),
      frames: z
        .object({
          enabled: z.boolean().default(true),
          /** Filmstrip frame rate. Frames are rendered deterministically, not recorded in real time. */
          fps: z.number().min(1).max(120).default(30),
          /** Maximum frames per checkpoint; the interval grows for long windows. */
          maxFrames: z.number().int().min(2).max(600).default(90),
          /** `png` is lossless and enables frame-by-frame pixel divergence; `jpeg` is smaller. */
          format: z.enum(["png", "jpeg"]).default("png"),
          quality: z.number().int().min(1).max(100).default(80),
        })
        .prefault({}),
      /** Longest motion window replayed per checkpoint, in ms. */
      maxWindow: ms(60_000).default(5000),
      waitForAnimationsTimeout: ms().default(10_000),
      /**
       * Quiet period (ms) with no running or newly started animations before motion counts as
       * settled. Covers animations that start a frame or two after an interaction.
       */
      settleTime: ms(10_000).default(120),
      navigationTimeout: ms().default(30_000),
      actionTimeout: ms().default(10_000),
      scenarioTimeout: ms(1_800_000).default(120_000),
      /** Wait for the network to go quiet after navigation (warns, does not fail, on timeout). */
      waitForNetworkIdle: z.boolean().default(true),
      networkIdleTimeout: ms().default(5000),
      waitForFonts: z.boolean().default(true),
      waitForImages: z.boolean().default(true),
      /** Scenarios captured in parallel (each in its own browser context). */
      concurrency: z.number().int().min(1).max(16).default(1),
      /**
       * Record the scroll motion of native scroll containers (overflow elements), not only the
       * document, and wait for them to settle. `false` records the document scroller only.
       */
      scrollContainers: z.boolean().default(true),
    })
    .prefault({}),
  comparison: comparisonConfigSchema.prefault({}),
  identity: z
    .object({
      /** Preferred attribute for stable element identity. */
      attribute: z.string().default("data-motionpr-id"),
      /** Test-id attribute used as the second choice. */
      testIdAttribute: z.string().default("data-testid"),
    })
    .prefault({}),
  ignore: z
    .object({
      /** Animations on elements matching these selectors (or their descendants) are not recorded. */
      selectors: z.array(z.string()).default([]),
      /** Animation names (CSS animation-name, WAAPI id, adapter name) to skip. */
      animations: z.array(z.string()).default([]),
      /** CSS properties excluded from recording and comparison. */
      properties: z.array(z.string()).default([]),
    })
    .prefault({}),
  privacy: z
    .object({
      /** Mask text inputs, textareas, selects and contenteditable regions in screenshots. */
      maskInputs: z.boolean().default(true),
      /** Additional selectors masked in every screenshot. */
      maskSelectors: z.array(z.string()).default([]),
      /** Replace query-string values in recorded URLs with `REDACTED`. */
      redactQueryParams: z.boolean().default(true),
      /** Query parameters that are safe to record verbatim. */
      allowQueryParams: z.array(z.string()).default([]),
    })
    .prefault({}),
  /**
   * Animation-engine adapters (`gsap`, `animejs`, `lenis`, or a custom name). `required`
   * adapters produce an error diagnostic when they do not register in the page.
   */
  adapters: z
    .array(
      z.object({
        name: z.string().min(1),
        /** Script injected before page scripts (path relative to the config file). */
        script: z.string().optional(),
        required: z.boolean().default(false),
      }),
    )
    .default([]),
  /** Named overrides merged on top of the base config (select with `--env` or MOTIONPR_ENV). */
  environments: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
});

export type MotionprConfig = z.input<typeof configSchema>;
export type ResolvedConfig = z.output<typeof configSchema>;
export type ScenarioConfig = z.input<typeof scenarioSchema>;
export type ResolvedScenario = z.output<typeof scenarioSchema>;
export type Step = z.input<typeof stepSchema>;
export type ResolvedStep = z.output<typeof stepSchema>;
export type StepType = ResolvedStep["type"];
export type WebServerConfig = z.input<typeof webServerSchema>;
export type ResolvedWebServer = z.output<typeof webServerSchema>;
export type ViewportConfig = z.input<typeof viewportConfigSchema>;
export type ComparisonConfig = z.output<typeof comparisonConfigSchema>;
export type SeverityOverride = z.infer<typeof severityOverride>;
export type IgnoreRegion = z.infer<typeof ignoreRegionSchema>;
