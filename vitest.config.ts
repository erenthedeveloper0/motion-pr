import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: [
            "packages/**/tests/**/*.test.ts",
            "packages/**/tests/**/*.test.tsx",
            "scripts/tests/**/*.test.ts",
          ],
          exclude: ["**/*.integration.test.ts", "**/node_modules/**"],
          environment: "node",
        },
      },
      {
        test: {
          name: "integration",
          include: ["packages/**/tests/**/*.integration.test.ts"],
          exclude: ["**/node_modules/**"],
          environment: "node",
          testTimeout: 120_000,
          hookTimeout: 120_000,
          // Browser-driven suites are CPU heavy; keep them from starving each other.
          maxWorkers: 2,
        },
      },
    ],
  },
});
