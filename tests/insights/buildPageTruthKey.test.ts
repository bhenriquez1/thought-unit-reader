// tests/insights/buildPageTruthKey.test.ts
// Regression coverage for the RC6 fix from the Thought Unit Engine identity
// audit: pageTruthKey previously had FOUR structurally different fallback
// shapes across the app (the canonical 3-segment "::" builder inside
// lib/useActivePageIntelligence.ts, plus three locally-reimplemented
// variants in WhiteboardPanel.tsx, RightPanel.tsx, and TldrawCanvas.tsx) —
// none of the fallback shapes ever equalled a real canonical key, so a
// cache lookup or equality check against one would silently MISS rather
// than error. buildPageTruthKey is now exported and reused everywhere.

import { buildPageTruthKey } from "../../lib/useActivePageIntelligence";

describe("buildPageTruthKey", () => {
  it("builds the canonical 3-segment format: documentId::pageNumber::t|f", () => {
    expect(buildPageTruthKey("doc-1", 4, true)).toBe("doc-1::4::t");
    expect(buildPageTruthKey("doc-1", 4, false)).toBe("doc-1::4::f");
  });

  it("defaults textReady to true when omitted — a fallback caller has no better guess than 'assume ready'", () => {
    expect(buildPageTruthKey("doc-1", 4)).toBe("doc-1::4::t");
  });

  it("is deterministic", () => {
    expect(buildPageTruthKey("doc-1", 4)).toBe(buildPageTruthKey("doc-1", 4));
  });

  it("different documentId or pageNumber produce different keys", () => {
    expect(buildPageTruthKey("doc-1", 4)).not.toBe(buildPageTruthKey("doc-2", 4));
    expect(buildPageTruthKey("doc-1", 4)).not.toBe(buildPageTruthKey("doc-1", 5));
  });
});

describe("buildPageTruthKey — wired into every fallback construction site", () => {
  const fs = require("fs");
  const path = require("path");

  it("REQUIRED: WhiteboardPanel.tsx's fallback uses buildPageTruthKey, not a locally-reimplemented format", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../components/WhiteboardPanel.tsx"), "utf8");
    expect(src).toMatch(/import \{ buildPageTruthKey \} from "@\/lib\/useActivePageIntelligence"/);
    expect(src).toMatch(/buildPageTruthKey\(effectiveLearningDocumentId, currentPage\)/);
    expect(src).not.toMatch(/\$\{effectiveLearningDocumentId\}::\$\{currentPage\}/);
  });

  it("REQUIRED: RightPanel.tsx's diagnostic fallback uses buildPageTruthKey, not a locally-reimplemented format", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../components/reader/RightPanel.tsx"), "utf8");
    expect(src).toMatch(/buildPageTruthKey, type ActivePageIntelligenceSnapshot \} from "@\/lib\/useActivePageIntelligence"/);
    expect(src).toMatch(/buildPageTruthKey\(bookId, pageNumber\)/);
    expect(src).not.toMatch(/\$\{bookId\}:\$\{pageNumber\}/);
  });

  it("REQUIRED: TldrawCanvas.tsx tries the canonical builder (via the VSG's own source page number) before its older content-hash/sentinel fallbacks", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../components/whiteboard/TldrawCanvas.tsx"), "utf8");
    expect(src).toMatch(/import \{ buildPageTruthKey \} from "@\/lib\/useActivePageIntelligence"/);
    const idx = src.indexOf("const effectivePageTruthKey =");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/buildPageTruthKey\(effectiveDocumentId, derivedVsg\.sourcePageNumber\)/);
    // The older fallbacks stay in place as further-degraded options, not removed.
    expect(block).toMatch(/derivedVsg\?\.id/);
    expect(block).toMatch(/"unknown-page"/);
  });
});
