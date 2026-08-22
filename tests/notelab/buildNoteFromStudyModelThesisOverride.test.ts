// tests/notelab/buildNoteFromStudyModelThesisOverride.test.ts
// P0 stabilization, Tier 4 — finishes the Whiteboard title reconciliation
// a9b3962 started. That commit fixed WhiteboardPanel's DISPLAYED title to
// prefer the Surgeon-sourced pageTitle over the legacy studyModel pipeline's
// own pageThesis (they can genuinely disagree — two independently-computed
// page-understanding pipelines). But WhiteboardPanel's "Save to NoteLab" /
// "Create Recall Card" actions still built the SAVED note from the legacy
// studyModel.pageThesis directly — so a student could see one thesis in the
// panel and get a DIFFERENT one saved to NoteLab the moment they clicked
// Save. pageThesisOverride closes that gap: additive and optional, so every
// other buildNoteFromStudyModel caller (which already reads/displays THIS
// SAME model, no competing pipeline in play) is unaffected.
//
// Real behavioral tests against the actual exported function —
// buildNoteFromStudyModel has no React/DOM/network dependency.

import { buildNoteFromStudyModel } from "../../lib/notelab/ultraNoteStore";
import { buildStudyModel } from "../../lib/insights/currentPageStudyModel";

const VIEW = {
  title: "Buffer Systems",
  coreIdea: "Buffer solutions resist changes in pH by neutralizing added acid or base.",
  blocks: [
    { title: "Mechanism", pattern: "Weak acid/conjugate base pair", surgicalReason: "Neutralizes excess H+", trap: "Assuming unlimited capacity", rule: "Henderson-Hasselbalch" },
  ],
  miniTest: ["What happens when the weak acid is fully consumed?"],
};

function buildModel() {
  return buildStudyModel(VIEW, {}, "book", 4, "universal");
}

describe("buildNoteFromStudyModel — pageThesisOverride (Tier 4)", () => {
  it("REQUIRED: without pageThesisOverride, behaves exactly as before — uses model.pageThesis", () => {
    const model = buildModel();
    const note = buildNoteFromStudyModel(model, { bookId: "book", pageNumber: 4, topic: "Chemistry" });
    expect(note.pageThesis).toBe(model.pageThesis);
    expect(note.coreIdea).toBe(model.pageThesis);
    expect(note.sections?.find((s) => s.label === "Chief Concern / Problem")?.content).toBe(model.pageThesis);
  });

  it("REQUIRED: with pageThesisOverride, the note's thesis/coreIdea/Chief-Concern section use the override, not model.pageThesis", () => {
    const model = buildModel();
    const surgeonThesis = "The Krebs cycle oxidizes acetyl-CoA to release energy as NADH and FADH2.";
    const note = buildNoteFromStudyModel(model, {
      bookId: "book", pageNumber: 4, topic: "Chemistry", pageThesisOverride: surgeonThesis,
    });
    expect(note.pageThesis).toBe(surgeonThesis);
    expect(note.coreIdea).toBe(surgeonThesis);
    expect(note.sections?.find((s) => s.label === "Chief Concern / Problem")?.content).toBe(surgeonThesis);
    expect(note.pageThesis).not.toBe(model.pageThesis);
  });

  it("REQUIRED: the Summary section also uses the override, not the legacy thesis", () => {
    const model = buildModel();
    const surgeonThesis = "The Krebs cycle oxidizes acetyl-CoA to release energy as NADH and FADH2.";
    const note = buildNoteFromStudyModel(model, {
      bookId: "book", pageNumber: 4, topic: "Chemistry", pageThesisOverride: surgeonThesis,
    });
    const summary = note.sections?.find((s) => s.label === "Summary")?.content ?? "";
    expect(summary).toContain(surgeonThesis);
    expect(summary).not.toContain(model.pageThesis);
  });

  it("an empty-string override is treated as absent — falls back to model.pageThesis rather than saving a blank thesis", () => {
    const model = buildModel();
    const note = buildNoteFromStudyModel(model, {
      bookId: "book", pageNumber: 4, topic: "Chemistry", pageThesisOverride: "",
    });
    expect(note.pageThesis).toBe(model.pageThesis);
  });

  it("does not touch conceptBlocks/studyNotes-derived content — only the thesis-specific fields change", () => {
    const model = buildModel();
    const surgeonThesis = "A different page-level thesis entirely.";
    const withOverride = buildNoteFromStudyModel(model, {
      bookId: "book", pageNumber: 4, topic: "Chemistry", pageThesisOverride: surgeonThesis,
    });
    const withoutOverride = buildNoteFromStudyModel(model, { bookId: "book", pageNumber: 4, topic: "Chemistry" });
    expect(withOverride.concepts).toEqual(withoutOverride.concepts);
    expect(withOverride.memoryShortcuts).toEqual(withoutOverride.memoryShortcuts);
  });
});
