// tests/apex/courseExamScopePreserved.test.ts
// Post-merge fix — automated review on #688 (after merge) found that
// selecting a Course Exam type (e.g. Chapter Quiz → 'selected-chapters')
// BEFORE choosing its source book got silently overwritten once the
// bookId-load effect resolved: that effect unconditionally calls
// setExamScope(defaultScopeFor(progress)) whenever bookId changes, with no
// awareness that a Course Exam type had already set a specific scope. A
// Chapter Quiz could stay visually highlighted while actually querying
// 'completed'/'entire-book', and a Cumulative Final on a previously-read
// book would silently narrow to 'completed' pages instead of the whole
// book it promised.
//
// No jsdom/render harness for this file in this repo — source inspection,
// matching this repo's established pattern for React components.

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../app/apex/generator/page.tsx"), "utf8");

describe("app/apex/generator/page.tsx — a Course Exam type's scope survives the book loading afterward", () => {
  it("REQUIRED: courseExamTypeRef mirrors courseExamType so the bookId effect can read it without depending on it", () => {
    expect(SRC).toMatch(/const courseExamTypeRef = useRef<CourseExamType \| null>\(null\);/);
    expect(SRC).toMatch(/useEffect\(\(\) => \{ courseExamTypeRef\.current = courseExamType; \}, \[courseExamType\]\);/);
  });

  it("REQUIRED: the bookId-load effect only applies the book's default scope when no Course Exam type is active", () => {
    const idx = SRC.indexOf("getReadingProgress(bookId)");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 800);
    expect(block).toMatch(/if \(courseExamTypeRef\.current === null\) \{/);
    expect(block).toMatch(/setExamScope\(defaultScopeFor\(progress\)\);/);
  });

  it("the bookId-load effect's own dependency array still excludes courseExamType — reading it via ref must not turn every type click into a node/progress refetch", () => {
    // P1 remediation L8 added selectedDocumentId to this same effect's deps
    // (so its own getNodesByBook disambiguation stays in sync with the
    // canonical document identity, not just its bookId mirror) — courseExamType
    // itself must still be absent, which is what this test actually guards.
    const idx = SRC.indexOf("getReadingProgress(bookId)");
    const effectEndIdx = SRC.indexOf("}, [bookId, selectedDocumentId]);", idx);
    expect(effectEndIdx).toBeGreaterThan(idx);
  });
});
