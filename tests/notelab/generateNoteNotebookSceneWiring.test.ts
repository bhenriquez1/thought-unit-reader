// tests/notelab/generateNoteNotebookSceneWiring.test.ts
// P3 (Professor/Current/Eye Guide/Whiteboard/NoteLab correction) —
// source-inspection tests for GenerateNoteButton's wiring in
// components/reader/RightPanel.tsx, same convention as
// tests/notelab/lessonToNotebookSceneWiring.test.ts (no jsdom/render
// harness for this file).
//
// Before this phase, the general "⚡ Save to NoteLab" button (the one
// referenced by UltraNotesList's own empty-state text) never generated a
// notebookScene at all — only Professor-lesson saves (a completely
// different code path in WhiteboardPanel.tsx) did, which is why most notes
// defaulted to the flat "card" view instead of the tldraw notebook. This
// wires the SAME generateNotebookScene pipeline into the general save path,
// modeled on WhiteboardPanel.tsx's own composeNotebookSceneInBackground —
// but simpler, since there's no taught-lesson snapshot to extract
// narration from or fall back to recomposing here.

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../components/reader/RightPanel.tsx"), "utf8");

describe("components/reader/RightPanel.tsx — imports the notebookScene synthesis pipeline", () => {
  it("REQUIRED: imports generateNotebookScene/summarizeExistingNotebookScene", () => {
    expect(SRC).toMatch(/import \{ generateNotebookScene, summarizeExistingNotebookScene \} from "@\/lib\/notelab\/notebookPlanner";/);
  });

  it("imports gatherConceptNotebookContent for cross-note concept accumulation", () => {
    expect(SRC).toMatch(/import \{ gatherConceptNotebookContent \} from "@\/lib\/notelab\/conceptAccumulation";/);
  });

  it("imports getCanonicalUnitsByPage to ground synthesis in this page's real thought units", () => {
    expect(SRC).toMatch(/import \{ getCanonicalUnitsByPage \} from "@\/lib\/canonical\/store";/);
  });

  it("imports getNotesByBookAsync alongside the existing ultraNoteStore imports", () => {
    expect(SRC).toMatch(/getNotesByBookAsync/);
  });
});

describe("GenerateNoteButton — knowledgeNodeId back-fill (same gap M4 fixed in WhiteboardPanel.tsx)", () => {
  const idx = SRC.indexOf("function GenerateNoteButton({");
  const componentSrc = SRC.slice(idx, idx + 8000);

  it("REQUIRED: the component actually exists", () => {
    expect(idx).toBeGreaterThan(-1);
  });

  it("REQUIRED: accepts a knowledgeNodeId prop", () => {
    expect(componentSrc).toMatch(/knowledgeNodeId\?:\s*string \| null;/);
  });

  it("REQUIRED: back-fills note.knowledgeNodeId before saving — without this, concept accumulation never activates for general note saves", () => {
    const handleIdx = componentSrc.indexOf("async function handleGenerate()");
    const block = componentSrc.slice(handleIdx, handleIdx + 2000);
    const backfillIdx = block.indexOf("note.knowledgeNodeId = knowledgeNodeId;");
    const saveIdx = block.indexOf("await saveUltraNote(note);");
    expect(backfillIdx).toBeGreaterThan(-1);
    expect(saveIdx).toBeGreaterThan(backfillIdx);
  });

  it("REQUIRED: saves the note and flashes success BEFORE ever touching notebookScene synthesis — the primary save never waits on AI synthesis", () => {
    const handleIdx = componentSrc.indexOf("async function handleGenerate()");
    const block = componentSrc.slice(handleIdx, handleIdx + 2500);
    const saveIdx = block.indexOf("await saveUltraNote(note);");
    const setSavedIdx = block.indexOf("setSaved(true);");
    const backgroundCallIdx = block.indexOf("composeNoteNotebookSceneInBackground(note, resolvedDocumentId ?? bookId)");
    expect(saveIdx).toBeGreaterThan(-1);
    expect(setSavedIdx).toBeGreaterThan(saveIdx);
    expect(backgroundCallIdx).toBeGreaterThan(setSavedIdx);
  });

  it("REQUIRED: the background composition call is fire-and-forget (void), never awaited by the button handler", () => {
    expect(componentSrc).toMatch(/void composeNoteNotebookSceneInBackground\(note, resolvedDocumentId \?\? bookId\);/);
  });
});

