// tests/notelab/ultraNoteDocumentIdentity.test.ts
// C2 (Phase 0 audit) — UltraNote used to carry only bookId (a filename-
// derived grouping key) + pageNumber, with no resolved documentId,
// pageTruthKey, or thoughtUnitIds. The richer provenance model
// (lib/notelab/conceptEvidenceWorkspace.ts's NoteLabPageIdentity/
// CanonicalTextbookEvidence) existed but never made it into a saved note.
// This locks in that every "save to NoteLab" call site now back-fills
// documentId/pageTruthKey/thoughtUnitIds onto the note before saving —
// the exact same "build via buildNoteFromStudyModel/buildUltraNote, then
// stamp identity fields right before saveUltraNote()" pattern this file
// already used for knowledgeNodeId/canonicalAnchorId.
//
// UltraNote's new fields are plain optional properties with no runtime
// logic of their own (TypeScript already proves the type accepts them);
// what actually needs locking in is that every save call site performs
// the backfill. No jsdom/render harness for these files in this repo —
// source inspection, matching this repo's established pattern for React
// components and pages/index.tsx specifically.

import fs from "fs";
import path from "path";

function read(rel: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
}

describe("lib/notelab/ultraNoteStore.ts — UltraNote carries real document/page identity", () => {
  const src = read("lib/notelab/ultraNoteStore.ts");

  it("REQUIRED: documentId, pageTruthKey, and thoughtUnitIds are real fields on UltraNote", () => {
    const idx = src.indexOf("export interface UltraNote {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, src.indexOf("\n}", idx));
    expect(block).toMatch(/documentId\?:\s*string;/);
    expect(block).toMatch(/pageTruthKey\?:\s*string;/);
    expect(block).toMatch(/thoughtUnitIds\?:\s*string\[\];/);
  });
});

describe("pages/index.tsx — every 'save to NoteLab' call site back-fills document identity", () => {
  const src = read("pages/index.tsx");

  it("REQUIRED: imports buildPageTruthKey alongside the existing useActivePageIntelligence import", () => {
    expect(src).toMatch(/import \{ useActivePageIntelligence, buildPageTruthKey \} from "@\/lib\/useActivePageIntelligence";/);
  });

  it("REQUIRED: sendCurrentPageToNoteLab (Focus Cycle summary save) stamps documentId/pageTruthKey/thoughtUnitIds before saving", () => {
    const idx = src.indexOf("const sendCurrentPageToNoteLab = useCallback");
    expect(idx).toBeGreaterThan(-1);
    const saveIdx = src.indexOf("await saveUltraNote(note);", idx);
    const block = src.slice(idx, saveIdx);
    expect(block).toMatch(/note\.documentId = resolvedDocumentId;/);
    expect(block).toMatch(/note\.pageTruthKey = buildPageTruthKey\(resolvedDocumentId, currentPage\);/);
    expect(block).toMatch(/note\.thoughtUnitIds = canonicalLeftPanelUnits\.map\(\(u\) => u\.id\);/);
    // resolvedDocumentId must be a real dependency, not just referenced —
    // this callback re-derives it on every book/page change.
    const depsIdx = src.indexOf("}, [currentPageStudyModel, currentPage, bookId, uploadedFile, activeCanonicalThoughtUnit, canonicalLeftPanelUnits, resolvedDocumentId]);");
    expect(depsIdx).toBeGreaterThan(saveIdx);
  });

  it("REQUIRED: noteThoughtUnitById's canonical-unit branch stamps identity scoped to just that one unit", () => {
    const idx = src.indexOf("const noteThoughtUnitById = useCallback");
    expect(idx).toBeGreaterThan(-1);
    const firstSaveIdx = src.indexOf("await saveUltraNote(note);", idx);
    const block = src.slice(idx, firstSaveIdx);
    expect(block).toMatch(/note\.pageTruthKey = buildPageTruthKey\(resolvedDocumentId, unit\.page\);/);
    expect(block).toMatch(/note\.thoughtUnitIds = \[unit\.id\];/);
  });

  it("REQUIRED: noteThoughtUnitById's visualAnchor fallback branch also stamps identity, scoped to that anchor", () => {
    const idx = src.indexOf("const noteThoughtUnitById = useCallback");
    const firstSaveIdx = src.indexOf("await saveUltraNote(note);", idx);
    const secondSaveIdx = src.indexOf("await saveUltraNote(note);", firstSaveIdx + 1);
    expect(secondSaveIdx).toBeGreaterThan(firstSaveIdx);
    const block = src.slice(firstSaveIdx, secondSaveIdx);
    expect(block).toMatch(/note\.pageTruthKey = buildPageTruthKey\(resolvedDocumentId, detail\.pageNumber\);/);
    expect(block).toMatch(/note\.thoughtUnitIds = \[anchor\.id\];/);
  });

  it("REQUIRED: handleExplainStepSaveNote stamps documentId/pageTruthKey scoped to the conversation's own page, not the currently-viewed page", () => {
    const idx = src.indexOf("const handleExplainStepSaveNote = useCallback");
    expect(idx).toBeGreaterThan(-1);
    const saveIdx = src.indexOf("await saveUltraNote(note);", idx);
    const block = src.slice(idx, saveIdx);
    expect(block).toMatch(/note\.pageTruthKey = buildPageTruthKey\(resolvedDocumentId, ctx\.pageNumber\);/);
  });
});

