// tests/notelab/lessonToNotebookSceneWiring.test.ts
// N5 (superseded by M3) — source-inspection tests for handleSaveToNoteLab's
// wiring in components/WhiteboardPanel.tsx, same repo convention as
// tests/whiteboard/panelThesisReconciliation.test.ts (no jsdom/render
// harness for this file). The pure recomposition function itself
// (lib/notelab/lessonToNotebookScene.ts) has real behavioral coverage in
// tests/notelab/lessonToNotebookScene.test.ts.
//
// M3 replaced N5's "recompose the lesson's raw shape geometry inline,
// before the save" behavior with a real AI synthesis path that runs AFTER
// the primary save (never blocking it), with the deterministic recomposition
// kept only as a fallback. These tests were rewritten for that shape —
// see git history for the N5-era assertions this superseded.

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../components/WhiteboardPanel.tsx"), "utf8");

describe("components/WhiteboardPanel.tsx — handleSaveToNoteLab saves fast, then composes the notebook in the background", () => {
  it("REQUIRED: imports generateNotebookScene/summarizeExistingNotebookScene, extractLessonNarration, and the fallback buildNotebookSceneFromLessonSnapshot", () => {
    expect(SRC).toMatch(/import \{ buildNotebookSceneFromLessonSnapshot, extractLessonNarration \} from "@\/lib\/notelab\/lessonToNotebookScene";/);
    expect(SRC).toMatch(/import \{ generateNotebookScene, summarizeExistingNotebookScene \} from "@\/lib\/notelab\/notebookPlanner";/);
  });

  it("M4: imports gatherConceptNotebookContent from the new concept-accumulation module", () => {
    expect(SRC).toMatch(/import \{ gatherConceptNotebookContent \} from "@\/lib\/notelab\/conceptAccumulation";/);
  });

  it("M4: back-fills note.knowledgeNodeId onto the saved UltraNote before saving — without this, concept accumulation never activates for lesson-saves", () => {
    const idx = SRC.indexOf("const handleSaveToNoteLab = async () => {");
    const block = SRC.slice(idx, idx + 2861);
    const backfillIdx = block.indexOf("note.knowledgeNodeId = knowledgeNodeId;");
    const saveIdx = block.indexOf("await saveUltraNote(note);");
    expect(backfillIdx).toBeGreaterThan(-1);
    expect(saveIdx).toBeGreaterThan(backfillIdx);
  });

  it("REQUIRED: saves the note and flashes success BEFORE ever touching the lesson snapshot — the primary save never waits on AI synthesis", () => {
    const idx = SRC.indexOf("const handleSaveToNoteLab = async () => {");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 2861);
    const saveIdx = block.indexOf("await saveUltraNote(note);");
    const flashIdx = block.indexOf('flashAction("✅ Saved to NoteLab");');
    const backgroundCallIdx = block.indexOf("composeNotebookSceneInBackground(note, lessonId, resolvedDocumentId)");
    expect(saveIdx).toBeGreaterThan(-1);
    expect(flashIdx).toBeGreaterThan(saveIdx);
    expect(backgroundCallIdx).toBeGreaterThan(flashIdx);
  });

  it("REQUIRED: the background composition call is fire-and-forget (void), never awaited by the button handler", () => {
    const idx = SRC.indexOf("const handleSaveToNoteLab = async () => {");
    const block = SRC.slice(idx, idx + 2861);
    expect(block).toMatch(/void composeNotebookSceneInBackground\(note, lessonId, resolvedDocumentId\);/);
  });
});

