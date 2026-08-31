import fs from "fs";
import path from "path";

const read = (relative: string) => fs.readFileSync(path.resolve(__dirname, "../..", relative), "utf8");

describe("canonical adaptive study surfaces", () => {
  it("keeps the Thought Unit engine behind the PDF and the Page Guide optional", () => {
    const source = read("components/PureReaderView.tsx");
    expect(source).toContain('data-thought-unit-engine="active"');
    expect(source).toContain("useState(false)");
    expect(source).toContain("optional view of the hidden Thought Unit engine");
  });

  it("shows only active-linked source evidence as a collapsed Right Panel inspector", () => {
    const source = read("components/reader/RightPanel.tsx");
    expect(source).toContain("activeGroundedAnnotations");
    expect(source).toContain("Source evidence");
    expect(source).toContain("groundedEvidenceOpen");
    expect(source).not.toContain("Grounded on This Page");
  });

  it("makes the visual notebook and student-authored layer canonical in NoteLab", () => {
    const source = read("components/notelab/UltraNotesList.tsx");
    expect(source).toContain('label="MY NOTES"');
    expect(source).toContain('data-testid="visual-notebook-page"');
    expect(source).not.toContain("<NoteCardGrid");
    expect(source).not.toContain("ADAPTIVE STUDY CARDS");
  });

  // NU4 (NoteLab Unification correction) retired the old card-based
  // SectionsView/section-grid renderer entirely — its content (Big Idea/Key
  // Facts/etc.) is migrated into the notebookScene itself as real primitives
  // (see lib/notelab/deterministicNotebookBlocks.ts and
  // tests/notelab/deterministicNotebookBlocks.test.ts), so there is no
  // longer a separate section grid for provenance to stay out of, and no
  // standing SOURCE REFERENCES list either — see
  // tests/notelab/evidenceAsProvenance.test.ts and
  // tests/notelab/notebookCanvasWiring.test.ts for the current contract.
  it("keeps provenance out of the notebook — no standalone section grid or source-reference list remain to leak it", () => {
    const source = read("components/notelab/UltraNotesList.tsx");
    expect(source).not.toContain("SectionsView");
    expect(source).not.toContain("SOURCE REFERENCES");
  });

  it("preserves the student-authored layer when AI regenerates a stable page note", () => {
    const source = read("lib/notelab/ultraNoteStore.ts");
    expect(source).toContain('hasOwnProperty.call(note, "studentNotes")');
    expect(source).toContain("studentNotes: existing.studentNotes");
    expect(source).toContain("idbPutNote(noteToSave)");
  });

  it("uses semantic disabled controls with visible prerequisites in Learning Hub", () => {
    const source = read("components/learningHub/LearningHubLaunchPanel.tsx");
    expect(source).toContain("disabled={disabled}");
    expect(source).toContain("disabledReason");
    expect(source).toContain("disabledReason");
    expect(source).toContain("Locked");
  });

  it("requires math and narrative Whiteboards to use specific visual grammars", () => {
    const source = read("pages/api/professor-lesson-plan.ts");
    expect(source).toContain("Do not reduce a mathematics page to generic labeled rectangles");
    expect(source).toMatch(/teach characters, event order, motivation, and\s+consequences as a light story board/);
  });
});
