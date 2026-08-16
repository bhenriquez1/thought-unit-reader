// tests/apex/examForgeRename.test.ts
// X1 — visible product copy renamed to "Avrrio Exam Forge" (DAT as the
// first ExamProfile), while internal routes (/apex, /dat-apex) and
// component/file names are left untouched — only what a user actually
// reads on screen changes.

import fs from "fs";
import path from "path";

function read(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../..", relPath), "utf8");
}

describe("Exam Forge rename — visible copy only", () => {
  it("REQUIRED: app/apex/page.tsx dashboard header reads 'Avrrio Exam Forge — DAT'", () => {
    const src = read("app/apex/page.tsx");
    expect(src).toMatch(/Avrrio Exam Forge <span className="text-blue-300 font-bold">— DAT<\/span>/);
    expect(src).not.toMatch(/>🎯 DAT Apex</);
  });

  it("app/apex/results/page.tsx header renamed", () => {
    const src = read("app/apex/results/page.tsx");
    expect(src).toMatch(/📊 Avrrio Exam Forge Results/);
  });

  it("pattern pages' back-links renamed, without touching the /apex route they link to", () => {
    const patterns = read("app/apex/patterns/page.tsx");
    expect(patterns).toMatch(/← Exam Forge/);
    expect(patterns).toMatch(/href="\/apex"/);

    const flashcards = read("app/apex/patterns/flashcards/page.tsx");
    expect(flashcards).toMatch(/← Back to Exam Forge/);
    expect(flashcards).toMatch(/href="\/apex"/);
  });

  it("pages/index.tsx nav button, tooltip, and confirm dialog all renamed consistently", () => {
    const src = read("pages/index.tsx");
    expect(src).toMatch(/🎯 Exam Forge/);
    expect(src).toMatch(/title="Open Exam Forge"/);
    expect(src).toMatch(/Leave Reader cockpit for Exam Forge\?/);
    expect(src).toMatch(/Open Exam Forge →/);
  });

  it("components/surgeonView2/SurgeonCockpit.tsx toggle label renamed", () => {
    const src = read("components/surgeonView2/SurgeonCockpit.tsx");
    expect(src).toMatch(/>\s*Exam Forge\s*<\/button>/);
  });

  it("REQUIRED: the legacy /dat-apex redirect route itself is unchanged (only its visible text is) — external bookmarks keep working", () => {
    const src = read("pages/dat-apex.tsx");
    expect(src).toMatch(/router\.replace\("\/apex"\)/);
    expect(src).toMatch(/Redirecting to Avrrio Exam Forge…/);
  });
});
