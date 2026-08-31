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
  const fn = SRC.slice(idx, idx + 2000);

  it("REQUIRED: the function actually exists", () => {
    expect(idx).toBeGreaterThan(-1);
  });

  it("REQUIRED: reads this page's real canonical thought units via the same note.pageNumber - 1 convention as WhiteboardPanel.tsx", () => {
    expect(fn).toMatch(/getCanonicalUnitsByPage\(documentId, savedNote\.pageNumber - 1\)/);
  });

  it("REQUIRED: with zero canonical units, returns without synthesis — no deterministic fallback invented for a case with no lesson to recompose from", () => {
    const unitsIdx = fn.indexOf("if (units.length === 0) return;");
    expect(unitsIdx).toBeGreaterThan(-1);
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

  it("REQUIRED: re-reads the note fresh immediately before the final write — never overwrites edits made while synthesis was in flight", () => {
    const finalReadIdx = fn.lastIndexOf("getNotesByBookAsync(savedNote.bookId)");
    const saveIdx = fn.indexOf("await saveUltraNote({ ...latest, notebookScene: scene });");
    expect(finalReadIdx).toBeGreaterThan(-1);
    expect(saveIdx).toBeGreaterThan(finalReadIdx);
  });

  it("REQUIRED: never throws out of the background task — a failure anywhere is caught and logged, not surfaced as an unhandled rejection", () => {
    expect(fn).toMatch(/\} catch \(err\) \{\s*console\.error\("\[NOTELAB_GENERATE_BACKGROUND_ERROR\]", err\);\s*\}/);
  });
});

describe("GenerateNoteButton call site — knowledgeNodeId threaded through", () => {
  it("REQUIRED: passes knowledgeNodeId to GenerateNoteButton, matching the sibling GenerateStudySetButton's own prop", () => {
    const callIdx = SRC.indexOf("<GenerateNoteButton");
    const callBlock = SRC.slice(callIdx, callIdx + 600);
    expect(callBlock).toMatch(/knowledgeNodeId=\{knowledgeNodeId\}/);
  });
});
