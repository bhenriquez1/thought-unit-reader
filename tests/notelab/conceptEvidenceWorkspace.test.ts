// tests/notelab/conceptEvidenceWorkspace.test.ts
// Regression guards for the NoteLab Concept Evidence Workspace redesign.
//
// Static analysis (no DOM / no jsdom):
//   1. LearningSourcesManager does NOT have a "Guide" sub-tab (removed duplicate).
//   2. EvidenceWorkspace has an ACTIVE CONCEPT section.
//   3. EvidenceWorkspace has an AVRRIO INTERPRETATION section.
//   4. LearningSourcesManager does NOT contain GuideView / GuideSection / GuideNote functions.
//   5. The NoteLab sources sub-tab in index.tsx does NOT include StudyGuideLab above
//      LearningSourcesManager (no duplicate study guide rendering).
//
// M5 — Evidence was its own NoteLab sub-tab ("🔬 Evidence" / notesSubTab
// "sources"), a separate click away from the notes themselves. It's now
// woven inline into each expanded note in UltraNotesList.tsx instead, scoped
// to that note's own (documentId, pageNumber, pageTruthKey) rather than
// whichever page the Reader happens to be showing. index.tsx no longer
// mounts LearningSourcesManager directly.

import fs from "fs";
import path from "path";

const MANAGER   = path.resolve(__dirname, "../../components/notelab/LearningSourcesManager.tsx");
const WORKSPACE = path.resolve(__dirname, "../../components/notelab/EvidenceWorkspace.tsx");
const INDEX     = path.resolve(__dirname, "../../pages/index.tsx");

// ── LearningSourcesManager — Guide tab removed ────────────────────────────

describe("LearningSourcesManager — Guide sub-tab removed", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(MANAGER, "utf8"); });

  it('does NOT have a "guide" key in the PanelView type', () => {
    expect(src).not.toMatch(/"guide"/);
  });

  it('does NOT render a Guide button in the view toggle', () => {
    expect(src).not.toMatch(/label:\s*["']Guide["']/);
  });

  it("does NOT contain GuideView function", () => {
    expect(src).not.toMatch(/function GuideView/);
  });

  it("does NOT contain GuideSection function", () => {
    expect(src).not.toMatch(/function GuideSection/);
  });

  it("does NOT contain GuideNote function", () => {
    expect(src).not.toMatch(/function GuideNote/);
  });

  it("does NOT contain GUIDE_SECTIONS constant", () => {
    expect(src).not.toMatch(/GUIDE_SECTIONS/);
  });

  it("still renders EvidenceWorkspace (primary view)", () => {
    expect(src).toMatch(/EvidenceWorkspace/);
  });

  it("still renders SourcesView (secondary view)", () => {
    expect(src).toMatch(/SourcesView/);
  });
});

// ── EvidenceWorkspace — ACTIVE CONCEPT section ────────────────────────────

describe("EvidenceWorkspace — ACTIVE CONCEPT section", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(WORKSPACE, "utf8"); });

  it('renders "ACTIVE CONCEPT" heading', () => {
    expect(src).toMatch(/ACTIVE CONCEPT/);
  });

  it("renders activeUnitLabel (the textbook quote)", () => {
    expect(src).toMatch(/activeUnitLabel/);
  });
});

// ── EvidenceWorkspace — AVRRIO INTERPRETATION section ────────────────────

describe("EvidenceWorkspace — AVRRIO INTERPRETATION section", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(WORKSPACE, "utf8"); });

  it('renders "AVRRIO INTERPRETATION" heading', () => {
    expect(src).toMatch(/AVRRIO INTERPRETATION/);
  });

  it("shows whyThisMatters field from studyNotes", () => {
    expect(src).toMatch(/studyModel\.studyNotes\.whyThisMatters/);
  });

  it("shows commonConfusion field from studyNotes", () => {
    expect(src).toMatch(/studyModel\.studyNotes\.commonConfusion/);
  });

  it("shows keyMechanism field from studyNotes (only when non-null)", () => {
    expect(src).toMatch(/studyModel\.studyNotes\.keyMechanism/);
  });

  it("shows examSignal field from studyNotes", () => {
    expect(src).toMatch(/studyModel\.studyNotes\.examSignal/);
  });

  it("has a provenance label distinguishing AI from source text", () => {
    expect(src).toMatch(/already computed|AI-inferred|not source text/);
  });

  it("renders immutable Surgeon-grounded source evidence", () => {
    expect(src).toMatch(/Surgeon-grounded/);
    expect(src).toMatch(/CanonicalEvidenceCard/);
  });

  it("renders student notes, saved Professor snapshots, recall material, and related concepts", () => {
    expect(src).toMatch(/STUDENT NOTE/);
    expect(src).toMatch(/PROFESSOR SNAPSHOTS/);
    expect(src).toMatch(/RECALL MATERIAL/);
    expect(src).toMatch(/RELATED CONCEPTS/);
  });
});

