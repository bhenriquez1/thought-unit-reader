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
//
// L13 (NoteLab visual-execution correction) — composeNoteNotebookSceneInBackground
// and its saveDeterministicNotebookScene helper were lifted out of this
// component into lib/notelab/composeNotebookScene.ts, so
// components/notelab/UltraNotesList.tsx's Retry action can call the exact
// same composition logic. RightPanel.tsx now only imports and calls it.

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../components/reader/RightPanel.tsx"), "utf8");
const COMPOSE_SRC = fs.readFileSync(path.resolve(__dirname, "../../lib/notelab/composeNotebookScene.ts"), "utf8");

describe("components/reader/RightPanel.tsx — imports the shared notebookScene composition function (L13)", () => {
  it("REQUIRED: imports composeNoteNotebookSceneInBackground from lib/notelab/composeNotebookScene", () => {
    expect(SRC).toMatch(/import \{ composeNoteNotebookSceneInBackground \} from "@\/lib\/notelab\/composeNotebookScene";/);
  });

  it("REQUIRED: no longer defines its own local composeNoteNotebookSceneInBackground/saveDeterministicNotebookScene — a single shared implementation, not a second drifting copy", () => {
    expect(SRC).not.toMatch(/async function composeNoteNotebookSceneInBackground\(/);
    expect(SRC).not.toMatch(/async function saveDeterministicNotebookScene\(/);
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

  it("REQUIRED (L13): sets notebookSceneStatus 'pending' before the primary save, so the note is never briefly read back with no status at all", () => {
    const handleIdx = componentSrc.indexOf("async function handleGenerate()");
    const block = componentSrc.slice(handleIdx, handleIdx + 2000);
    const pendingIdx = block.indexOf('note.notebookSceneStatus = "pending";');
    const saveIdx = block.indexOf("await saveUltraNote(note);");
    expect(pendingIdx).toBeGreaterThan(-1);
    expect(saveIdx).toBeGreaterThan(pendingIdx);
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

describe("lib/notelab/composeNotebookScene.ts — composeNoteNotebookSceneInBackground (L13)", () => {
  const idx = COMPOSE_SRC.indexOf("export async function composeNoteNotebookSceneInBackground(");
  const helperIdx = COMPOSE_SRC.indexOf("async function saveDeterministicNotebookScene(");
  const fn = COMPOSE_SRC.slice(helperIdx, idx + 6500); // covers both the helper (defined first in this file) and the composer

  it("REQUIRED: the function actually exists and is exported (UltraNotesList.tsx needs to call it too)", () => {
    expect(idx).toBeGreaterThan(-1);
  });

  it("REQUIRED: imports mergeDeterministicContentIntoScene (NU3 — Study Page migration)", () => {
    expect(COMPOSE_SRC).toMatch(/import \{ mergeDeterministicContentIntoScene \} from "\.\/deterministicNotebookBlocks";/);
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
    expect(fn).toMatch(/relatedConceptKnowledge,\s*\n\s*\};/);
  });

  // ND1 — the AI call itself is now the NoteLab Designer Agent's bounded
  // quality-checked step (lib/notelab/notebookDesignerAgent.ts's
  // runNotebookDesignerStep), not a bare generateNotebookScene call — see
  // tests/notelab/notebookDesignerAgent.test.ts for real behavioral
  // coverage of that module. This file stays wiring-only: does
  // composeNotebookScene.ts actually invoke it and use its result.
  it("REQUIRED (ND1): the AI call is routed through runNotebookDesignerStep, not a bare generateNotebookScene call", () => {
    expect(COMPOSE_SRC).toMatch(/import \{ runNotebookDesignerStep \} from "\.\/notebookDesignerAgent";/);
    const idx = fn.indexOf("const { scene, diagnostic, retried } = await runNotebookDesignerStep(");
    expect(idx).toBeGreaterThan(-1);
  });

  it("REQUIRED: folds the note's deterministic (student/derived) content into the AI scene before saving (NU3 — Study Page migration)", () => {
    const generateIdx = fn.indexOf("const { scene, diagnostic, retried } = await runNotebookDesignerStep(");
    const mergeIdx = fn.indexOf("mergeDeterministicContentIntoScene(scene, existingNote,", generateIdx);
    const saveIdx = fn.indexOf('notebookSceneStatus: "ready"', generateIdx);
    expect(generateIdx).toBeGreaterThan(-1);
    expect(mergeIdx).toBeGreaterThan(generateIdx);
    expect(saveIdx).toBeGreaterThan(mergeIdx);
  });

  it("REQUIRED (L13): a successful synthesis sets notebookSceneStatus 'ready' and clears any prior notebookSceneError", () => {
    expect(fn).toMatch(/notebookSceneError: undefined, notebookSceneStatus: "ready"/);
  });

  it("REQUIRED: re-reads the note fresh immediately before the final write — never overwrites edits made while synthesis was in flight", () => {
    const generateCallIdx = fn.indexOf("const { scene, diagnostic, retried } = await runNotebookDesignerStep(");
    const finalReadIdx = fn.indexOf("getNotesByBookAsync(savedNote.bookId)", generateCallIdx);
    const saveIdx = fn.indexOf('notebookSceneStatus: "ready"', generateCallIdx);
    expect(finalReadIdx).toBeGreaterThan(-1);
    expect(saveIdx).toBeGreaterThan(finalReadIdx);
  });

  it("REQUIRED: never throws out of the background task — a failure anywhere is caught, not surfaced as an unhandled rejection", () => {
    const catchIdx = fn.indexOf("} catch (err) {");
    expect(catchIdx).toBeGreaterThan(-1);
    expect(fn).toMatch(/console\.error\("\[NOTELAB_GENERATE_BACKGROUND_ERROR\]", err\);/);
  });

  it("REQUIRED: on failure, still tries to preserve whatever deterministic content exists AND persists notebookSceneError + notebookSceneStatus 'failed' onto the note itself — 'show an explicit recoverable error... rather than reverting to the old card view [silently]', and the background task has no live UI to report to directly", () => {
    const catchIdx = fn.indexOf("} catch (err) {");
    const catchBlock = fn.slice(catchIdx);
    expect(catchBlock).toMatch(/mergeDeterministicContentIntoScene\(latest\.notebookScene \?\? null, latest,/);
    expect(catchBlock).toMatch(/notebookSceneError: message\.slice\(0, 200\),/);
    expect(catchBlock).toMatch(/notebookSceneStatus: "failed",/);
  });

  it("logs generation diagnostics — visualPlanGenerated, visualPrimitiveCount, persistenceSaveSuccess, and (ND1) the quality diagnostic's own pass/reject/retry outcome", () => {
    expect(fn).toMatch(/noteId: savedNote\.id, visualPlanGenerated: true, visualPrimitiveCount: scene\.blocks\.length,/);
    expect(fn).toMatch(/qualityPassed: diagnostic\.passed, rejectReasons: diagnostic\.rejectReasons, retried,/);
    expect(fn).toMatch(/console\.log\("\[NOTELAB_GENERATE_DIAGNOSTIC\]", \{ noteId: savedNote\.id, persistenceSaveSuccess: persisted \}\);/);
  });
});

describe("lib/notelab/composeNotebookScene.ts — saveDeterministicNotebookScene helper (NU3 / L13)", () => {
  const idx = COMPOSE_SRC.indexOf("async function saveDeterministicNotebookScene(");
  const fn = COMPOSE_SRC.slice(idx, idx + 900);

  it("REQUIRED: the helper actually exists", () => {
    expect(idx).toBeGreaterThan(-1);
  });

  it("REQUIRED: merges the note's current deterministic content via mergeDeterministicContentIntoScene", () => {
    expect(fn).toMatch(/const scene = mergeDeterministicContentIntoScene\(note\.notebookScene \?\? null, note, \{ bookId, pageNumber \}\);/);
  });

  it("REQUIRED (L13): with nothing to show (empty blocks), still writes the note (so any `extra` like notebookSceneError persists) with notebookSceneStatus 'empty', never a notebookScene field", () => {
    const guardIdx = fn.indexOf("if (scene.blocks.length === 0) {");
    expect(guardIdx).toBeGreaterThan(-1);
    const guardBlock = fn.slice(guardIdx, fn.indexOf("}", fn.indexOf("}", guardIdx) + 1));
    expect(guardBlock).toMatch(/await saveUltraNote\(\{ \.\.\.note, \.\.\.extra, notebookSceneStatus: "empty" \}\);/);
    expect(guardBlock).not.toMatch(/notebookScene:/);
  });

  it("REQUIRED (L13): with real content, saves the note with the merged notebookScene, notebookSceneStatus 'ready', plus any extra fields", () => {
    expect(fn).toMatch(/await saveUltraNote\(\{ \.\.\.note, \.\.\.extra, notebookScene: scene, notebookSceneStatus: "ready" \}\);/);
  });
});

describe("lib/notelab/ultraNoteStore.ts — UltraNote carries recoverable notebookSceneError/notebookSceneStatus fields (NU1 / L13)", () => {
  const src = fs.readFileSync(path.resolve(__dirname, "../../lib/notelab/ultraNoteStore.ts"), "utf8");

  it("REQUIRED: notebookSceneError is a real optional field on UltraNote", () => {
    const idx = src.indexOf("export interface UltraNote {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, src.indexOf("\n}", idx));
    expect(block).toMatch(/notebookSceneError\?:\s*string;/);
  });

  it("REQUIRED (L13): notebookSceneStatus is a real optional field with exactly the 4 documented states", () => {
    const idx = src.indexOf("export interface UltraNote {");
    const block = src.slice(idx, src.indexOf("\n}", idx));
    expect(block).toMatch(/notebookSceneStatus\?:\s*"pending" \| "ready" \| "empty" \| "failed";/);
  });
});

describe("GenerateNoteButton call site — knowledgeNodeId threaded through", () => {
  it("REQUIRED: passes knowledgeNodeId to GenerateNoteButton, matching the sibling GenerateStudySetButton's own prop", () => {
    const callIdx = SRC.indexOf("<GenerateNoteButton");
    const callBlock = SRC.slice(callIdx, callIdx + 600);
    expect(callBlock).toMatch(/knowledgeNodeId=\{knowledgeNodeId\}/);
  });
});
