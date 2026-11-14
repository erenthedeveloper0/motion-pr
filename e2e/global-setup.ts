import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

export default function globalSetup(): void {
  if (process.env.MOTIONPR_E2E_REUSE && existsSync(".tmp/e2e/report/index.html")) return;
  execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/generate-demo.ts",
      "--out",
      ".tmp/e2e/data",
      "--html",
      ".tmp/e2e/report",
    ],
    {
      stdio: "inherit",
    },
  );
}
