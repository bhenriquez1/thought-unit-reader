// tests/elena/elenaCallSite.test.ts
// pages/index.tsx's Elena render branch must no longer thread the adult
// Reader's own uploadedFile/currentPage/pdfPageCount/pageTextByPage into
// Elena — that was the root cause of Elena being unable to have her own
// book open independent of the adult tab (E2).

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../pages/index.tsx"), "utf8");

describe("pages/index.tsx — Elena render call site (E2)", () => {
  it("REQUIRED: renders <ElenaChildWorkspace /> with no props — it owns its own document state now", () => {
    const idx = SRC.indexOf('activeShellTab === "elena"');
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 400);
    expect(block).toMatch(/<ElenaChildWorkspace\s*\/>/);
    expect(block).not.toMatch(/bookTitle=\{uploadedFile\?\.name\}/);
    expect(block).not.toMatch(/pageText=\{pageTextByPage\.get/);
  });
});
