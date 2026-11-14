import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./fonts.css";
import "../viewer/styles/viewer.css";
import { ReportError, ReportViewer, assertReportData } from "../viewer/index.ts";
import type { ReportData } from "@motionpr/core";

async function loadData(): Promise<ReportData> {
  const el = document.getElementById("motionpr-report-data");
  const text = el?.textContent?.trim() ?? "";
  // The unfilled template still contains its "__…__" placeholder; real data is always JSON.
  if (text && !text.startsWith("__")) return assertReportData(JSON.parse(text));
  if (import.meta.env.DEV) {
    // Development: data produced by `pnpm demo:capture --out .tmp/demo-report`.
    const res = await fetch("./report-data.json");
    if (!res.ok)
      throw new Error(
        "Dev data missing: run `npx tsx scripts/generate-demo.ts --out .tmp/demo-report`.",
      );
    return assertReportData(await res.json());
  }
  throw new Error("This report contains no data. It may be the unfilled template.");
}

const root = createRoot(document.getElementById("root")!);
loadData().then(
  (data) => {
    document.title = `${data.project} · MotionPR report`;
    root.render(
      <StrictMode>
        <ReportViewer data={data} />
      </StrictMode>,
    );
  },
  (error: unknown) =>
    root.render(<ReportError message={error instanceof Error ? error.message : String(error)} />),
);