describe("GenerateNoteButton — composeNoteNotebookSceneInBackground", () => {
  const idx = SRC.indexOf("async function composeNoteNotebookSceneInBackground(");
  const helperIdx = SRC.indexOf("async function saveDeterministicNotebookScene(");
  const fn = SRC.slice(idx, helperIdx + 1200); // covers both the composer and its saveDeterministicNotebookScene helper

  it("REQUIRED: the function actually exists", () => {
    expect(idx).toBeGreaterThan(-1);
  });

  it("REQUIRED: imports mergeDeterministicContentIntoScene (NU3 — Study Page migration)", () => {
    expect(SRC).toMatch(/import \{ mergeDeterministicContentIntoScene \} from "@\/lib\/notelab\/deterministicNotebookBlocks";/);
  });

  it("REQUIRED: reads this page's real canonical thought units via the same note.pageNumber - 1 convention as WhiteboardPanel.tsx", () => {
    expect(fn).toMatch(/getCanonicalUnitsByPage\(documentId, savedNote\.pageNumber - 1\)/);
  });

  it("REQUIRED: with zero canonical units, falls back to a deterministic-only scene (NU3) instead of leaving the note without a notebookScene at all", () => {
    const branchIdx = fn.indexOf("if (units.length === 0) {");
    expect(branchIdx).toBeGreaterThan(-1);
    const branch = fn.slice(branchIdx, fn.indexOf("return;", branchIdx));
    expect(branch).toMatch(/await saveDeterministicNotebookScene\(existingNote, savedNote\.bookId, savedNote\.pageNumber\);/);
  });

  it("REQUIRED: reads the EXISTING note's own studentNotes/notebookScene as additional synthesis context — never a blind overwrite of what the student already has", () => {
    expect(fn).toMatch(/studentNotes: existingNote\.studentNotes \?\? null/);
    expect(fn).toMatch(/existingNotebookSummary: existingNote\.notebookScene \? summarizeExistingNotebookScene\(existingNote\.notebookScene\) : null/);
  });

  it("gathers what OTHER notes on the same concept already know, gated on savedNote.knowledgeNodeId — never guessed when the note has no resolved concept", () => {
    expect(fn).toMatch(/const relatedConceptKnowledge = savedNote\.knowledgeNodeId\s*\n\s*\? await gatherConceptNotebookContent\(savedNote\.knowledgeNodeId, savedNote\.id\)\s*\n\s*: null;/);
  });

  it("passes relatedConceptKnowledge into the real synthesis call", () => {
    expect(fn).toMatch(/relatedConceptKnowledge,\s*\n\s*\}\);/);
  });

  it("REQUIRED: folds the note's deterministic (student/derived) content into the AI scene before saving (NU3 — Study Page migration)", () => {
    const generateIdx = fn.indexOf("const scene = await generateNotebookScene");
    const mergeIdx = fn.indexOf("mergeDeterministicContentIntoScene(scene, existingNote,", generateIdx);
    const saveIdx = fn.indexOf("await saveUltraNote({ ...latest, notebookScene: mergedScene, notebookSceneError: undefined });");
    expect(generateIdx).toBeGreaterThan(-1);
    expect(mergeIdx).toBeGreaterThan(generateIdx);
    expect(saveIdx).toBeGreaterThan(mergeIdx);
  });

  it("REQUIRED: re-reads the note fresh immediately before the final write — never overwrites edits made while synthesis was in flight", () => {
    const finalReadIdx = fn.indexOf("getNotesByBookAsync(savedNote.bookId)", fn.indexOf("const scene = await generateNotebookScene"));
    const saveIdx = fn.indexOf("await saveUltraNote({ ...latest, notebookScene: mergedScene, notebookSceneError: undefined });");
    expect(finalReadIdx).toBeGreaterThan(-1);
    expect(saveIdx).toBeGreaterThan(finalReadIdx);
  });

  it("REQUIRED: never throws out of the background task — a failure anywhere is caught, not surfaced as an unhandled rejection", () => {
    const catchIdx = fn.indexOf("} catch (err) {");
    expect(catchIdx).toBeGreaterThan(-1);
    expect(fn).toMatch(/console\.error\("\[NOTELAB_GENERATE_BACKGROUND_ERROR\]", err\);/);
  });

  it("REQUIRED: on failure, falls back to a deterministic-only scene AND persists notebookSceneError onto the note itself — 'show an explicit recoverable error... rather than reverting to the old card view [silently]', and the background task has no live UI to report to directly", () => {
    const catchIdx = fn.indexOf("} catch (err) {");
    const catchBlock = fn.slice(catchIdx);
    expect(catchBlock).toMatch(/await saveDeterministicNotebookScene\(latest, savedNote\.bookId, savedNote\.pageNumber, \{ notebookSceneError: message\.slice\(0, 200\) \}\);/);
  });

  it("logs generation diagnostics — visualPlanGenerated, visualPrimitiveCount, persistenceSaveSuccess", () => {
    expect(fn).toMatch(/console\.log\("\[NOTELAB_GENERATE_DIAGNOSTIC\]", \{\s*\n\s*noteId: savedNote\.id, visualPlanGenerated: true, visualPrimitiveCount: scene\.blocks\.length,\s*\n\s*\}\);/);
    expect(fn).toMatch(/console\.log\("\[NOTELAB_GENERATE_DIAGNOSTIC\]", \{ noteId: savedNote\.id, persistenceSaveSuccess: persisted \}\);/);
  });
});

