// tests/notelab/lessonToNotebookSceneWiring.test.ts
// N5 — source-inspection tests for handleSaveToNoteLab's wiring in
// components/WhiteboardPanel.tsx, same repo convention as
// tests/whiteboard/panelThesisReconciliation.test.ts (no jsdom/render
// harness for this file). The pure recomposition function itself
// (lib/notelab/lessonToNotebookScene.ts) has real behavioral coverage in
// tests/notelab/lessonToNotebookScene.test.ts.

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../components/WhiteboardPanel.tsx"), "utf8");

describe("components/WhiteboardPanel.tsx — handleSaveToNoteLab recomposes a taught lesson's real geometry", () => {
  it("REQUIRED: imports buildNotebookSceneFromLessonSnapshot and getWhiteboardLessonSnapshot", () => {
    expect(SRC).toMatch(/import \{ buildNotebookSceneFromLessonSnapshot \} from "@\/lib\/notelab\/lessonToNotebookScene";/);
    expect(SRC).toMatch(/getWhiteboardLessonSnapshot,\s*\} from "@\/lib\/knowledge\/whiteboardLessonSnapshotStore";/);
  });

  it("REQUIRED: looks up this page's lesson snapshot by the SAME lessonId/effectiveLearningDocumentId identity Learning State and the snapshot save already use — never a separately-derived id", () => {
    const idx = SRC.indexOf("const handleSaveToNoteLab = async () => {");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 2100);
    expect(block).toMatch(/if \(lessonId\) \{/);
    expect(block).toMatch(/getWhiteboardLessonSnapshot\(lessonId, effectiveLearningDocumentId\)/);
  });

  it("REQUIRED: attaches the recomposed scene to note.notebookScene, keyed by the SAVED note's own bookId/pageNumber (not the raw props) — so the scene always matches what was actually persisted", () => {
    const idx = SRC.indexOf("const handleSaveToNoteLab = async () => {");
    const block = SRC.slice(idx, idx + 2100);
    expect(block).toMatch(/note\.notebookScene = buildNotebookSceneFromLessonSnapshot\(snapshot, \{\s*bookId: note\.bookId,\s*pageNumber: note\.pageNumber,\s*\}\);/);
  });

  it("REQUIRED: a missing snapshot, or a lookup failure, never blocks the save itself — the note still saves with its flat-text sections either way", () => {
    const idx = SRC.indexOf("const handleSaveToNoteLab = async () => {");
    const block = SRC.slice(idx, idx + 2100);
    // The snapshot lookup+scene build sits inside its own try/catch, and
    // saveUltraNote(note) is called unconditionally afterward — not inside
    // an else/only-on-success branch.
    const tryIdx = block.indexOf("if (lessonId) {");
    const catchIdx = block.indexOf("} catch (err) {", tryIdx);
    const saveIdx = block.indexOf("await saveUltraNote(note);");
    expect(tryIdx).toBeGreaterThan(-1);
    expect(catchIdx).toBeGreaterThan(tryIdx);
    expect(saveIdx).toBeGreaterThan(catchIdx);
  });
});
