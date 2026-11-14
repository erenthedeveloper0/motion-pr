import { ConfigError, formatIssuePath, type ConfigIssue } from "../errors.ts";
import { sha256 } from "../hash.ts";
import type { Viewport } from "../schema/capture.ts";
import { configSchema, type ResolvedConfig, type ResolvedScenario } from "./schema.ts";

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/** Recursively merges plain objects. Arrays and primitives in `override` replace the base value. */
export function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return (override === undefined ? base : override) as T;
  }
  const out: PlainObject = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    out[key] = isPlainObject(out[key]) && isPlainObject(value) ? deepMerge(out[key], value) : value;
  }
  return out as T;
}

export interface ResolveConfigOptions {
  /** Path of the config file, used in error messages. */
  file?: string;
  /** Environment name to apply from `environments`. */
  env?: string;
  /** Environment variables (defaults to an empty object; pass `process.env` from the CLI). */
  envVars?: Record<string, string | undefined>;
  /** Overrides applied last (e.g. from CLI flags). */
  overrides?: PlainObject;
}

/**
 * Validates a raw config object and returns it with every default applied.
 * Throws {@link ConfigError} with precise issue paths when the config is invalid.
 */
export function resolveConfig(input: unknown, options: ResolveConfigOptions = {}): ResolvedConfig {
  const { file, env, envVars = {}, overrides } = options;
  if (!isPlainObject(input)) {
    throw new ConfigError(
      "CONFIG_INVALID",
      "The config must export an object (use defineConfig).",
      { file },
    );
  }

  let merged: PlainObject = { ...input };
  const environments = merged.environments;
  if (env) {
    if (!isPlainObject(environments) || !isPlainObject(environments[env])) {
      const available = isPlainObject(environments) ? Object.keys(environments) : [];
      throw new ConfigError("CONFIG_INVALID", `Unknown environment "${env}".`, {
        file,
        hint: available.length
          ? `Available environments: ${available.join(", ")}`
          : "The config defines no environments.",
      });
    }
    merged = deepMerge(merged, environments[env]);
  }

  if (envVars.MOTIONPR_BASE_URL) merged = deepMerge(merged, { baseURL: envVars.MOTIONPR_BASE_URL });
  if (envVars.MOTIONPR_BROWSER_PATH)
    merged = deepMerge(merged, { browser: { executablePath: envVars.MOTIONPR_BROWSER_PATH } });
  if (overrides) merged = deepMerge(merged, overrides);

  const result = configSchema.safeParse(merged);
  if (!result.success) {
    const issues: ConfigIssue[] = result.error.issues.map((issue) => ({
      path: formatIssuePath(issue.path),
      message: issue.message,
    }));
    throw new ConfigError(
      "CONFIG_INVALID",
      `Invalid MotionPR config${file ? ` in ${file}` : ""}.`,
      { file, issues },
    );
  }
  const config = result.data;
  const issues = crossValidate(config);
  if (issues.length) {
    throw new ConfigError(
      "CONFIG_INVALID",
      `Invalid MotionPR config${file ? ` in ${file}` : ""}.`,
      { file, issues },
    );
  }
  return config;
}

function crossValidate(config: ResolvedConfig): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  const ids = new Set<string>();
  const viewportNames = new Set(resolveViewports(config).map((v) => v.name));
  if (config.browser.viewports && viewportNames.size !== config.browser.viewports.length) {
    issues.push({ path: "browser.viewports", message: "viewport names must be unique" });
  }
  const hasServerUrl = webServers(config).length > 0;
  config.scenarios.forEach((scenario, i) => {
    if (ids.has(scenario.id))
      issues.push({
        path: `scenarios[${i}].id`,
        message: `duplicate scenario id "${scenario.id}"`,
      });
    ids.add(scenario.id);
    for (const name of scenario.viewports ?? []) {
      if (!viewportNames.has(name)) {
        issues.push({
          path: `scenarios[${i}].viewports`,
          message: `unknown viewport "${name}" (defined: ${[...viewportNames].join(", ")})`,
        });
      }
    }
    if (!scenario.url && !config.baseURL && !hasServerUrl) {
      issues.push({
        path: `scenarios[${i}]`,
        message: "set `baseURL` (or `webServer.url`), or give the scenario an absolute `url`",
      });
    }
    scenario.steps.forEach((step, j) => {
      if (step.type === "goto" && !step.url && step.path === undefined) {
        issues.push({ path: `scenarios[${i}].steps[${j}]`, message: "goto needs `path` or `url`" });
      }
      if (step.type === "scroll" && step.x === undefined && step.y === undefined) {
        issues.push({
          path: `scenarios[${i}].steps[${j}]`,
          message: "scroll needs `x` and/or `y`",
        });
      }
    });
  });
  return issues;
}

export function webServers(config: ResolvedConfig) {
  if (!config.webServer) return [];
  return Array.isArray(config.webServer) ? config.webServer : [config.webServer];
}

/** Effective base URL: `baseURL`, falling back to the first web server URL. */
export function effectiveBaseURL(config: ResolvedConfig): string | undefined {
  return config.baseURL ?? webServers(config)[0]?.url;
}

/** Viewports each scenario runs in. */
export function resolveViewports(config: ResolvedConfig): Viewport[] {
  const dsf = config.browser.deviceScaleFactor;
  if (config.browser.viewports?.length) {
    return config.browser.viewports.map((v) => ({
      name: v.name,
      width: v.width,
      height: v.height,
      deviceScaleFactor: v.deviceScaleFactor ?? dsf,
    }));
  }
  return [
    {
      name: "default",
      width: config.browser.viewport.width,
      height: config.browser.viewport.height,
      deviceScaleFactor: dsf,
    },
  ];
}

export function scenarioViewports(config: ResolvedConfig, scenario: ResolvedScenario): Viewport[] {
  const all = resolveViewports(config);
  return scenario.viewports?.length ? all.filter((v) => scenario.viewports!.includes(v.name)) : all;
}

/** Joins a base URL and a path the way browsers resolve relative links, keeping base sub-paths. */
export function joinUrl(base: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const baseUrl = new URL(base);
  if (!baseUrl.pathname.endsWith("/")) baseUrl.pathname += "/";
  return new URL(path.replace(/^\/+/, ""), baseUrl).toString();
}

export function scenarioUrl(config: ResolvedConfig, scenario: ResolvedScenario): string {
  if (scenario.url) return scenario.url;
  const base = effectiveBaseURL(config);
  if (!base)
    throw new ConfigError(
      "CONFIG_INVALID",
      `Scenario "${scenario.id}" has no URL and no baseURL is configured.`,
    );
  return joinUrl(base, scenario.path ?? "/");
}

/**
 * Hash of the capture-relevant configuration. Fill values are excluded so the hash never
 * encodes secrets; web-server commands are excluded because they do not affect captured data.
 */
export function configHash(config: ResolvedConfig): string {
  const relevant = {
    browser: { ...config.browser, executablePath: undefined },
    scenarios: config.scenarios.map((s) => ({
      ...s,
      steps: s.steps.map((step) =>
        step.type === "fill" ? { ...step, value: "<redacted>" } : step,
      ),
    })),
    capture: config.capture,
    identity: config.identity,
    ignore: config.ignore,
    privacy: config.privacy,
  };
  return sha256(stableStringify(relevant)).slice(0, 16);
}

/** JSON.stringify with sorted object keys, for hashing. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (isPlainObject(v)) {
      return Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    }
    return v;
  });
}