describe("components/reader/RightPanel.tsx — GenerateNoteButton stamps document identity", () => {
  const src = read("components/reader/RightPanel.tsx");

  it("REQUIRED: accepts resolvedDocumentId and canonicalLeftPanelUnits as props", () => {
    const idx = src.indexOf("function GenerateNoteButton(");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 900);
    expect(block).toMatch(/resolvedDocumentId\?:\s*string;/);
    expect(block).toMatch(/canonicalLeftPanelUnits\?:\s*ExpertAnchor\[\];/);
  });

  it("REQUIRED: handleGenerate stamps documentId/pageTruthKey/thoughtUnitIds before saving", () => {
    const idx = src.indexOf("async function handleGenerate()");
    expect(idx).toBeGreaterThan(-1);
    const saveIdx = src.indexOf("await saveUltraNote(note);", idx);
    const block = src.slice(idx, saveIdx);
    expect(block).toMatch(/note\.documentId = resolvedDocumentId;/);
    expect(block).toMatch(/note\.pageTruthKey = buildPageTruthKey\(resolvedDocumentId, pageNumber\);/);
    expect(block).toMatch(/note\.thoughtUnitIds = canonicalLeftPanelUnits\.map\(\(u\) => u\.id\);/);
  });

  it("REQUIRED: the call site passes both new props through to GenerateNoteButton", () => {
    const idx = src.indexOf("<GenerateNoteButton");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 400);
    expect(block).toMatch(/resolvedDocumentId=\{resolvedDocumentId\}/);
    expect(block).toMatch(/canonicalLeftPanelUnits=\{canonicalLeftPanelUnits\}/);
  });
});

describe("components/WhiteboardPanel.tsx — Save to NoteLab stamps document identity", () => {
  const src = read("components/WhiteboardPanel.tsx");

  it("REQUIRED: handleSaveToNoteLab stamps documentId/pageTruthKey/thoughtUnitIds before saving, using the panel's own resolvedDocumentId/currentPage/canonicalEntries", () => {
    const idx = src.indexOf("const handleSaveToNoteLab = async () => {");
    expect(idx).toBeGreaterThan(-1);
    const saveIdx = src.indexOf("await saveUltraNote(note);", idx);
    const block = src.slice(idx, saveIdx);
    expect(block).toMatch(/note\.documentId = resolvedDocumentId;/);
    expect(block).toMatch(/note\.pageTruthKey = buildPageTruthKey\(resolvedDocumentId, currentPage \?\? 0\);/);
    expect(block).toMatch(/note\.thoughtUnitIds = canonicalEntries\.map\(\(e\) => e\.id\);/);
  });
});
