// scripts/copy-pdf-worker.mjs
import { existsSync, mkdirSync, copyFileSync } from "node:fs";

const dest = "public/pdf.worker.min.mjs";

mkdirSync("public", { recursive: true });

const candidates = [
  "node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
  "node_modules/pdfjs-dist/build/pdf.worker.min.js",
  "node_modules/pdfjs-dist/build/pdf.worker.mjs",
];

const src = candidates.find((f) => existsSync(f));

if (!src) {
  throw new Error("pdf.worker not found in pdfjs-dist — checked: " + candidates.join(", "));
}

copyFileSync(src, dest);
console.log("✓ pdf.worker copied from", src);
