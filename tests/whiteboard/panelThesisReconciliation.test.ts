// tests/whiteboard/panelThesisReconciliation.test.ts
// P0 stabilization, Tier 4 — WhiteboardPanel's Save to NoteLab / Create
// Recall Card actions now pass pageThesisOverride: pageTitle so the SAVED
// note's thesis matches what the panel actually displayed (Surgeon-sourced),
// not the separate legacy studyModel pipeline's own possibly-unrelated
// thesis. handleAddToStudyGuide already used effectiveTopic (pageTitle ||
// lessonTitle) and never read model.pageThesis directly — confirmed still
// untouched, no fix needed there.
//
// No jsdom/render harness for this file in this repo — source inspection.

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../components/WhiteboardPanel.tsx"), "utf8");

describe("components/WhiteboardPanel.tsx — save actions reconcile with the displayed Surgeon thesis", () => {
  it("REQUIRED: handleSaveToNoteLab passes pageThesisOverride: pageTitle", () => {
    const idx = SRC.indexOf("const handleSaveToNoteLab = async () => {");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 700);
    expect(block).toMatch(/pageThesisOverride: pageTitle \?\? undefined,/);
  });

  it("REQUIRED: handleCreateRecallCard passes pageThesisOverride: pageTitle", () => {
    const idx = SRC.indexOf("const handleCreateRecallCard = async () => {");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 700);
    expect(block).toMatch(/pageThesisOverride: pageTitle \?\? undefined,/);
  });

  it("handleAddToStudyGuide already used effectiveTopic (pageTitle || lessonTitle) and never read model.pageThesis directly — untouched, confirmed no fix needed here", () => {
    const idx = SRC.indexOf("const handleAddToStudyGuide = async () => {");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 700);
    expect(block).toMatch(/chapterTitle: effectiveTopic,/);
    expect(block).not.toMatch(/sm\.pageThesis/);
  });
});

describe("lib/notelab/ultraNoteStore.ts — buildNoteFromStudyModel's pageThesisOverride is additive", () => {
  const STORE_SRC = fs.readFileSync(path.resolve(__dirname, "../../lib/notelab/ultraNoteStore.ts"), "utf8");

  it("REQUIRED: pageThesisOverride is optional — every pre-existing caller without it is unaffected", () => {
    const idx = STORE_SRC.indexOf("export function buildNoteFromStudyModel(");
    expect(idx).toBeGreaterThan(-1);
    const block = STORE_SRC.slice(idx, idx + 900);
    expect(block).toMatch(/pageThesisOverride\?: string;/);
  });

  it("REQUIRED: effectiveThesis falls back to model.pageThesis when no override is given", () => {
    expect(STORE_SRC).toMatch(/const effectiveThesis = pageThesisOverride \|\| model\.pageThesis;/);
  });
});