// ── EvidenceWorkspace — InterpretationNote sub-component ─────────────────

describe("EvidenceWorkspace — InterpretationNote helper", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(WORKSPACE, "utf8"); });

  it("defines InterpretationNote component", () => {
    expect(src).toMatch(/function InterpretationNote/);
  });

  it("InterpretationNote renders label and text props", () => {
    expect(src).toMatch(/label.*text|text.*label/s);
  });
});

// ── pages/index.tsx — M5: Evidence is woven into NoteLab, not its own sub-tab

describe("pages/index.tsx — M5: Evidence sub-tab collapsed into NoteLab", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(INDEX, "utf8"); });

  it("REQUIRED: notesSubTab no longer offers a separate Evidence/sources click", () => {
    expect(src).toMatch(/useState<"notes" \| "teaching">\("notes"\)/);
    expect(src).not.toMatch(/"notes", "sources", "teaching"/);
    expect(src).not.toMatch(/🔬 Evidence/);
  });

  it("REQUIRED: no longer mounts LearningSourcesManager directly — it moved inline into UltraNotesList", () => {
    expect(src).not.toMatch(/<LearningSourcesManager/);
    expect(src).not.toMatch(/const LearningSourcesManager = dynamic/);
  });

  it("passes the live Reader-page context UltraNotesList needs for inline evidence", () => {
    const block = src.slice(src.indexOf("<UltraNotesList"), src.indexOf("/>", src.indexOf("<UltraNotesList")));
    expect(block).toMatch(/surgeonPageTruthKey=\{surgeonAnnotations\.plan\?\.pageTruthKey/);
    expect(block).toMatch(/groundedAnnotations=\{surgeonAnnotations\.groundedAnnotations\}/);
    expect(block).toMatch(/studyModel=\{currentPageStudyModel\}/);
  });

  it("opens to structured saved notes and renders UltraNotesList as the canonical workspace", () => {
    expect(src).toMatch(/<UltraNotesList/);
    expect(src).not.toMatch(/<PersonalWorkspaceTab/);
  });
});

// ── components/notelab/UltraNotesList.tsx — M5: Evidence woven inline ──────

describe("components/notelab/UltraNotesList.tsx — M5: Evidence woven into each expanded note", () => {
  const NOTES_LIST = path.resolve(__dirname, "../../components/notelab/UltraNotesList.tsx");
  let src: string;
  beforeAll(() => { src = fs.readFileSync(NOTES_LIST, "utf8"); });

  it("REQUIRED: imports and renders LearningSourcesManager inline, not behind a separate tab", () => {
    expect(src).toMatch(/import LearningSourcesManager from "@\/components\/notelab\/LearningSourcesManager";/);
    expect(src).toMatch(/<LearningSourcesManager/);
  });

  it("REQUIRED: scopes evidence to THIS note's own identity, never the globally-open Reader page's", () => {
    expect(src).toMatch(/const noteDocumentId = note\.documentId \?\? note\.bookId;/);
    expect(src).toMatch(/documentId=\{noteDocumentId\}/);
    expect(src).toMatch(/currentPage=\{note\.pageNumber\}/);
    expect(src).toMatch(/pageTruthKey=\{notePageTruthKey\}/);
  });

  it("falls back to a freshly built pageTruthKey for notes saved before that field existed", () => {
    expect(src).toMatch(/const notePageTruthKey = note\.pageTruthKey \?\? buildPageTruthKey\(noteDocumentId, note\.pageNumber\);/);
  });

  it("is visible for every note regardless of the notebook/study-page view toggle — not gated on noteView", () => {
    const evidenceIdx = src.indexOf("🔬 EVIDENCE · PDF PAGE");
    const noteViewPageEndIdx = src.indexOf('/* end noteView === "page" */');
    expect(evidenceIdx).toBeGreaterThan(-1);
    expect(noteViewPageEndIdx).toBeGreaterThan(-1);
    expect(evidenceIdx).toBeGreaterThan(noteViewPageEndIdx);
  });
});
