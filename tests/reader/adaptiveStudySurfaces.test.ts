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
    expect(source).toContain("SectionsView");
    expect(source).toContain("Source Evidence");
    expect(source.indexOf("<SectionsView")).toBeLessThan(source.indexOf("ADAPTIVE STUDY CARDS"));
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
