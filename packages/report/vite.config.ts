import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Builds the viewer into ONE self-contained HTML file (JS, CSS and fonts inlined) that the
// report generator fills with data. No external resources are loaded at runtime.
export default defineConfig(({ command }) => ({
  root: here("./src/app"),
  base: "./",
  plugins: [react(), tailwindcss(), viteSingleFile({ removeViteModuleLoader: true })],
  publicDir: command === "serve" ? here("../../.tmp/demo-report") : false,
  build: {
    outDir: here("./dist"),
    emptyOutDir: true,
    target: "es2022",
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    reportCompressedSize: true,
  },
  server: { port: 5174 },
}));
