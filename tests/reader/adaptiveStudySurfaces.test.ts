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

  it("makes the structured notebook and student-authored layer canonical in NoteLab", () => {
    const source = read("components/notelab/UltraNotesList.tsx");
    expect(source).toContain('label="MY NOTES"');
    expect(source).toContain('data-testid="visual-notebook-page"');
    expect(source).toContain('data-testid="adaptive-notebook-sections"');
    expect(source).toContain("SectionsView");
    expect(source).toContain("Source Evidence");
    expect(source).toContain("getCanonicalNotebookSections(note)");
    expect(source).not.toContain("<NoteCardGrid");
    expect(source).not.toContain("ADAPTIVE STUDY CARDS");
  });

  it("keeps provenance out of the primary notebook section grid", () => {
    const source = read("components/notelab/UltraNotesList.tsx");
    expect(source).toContain('section.label !== "Source Evidence"');
    // P4 (Evidence-as-provenance correction) renamed this from "SOURCE
    // EVIDENCE" to "SOURCE REFERENCES" — the standing Evidence panel was
    // removed entirely; this collapsed per-note list is the only survivor,
    // and it's no longer branded "Evidence" to avoid reading as a second,
    // competing surface. See tests/notelab/evidenceAsProvenance.test.ts.
    expect(source).toContain("SOURCE REFERENCES · PDF PAGE");
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
