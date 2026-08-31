// tests/notelab/studentNotesNotebookSync.test.ts
// NU3 (NoteLab Unification correction) — "Migrate current Study Page content
// into tldraw... Do not make the student choose between visual notes versus
// study notes. They are one note."
//
// composeNoteNotebookSceneInBackground (RightPanel.tsx) is the only other
// writer of UltraNote.notebookScene, and it only runs right after a
// "Generate Ultra Note" save. Writing notes directly from the notebook
// itself — NoteCard's own "Save my notes" button (handleSaveStudentNotes) —
// never went through that path, so without this fix the notebook's own
// handwritten_text block would go stale the moment a student edited their
// notes from inside the notebook. No jsdom/render harness for this file —
// source inspection, matching tests/notelab/generateNoteNotebookSceneWiring.test.ts's
// own convention for this same kind of wiring check.

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../components/notelab/UltraNotesList.tsx"), "utf8");

describe("components/notelab/UltraNotesList.tsx — handleSaveStudentNotes keeps notebookScene in sync (NU3)", () => {
  it("REQUIRED: imports mergeDeterministicContentIntoScene", () => {
    expect(SRC).toMatch(/import \{ mergeDeterministicContentIntoScene \} from "@\/lib\/notelab\/deterministicNotebookBlocks";/);
  });

  const idx = SRC.indexOf("async function handleSaveStudentNotes()");
  const fn = SRC.slice(idx, idx + 1400);

  it("REQUIRED: the handler actually exists", () => {
    expect(idx).toBeGreaterThan(-1);
  });

  it("REQUIRED: recomputes the deterministic scene from the just-updated note (with the new studentNotes value already applied) before saving", () => {
    const updatedIdx = fn.indexOf("const updated: UltraNote = { ...note, studentNotes: studentDraft.trim() || undefined };");
    const mergeIdx = fn.indexOf("mergeDeterministicContentIntoScene(updated.notebookScene ?? null, updated,", updatedIdx);
    expect(updatedIdx).toBeGreaterThan(-1);
    expect(mergeIdx).toBeGreaterThan(updatedIdx);
  });

  it("REQUIRED: only attaches the recomputed scene when it actually has content — never overwrites notebookScene with an empty one", () => {
    expect(fn).toMatch(/await saveUltraNote\(scene\.blocks\.length > 0 \? \{ \.\.\.updated, notebookScene: scene \} : updated\);/);
  });

  it("REQUIRED: this is a purely local/deterministic recomposition — no AI call, no network request, in this handler", () => {
    expect(fn).not.toMatch(/generateNotebookScene|requestNotebookPlan|fetch\(/);
  });
});
