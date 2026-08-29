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
// N1 (NoteLab adaptivity correction) — buildNoteFromStudyModel no longer
// forces every page through a fixed 14-slot section template ("Chief
// Concern / Problem", "Summary", etc.); `sections` is now derived directly
// from model.noteCards (the adaptive card set). pageThesisOverride's scope
// narrows accordingly: it still changes note.pageThesis/note.coreIdea (the
// fields it exists to fix), but no longer reaches into a synthetic
// thesis-shaped section that doesn't exist anymore — noteCards content is
// independent of it, same as concepts/memoryShortcuts always were.
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
  });

  it("REQUIRED: with pageThesisOverride, note.pageThesis/note.coreIdea use the override, not model.pageThesis", () => {
    const model = buildModel();
    const surgeonThesis = "The Krebs cycle oxidizes acetyl-CoA to release energy as NADH and FADH2.";
    const note = buildNoteFromStudyModel(model, {
      bookId: "book", pageNumber: 4, topic: "Chemistry", pageThesisOverride: surgeonThesis,
    });
    expect(note.pageThesis).toBe(surgeonThesis);
    expect(note.coreIdea).toBe(surgeonThesis);
    expect(note.pageThesis).not.toBe(model.pageThesis);
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
    expect(withOverride.sections).toEqual(withoutOverride.sections);
  });
});

describe("buildNoteFromStudyModel — N1: sections are adaptive (derived from noteCards), never a fixed template", () => {
  it("REQUIRED: does not emit any of the old hardcoded-ONLY fixed-section labels — a label a legitimately adaptive noteCard type can also produce (e.g. \"Memory Hook\", \"Connection Map\") is fine when the content genuinely calls for it; these never had an adaptive equivalent and were always forced regardless of content", () => {
    const model = buildModel();
    const note = buildNoteFromStudyModel(model, { bookId: "book", pageNumber: 4, topic: "Chemistry" });
    const labels = note.sections?.map((s) => s.label) ?? [];
    const OLD_TEMPLATE_ONLY_LABELS = [
      "Chief Concern / Problem", "Why This Matters Clinically", "Diagnostic Reasoning",
      "Procedure Logic", "Decision Tree", "Danger Zone",
      "Case-Style Recall Questions", "Exam Strategy", "Summary",
    ];
    for (const retired of OLD_TEMPLATE_ONLY_LABELS) {
      expect(labels).not.toContain(retired);
    }
  });

  it("REQUIRED: sections are exactly model.noteCards mapped to {label: title, content: body}, plus a trailing Source section", () => {
    const model = buildModel();
    const note = buildNoteFromStudyModel(model, { bookId: "book", pageNumber: 4, topic: "Chemistry", bookTitle: "Gen Chem" });
    const expectedFromCards = model.noteCards.map((c) => ({ label: c.title, content: c.body }));
    expect(note.sections?.slice(0, expectedFromCards.length)).toEqual(expectedFromCards);
    const last = note.sections?.[note.sections.length - 1];
    expect(last?.label).toBe("Source");
    expect(last?.content).toBe("Book: Gen Chem · Page: 4 · Topic: Chemistry");
  });

  it("a page with zero noteCards still gets a valid note with only the Source section — never padded with manufactured filler", () => {
    const model = buildModel();
    model.noteCards = [];
    const note = buildNoteFromStudyModel(model, { bookId: "book", pageNumber: 4, topic: "Chemistry" });
    expect(note.sections).toHaveLength(1);
    expect(note.sections?.[0].label).toBe("Source");
  });
});
