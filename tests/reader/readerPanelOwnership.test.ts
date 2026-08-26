import fs from "fs";
import path from "path";

function read(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../..", relPath), "utf8");
}

describe("Reader panel ownership", () => {
  it("gives the permanent left rail to embedded Sticky Notes", () => {
    const page = read("pages/index.tsx");
    const sticky = read("components/reader/StickyNotesRail.tsx");
    expect(page).toMatch(/leftRail=\{resolvedDocumentId \? \(/);
    expect(page).toMatch(/<StickyNotesRail\s+embedded/);
    expect(sticky).toMatch(/embedded\?: boolean/);
    expect(sticky).toMatch(/flex h-full w-\[260px\]/);
  });

  it("keeps Thought Units inside the PDF workspace as a collapsible Page Guide", () => {
    const reader = read("components/PureReaderView.tsx");
    expect(reader).toMatch(/const \[pageGuideOpen, setPageGuideOpen\]/);
    expect(reader).toMatch(/Page Guide/);
    expect(reader).toMatch(/pageGuideOpen && \(/);
    expect(reader).toMatch(/<ThoughtUnitNavigator/);
  });

  it("uses exam-generic sticky-note prompts", () => {
    const sticky = read("components/reader/StickyNotesRail.tsx");
    expect(sticky).toMatch(/Important for exam/);
    expect(sticky).not.toMatch(/Important for DAT/);
  });
});
