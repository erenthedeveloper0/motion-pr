import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createJiti } from "jiti";
import {
  ConfigError,
  MOTIONPR_PACKAGE,
  pathExists,
  resolveConfig,
  resolvePaths,
  type MotionprPaths,
  type ResolvedConfig,
} from "@motionpr/core";

export const CONFIG_FILENAMES = [
  "motionpr.config.ts",
  "motionpr.config.mts",
  "motionpr.config.cts",
  "motionpr.config.js",
  "motionpr.config.mjs",
  "motionpr.config.cjs",
];

/** Finds a config file in `cwd` (no upward search: MotionPR runs from the project root). */
export async function findConfigFile(cwd: string, explicit?: string): Promise<string> {
  if (explicit) {
    const file = isAbsolute(explicit) ? explicit : resolve(cwd, explicit);
    if (!(await pathExists(file))) {
      throw new ConfigError("CONFIG_NOT_FOUND", `Config file not found: ${file}`, { file });
    }
    return file;
  }
  for (const name of CONFIG_FILENAMES) {
    const file = join(cwd, name);
    if (await pathExists(file)) return file;
  }
  const nearby = (await readdir(cwd).catch(() => [])).filter((n) =>
    n.startsWith("motionpr.config"),
  );
  throw new ConfigError("CONFIG_NOT_FOUND", `No MotionPR config found in ${cwd}.`, {
    hint: nearby.length
      ? `Found ${nearby.join(", ")}, which is not a supported name (${CONFIG_FILENAMES.join(", ")}).`
      : "Run `npx motionpr init` to create motionpr.config.ts, or pass --config <path>.",
  });
}

export interface LoadedConfig {
  config: ResolvedConfig;
  file: string;
  rootDir: string;
  paths: MotionprPaths;
}

export interface LoadConfigOptions {
  cwd?: string;
  /** Explicit config path. */
  config?: string;
  /** Environment from `environments` (`--env`). Defaults to MOTIONPR_ENV. */
  env?: string;
  /** Overrides applied after the file and environment (e.g. CLI flags). */
  overrides?: Record<string, unknown>;
}

/**
 * Configs import `defineConfig` from the package. Resolve that import to the running CLI's own
 * entry, so the config works without a local install (`npx @erenthedeveloper0/motionpr run`)
 * and always matches the CLI's schema version.
 */
function selfAlias(): Record<string, string> {
  const entry = fileURLToPath(new URL("./index.js", import.meta.url));
  return existsSync(entry) ? { [MOTIONPR_PACKAGE]: entry } : {};
}

/**
 * Loads `motionpr.config.(ts|js|mjs|…)` with jiti (TypeScript without a build step), evaluates
 * function configs, applies environments, env vars and overrides, and validates the result.
 */
export async function loadConfig(options: LoadConfigOptions = {}): Promise<LoadedConfig> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const file = await findConfigFile(cwd, options.config);
  const env = options.env ?? process.env.MOTIONPR_ENV ?? undefined;
  let exported: unknown;
  try {
    const jiti = createJiti(pathToFileURL(file).href, {
      moduleCache: false,
      fsCache: false,
      interopDefault: true,
      alias: selfAlias(),
    });
    exported = await jiti.import(file, { default: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigError(
      "CONFIG_LOAD_FAILED",
      `Could not load ${file}:\n${message.split("\n").slice(0, 8).join("\n")}`,
      {
        file,
        hint:
          message.includes("Cannot find") && message.includes("motionpr")
            ? "Install MotionPR in this project: npm install -D @erenthedeveloper0/motionpr"
            : "Fix the error above; the config is regular TypeScript/JavaScript.",
        cause: error,
      },
    );
  }
  let raw = exported;
  if (typeof raw === "function") {
    raw = await (raw as (ctx: { env: string | undefined; ci: boolean }) => unknown)({
      env,
      ci: Boolean(process.env.CI),
    });
  }
  const config = resolveConfig(raw, {
    file,
    envVars: process.env,
    ...(env ? { env } : {}),
    ...(options.overrides ? { overrides: options.overrides } : {}),
  });
  const rootDir = dirname(file);
  return { config, file, rootDir, paths: resolvePaths(config, rootDir) };
}
