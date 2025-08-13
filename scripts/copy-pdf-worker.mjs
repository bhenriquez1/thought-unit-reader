// scripts/copy-pdf-worker.mjs
import { mkdir, copyFile } from "node:fs/promises";
import { dirname } from "node:path";
const src = "node_modules/pdfjs-dist/build/pdf.worker.min.mjs";
const dst = "public/pdf.worker.min.mjs";
await mkdir(dirname(dst), { recursive: true });
await copyFile(src, dst).catch((e) => {
  console.error("Failed to copy pdf.worker.min.mjs:", e?.message || e);
  process.exitCode = 1;
});