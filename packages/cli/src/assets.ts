import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { MotionprError, pathExists, MOTIONPR_PACKAGE } from "@motionpr/core";

/**
 * Files shipped next to the bundled CLI (dist/viewer, dist/demo-app). During development the
 * same files are read from the workspace build outputs.
 */
function candidates(relativeDist: string, workspace: string): string[] {
  return [
    fileURLToPath(new URL(relativeDist, import.meta.url)),
    fileURLToPath(new URL(workspace, import.meta.url)),
  ];
}

async function firstExisting(paths: string[]): Promise<string | undefined> {
  for (const p of paths) if (await pathExists(p)) return p;
  return undefined;
}

export async function viewerTemplatePath(): Promise<string> {
  const found = await firstExisting([
    ...candidates("./viewer/index.html", "../dist/viewer/index.html"),
    fileURLToPath(new URL("../../report/dist/index.html", import.meta.url)),
  ]);
  if (!found) {
    throw new MotionprError("REPORT_FAILED", "The report viewer is not built.", {
      hint: `In the MotionPR repository run \`pnpm build\`. In an installed package, reinstall ${MOTIONPR_PACKAGE}.`,
    });
  }
  return found;
}

export async function readViewerTemplate(): Promise<string> {
  return readFile(await viewerTemplatePath(), "utf8");
}

export async function demoAppDir(): Promise<string> {
  const found = await firstExisting([
    ...candidates("./demo-app/index.html", "../dist/demo-app/index.html"),
    fileURLToPath(new URL("../../../fixtures/demo-app/dist/index.html", import.meta.url)),
  ]);
  if (!found) {
    throw new MotionprError("INTERNAL", "The bundled demo application is missing.", {
      hint: `In the MotionPR repository run \`pnpm build\`. In an installed package, reinstall ${MOTIONPR_PACKAGE}.`,
    });
  }
  return found.replace(/[\\/]index\.html$/, "");
}
