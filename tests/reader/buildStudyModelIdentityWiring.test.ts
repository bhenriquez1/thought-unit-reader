// tests/reader/buildStudyModelIdentityWiring.test.ts
// P0 stabilization, Tier 4 — both buildStudyModel() call sites (RightPanel's
// AI-enriched path, pages/index.tsx's headless fallback) now pass the
// resolved documentId and confidence through, not just bookId/currentPage.
// See tests/insights/buildStudyModelIdentityFields.test.ts for the real
// behavioral coverage of buildStudyModel() itself.
//
// No jsdom/render harness for these files in this repo — source inspection,
// matching this repo's established pattern.

import fs from "fs";
import path from "path";

const RIGHT_PANEL_SRC = fs.readFileSync(path.resolve(__dirname, "../../components/reader/RightPanel.tsx"), "utf8");
const PAGE_SRC = fs.readFileSync(path.resolve(__dirname, "../../pages/index.tsx"), "utf8");
const HOOK_SRC = fs.readFileSync(path.resolve(__dirname, "../../lib/useActivePageIntelligence.ts"), "utf8");

describe("lib/useActivePageIntelligence.ts — ActivePageIntelligenceSnapshot exposes confidence", () => {
  it("REQUIRED: confidence?: number is declared on the exported snapshot type", () => {
    const idx = HOOK_SRC.indexOf("export type ActivePageIntelligenceSnapshot = {");
    expect(idx).toBeGreaterThan(-1);
    const block = HOOK_SRC.slice(idx, idx + 1800);
    expect(block).toMatch(/confidence\?: number;/);
  });
});

describe("pages/index.tsx — intelligenceSnapshot (RightPanel's intelligence prop) carries confidence through", () => {
  it("REQUIRED: the object literal includes confidence, and the memo's deps array includes currentConfidence", () => {
    const idx = PAGE_SRC.indexOf("const intelligenceSnapshot = useMemo(() => ({");
    expect(idx).toBeGreaterThan(-1);
    const block = PAGE_SRC.slice(idx, idx + 900);
    expect(block).toMatch(/confidence: currentConfidence,/);
    expect(block).toMatch(/currentPageRole, currentConfidence\]\);/);
  });
});

describe("components/reader/RightPanel.tsx — buildStudyModel call passes resolvedDocumentId + intelligence.confidence", () => {
  it("REQUIRED: the identity argument is present and the memo's deps array includes both new inputs", () => {
    const idx = RIGHT_PANEL_SRC.indexOf("return buildStudyModel(");
    expect(idx).toBeGreaterThan(-1);
    const block = RIGHT_PANEL_SRC.slice(idx, idx + 500);
    expect(block).toMatch(/\{ documentId: resolvedDocumentId, confidence: intelligence\.confidence \}/);
    expect(block).toMatch(/resolvedDocumentId, intelligence\.confidence\]\);/);
  });
});

describe("pages/index.tsx — headless fallback's buildStudyModel call passes resolvedDocumentId + currentConfidence", () => {
  it("REQUIRED: the identity argument is present and the effect's deps array includes both new inputs", () => {
    const idx = PAGE_SRC.indexOf("return buildStudyModel(currentUltraPageView, {}, bookId, currentPage, sharedPresetId, {");
    expect(idx).toBeGreaterThan(-1);
    const block = PAGE_SRC.slice(idx, idx + 400);
    expect(block).toMatch(/documentId: resolvedDocumentId,/);
    expect(block).toMatch(/confidence: currentConfidence,/);
    expect(block).toMatch(/resolvedDocumentId, currentConfidence\]\);/);
  });
});