describe("components/WhiteboardPanel.tsx — composeNotebookSceneInBackground: real synthesis, deterministic fallback", () => {
  const fnIdx = SRC.indexOf("const composeNotebookSceneInBackground = async");
  const fn = SRC.slice(fnIdx, fnIdx + 3000);

  it("REQUIRED: the function actually exists", () => {
    expect(fnIdx).toBeGreaterThan(-1);
  });

  it("REQUIRED: gates on the SAME lesson-snapshot lookup N5 always used — no snapshot means no recomposition, exactly as before", () => {
    expect(fn).toMatch(/getWhiteboardLessonSnapshot\(lessonIdForSnapshot, documentId\)/);
    expect(fn).toMatch(/if \(!snapshot\) return;/);
  });

  it("REQUIRED: reads this page's real canonical thought units via the same store examBuilder.ts's own note-driven lookup uses (note.pageNumber - 1 convention)", () => {
    expect(fn).toMatch(/getCanonicalUnitsByPage\(documentId, savedNote\.pageNumber - 1\)/);
  });

  it("REQUIRED: extracts the lesson's narration (durable knowledge), never its shape geometry, as professorExplanation for the real synthesis call", () => {
    expect(fn).toMatch(/professorExplanation: extractLessonNarration\(snapshot\)/);
  });

  it("REQUIRED: reads the EXISTING note's own studentNotes/notebookScene as additional synthesis context — never a blind overwrite of what the student already has", () => {
    expect(fn).toMatch(/studentNotes: existingNote\.studentNotes \?\? null/);
    expect(fn).toMatch(/existingNotebookSummary: existingNote\.notebookScene \? summarizeExistingNotebookScene\(existingNote\.notebookScene\) : null/);
  });

  it("M4: gathers what OTHER notes on the same concept already know, gated on savedNote.knowledgeNodeId — never guessed when the note has no resolved concept", () => {
    expect(fn).toMatch(/const relatedConceptKnowledge = savedNote\.knowledgeNodeId\s*\n\s*\? await gatherConceptNotebookContent\(savedNote\.knowledgeNodeId, savedNote\.id\)\s*\n\s*: null;/);
  });

  it("M4: passes relatedConceptKnowledge into the real synthesis call", () => {
    expect(fn).toMatch(/relatedConceptKnowledge,\s*\n\s*\}\);/);
  });

  it("REQUIRED: only attempts the live AI synthesis when there are real canonical units to ground it in — otherwise goes straight to the deterministic fallback", () => {
    expect(fn).toMatch(/if \(units\.length > 0\) \{/);
    expect(fn).toMatch(/\} else \{/);
  });

  it("REQUIRED: falls back to buildNotebookSceneFromLessonSnapshot when the live synthesis call throws — never leaves the note with no scene on an AI failure", () => {
    const tryIdx = fn.indexOf("try {\n          scene = await generateNotebookScene(");
    const catchIdx = fn.indexOf("} catch (synthesisErr) {", tryIdx);
    const fallbackIdx = fn.indexOf("scene = buildNotebookSceneFromLessonSnapshot(snapshot, { bookId: savedNote.bookId, pageNumber: savedNote.pageNumber });", catchIdx);
    expect(tryIdx).toBeGreaterThan(-1);
    expect(catchIdx).toBeGreaterThan(tryIdx);
    expect(fallbackIdx).toBeGreaterThan(catchIdx);
  });

  it("REQUIRED: re-reads the note fresh immediately before the final write — never overwrites edits made while synthesis was in flight", () => {
    const finalReadIdx = fn.lastIndexOf("getNotesByBookAsync(savedNote.bookId)");
    const saveIdx = fn.indexOf("await saveUltraNote({ ...latest, notebookScene: scene });");
    expect(finalReadIdx).toBeGreaterThan(-1);
    expect(saveIdx).toBeGreaterThan(finalReadIdx);
  });

  it("flashes a distinct, second message once the notebook is actually composed", () => {
    expect(fn).toMatch(/flashAction\("🖊️ Notebook composed"\);/);
  });

  it("REQUIRED: never throws out of the background task — a failure anywhere is caught and logged, not surfaced as an unhandled rejection", () => {
    expect(fn).toMatch(/\} catch \(err\) \{\s*console\.error\("\[WHITEBOARD_SAVE_NOTELAB_BACKGROUND_ERROR\]", err\);\s*\}/);
  });
});