describe("GenerateNoteButton — saveDeterministicNotebookScene helper (NU3)", () => {
  const idx = SRC.indexOf("async function saveDeterministicNotebookScene(");
  const fn = SRC.slice(idx, idx + 900);

  it("REQUIRED: the helper actually exists", () => {
    expect(idx).toBeGreaterThan(-1);
  });

  it("REQUIRED: merges the note's current deterministic content via mergeDeterministicContentIntoScene", () => {
    expect(fn).toMatch(/const scene = mergeDeterministicContentIntoScene\(note\.notebookScene \?\? null, note, \{ bookId, pageNumber \}\);/);
  });

  it("REQUIRED: with nothing to show (empty blocks), never writes an empty notebookScene — only persists `extra` (e.g. notebookSceneError) if any was given", () => {
    const guardIdx = fn.indexOf("if (scene.blocks.length === 0) {");
    expect(guardIdx).toBeGreaterThan(-1);
    const guardBlock = fn.slice(guardIdx, fn.indexOf("}", fn.indexOf("}", guardIdx) + 1));
    expect(guardBlock).toMatch(/await saveUltraNote\(\{ \.\.\.note, \.\.\.extra \}\);/);
    expect(guardBlock).not.toMatch(/notebookScene/);
  });

  it("REQUIRED: with real content, saves the note with the merged notebookScene plus any extra fields", () => {
    expect(fn).toMatch(/await saveUltraNote\(\{ \.\.\.note, \.\.\.extra, notebookScene: scene \}\);/);
  });
});

describe("lib/notelab/ultraNoteStore.ts — UltraNote carries a recoverable notebookSceneError field (NU1)", () => {
  const src = fs.readFileSync(path.resolve(__dirname, "../../lib/notelab/ultraNoteStore.ts"), "utf8");

  it("REQUIRED: notebookSceneError is a real optional field on UltraNote", () => {
    const idx = src.indexOf("export interface UltraNote {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, src.indexOf("\n}", idx));
    expect(block).toMatch(/notebookSceneError\?:\s*string;/);
  });
});

describe("GenerateNoteButton call site — knowledgeNodeId threaded through", () => {
  it("REQUIRED: passes knowledgeNodeId to GenerateNoteButton, matching the sibling GenerateStudySetButton's own prop", () => {
    const callIdx = SRC.indexOf("<GenerateNoteButton");
    const callBlock = SRC.slice(callIdx, callIdx + 600);
    expect(callBlock).toMatch(/knowledgeNodeId=\{knowledgeNodeId\}/);
  });
});
