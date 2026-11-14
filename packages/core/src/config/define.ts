import type { MotionprConfig, ScenarioConfig, Step } from "./schema.ts";

export interface ConfigContext {
  /** Environment selected with `--env` or `MOTIONPR_ENV`. */
  env: string | undefined;
  /** True when running in CI (`CI` environment variable is set). */
  ci: boolean;
}

export type ConfigFactory = (context: ConfigContext) => MotionprConfig | Promise<MotionprConfig>;

/**
 * Identity helper that gives `motionpr.config.ts` full type inference and editor completion.
 * Accepts a config object or a (possibly async) function that returns one.
 */
export function defineConfig(config: MotionprConfig): MotionprConfig;
export function defineConfig(config: ConfigFactory): ConfigFactory;
export function defineConfig(
  config: MotionprConfig | ConfigFactory,
): MotionprConfig | ConfigFactory {
  return config;
}

/** Identity helper for declaring scenarios in separate modules. */
export function defineScenario(scenario: ScenarioConfig): ScenarioConfig {
  return scenario;
}

/** Identity helper for reusable step sequences. */
export function defineSteps(steps: Step[]): Step[] {
  return steps;
}
