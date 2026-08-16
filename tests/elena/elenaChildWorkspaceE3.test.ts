// tests/elena/elenaChildWorkspaceE3.test.ts
// E3 — static-analysis coverage for ElenaChildWorkspace.tsx's canonical
// extraction and Learning State wiring.

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(
  path.resolve(__dirname, "../../components/elena/ElenaChildWorkspace.tsx"),
  "utf8",
);

describe("ElenaChildWorkspace — E3 imports", () => {
  it("imports all four E3 modules", () => {
    expect(SRC).toMatch(/import \{ extractChildPageCanonicalUnits \} from "@\/lib\/elena\/childCanonicalExtraction";/);
    expect(SRC).toMatch(/import \{ loadGroundedPageContext \} from "@\/lib\/elena\/childTeachingAdapter";/);
    expect(SRC).toMatch(/import \{ recordChildPageExposure \} from "@\/lib\/elena\/childLearningState";/);
    expect(SRC).toMatch(/import \{ getCanonicalUnitsByPage \} from "@\/lib\/canonical\/store";/);
  });
});

describe("ElenaChildWorkspace — handleBookPageTextExtracted triggers canonical extraction", () => {
  it("REQUIRED: calls extractChildPageCanonicalUnits with a 0-based pageIndex derived from the 1-based page callback arg", () => {
    const idx = SRC.indexOf("const handleBookPageTextExtracted = useCallback");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 700);
    expect(block).toMatch(/extractChildPageCanonicalUnits\(activeBook\.documentId, activeBook\.title, page - 1, text\)\.catch\(\(\) => \{\}\);/);
  });

  it("guards on activeBook and non-empty text before extracting", () => {
    const idx = SRC.indexOf("const handleBookPageTextExtracted = useCallback");
    const block = SRC.slice(idx, idx + 700);
    expect(block).toMatch(/if \(activeBook && text\.trim\(\)\) \{/);
  });
});

describe("ElenaChildWorkspace — handleLogSession records a Learning State exposure event", () => {
  it("REQUIRED: fetches this page's canonical units and records exposure through recordChildPageExposure, scoped by profile.id", () => {
    const idx = SRC.indexOf("const handleLogSession = useCallback");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 1800);
    expect(block).toMatch(/getCanonicalUnitsByPage\(activeBook\.documentId, activeBook\.currentPage - 1\)/);
    expect(block).toMatch(/recordChildPageExposure\(profile\.id, activeBook\.documentId, units, now\)/);
  });

  it("is best-effort — a Learning State write failure does not throw out of handleLogSession", () => {
    const idx = SRC.indexOf("const handleLogSession = useCallback");
    const block = SRC.slice(idx, idx + 1800);
    expect(block).toMatch(/\.catch\(\(\) => \{\}\);/);
  });
});
