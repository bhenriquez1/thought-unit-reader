// tests/apex/testLabRename.test.ts
// Product-split Phase 1, item 3 — visible product copy renamed to "Avrrio
// TestLab" (superseding "Avrrio Exam Forge" from the prior X1 rename),
// while internal routes (/apex, /dat-apex) and component/file/directory
// names are left untouched — only what a user actually reads on screen
// changes, same discipline the original X1 rename used (see git history —
// this file replaces the retired tests/apex/examForgeRename.test.ts).

import fs from "fs";
import path from "path";

function read(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../..", relPath), "utf8");
}

describe("TestLab rename — visible copy only, URL stays /apex", () => {
  it("REQUIRED: app/apex/page.tsx dashboard header reads 'Avrrio TestLab — DAT'", () => {
    const src = read("app/apex/page.tsx");
    expect(src).toMatch(/Avrrio TestLab <span className="text-blue-300 font-bold">— DAT<\/span>/);
    expect(src).not.toMatch(/Avrrio Exam Forge/);
  });

  it("app/apex/results/page.tsx header renamed", () => {
    const src = read("app/apex/results/page.tsx");
    expect(src).toMatch(/📊 Avrrio TestLab Results/);
  });

  it("pattern pages' back-links renamed, without touching the /apex route they link to", () => {
    const patterns = read("app/apex/patterns/page.tsx");
    expect(patterns).toMatch(/← TestLab/);
    expect(patterns).toMatch(/href="\/apex"/);

    const flashcards = read("app/apex/patterns/flashcards/page.tsx");
    expect(flashcards).toMatch(/← Back to TestLab/);
    expect(flashcards).toMatch(/href="\/apex"/);
  });

  it("pages/index.tsx nav button, tooltip, confirm dialog, and the Practice Exams card all renamed consistently", () => {
    const src = read("pages/index.tsx");
    expect(src).toMatch(/🎯 TestLab/);
    expect(src).toMatch(/title="Open Avrrio TestLab"/);
    expect(src).toMatch(/Leave Reader cockpit for TestLab\?/);
    expect(src).toMatch(/Open TestLab →/);
    expect(src).toMatch(/Avrrio TestLab — Practice Exams/);
    expect(src).not.toMatch(/Exam Forge/);
  });

  it("components/surgeonView2/SurgeonCockpit.tsx toggle label renamed (dead code, but kept internally consistent)", () => {
    const src = read("components/surgeonView2/SurgeonCockpit.tsx");
    expect(src).toMatch(/>\s*TestLab\s*<\/button>/);
  });

  it("REQUIRED: the legacy /dat-apex redirect route itself is unchanged (only its visible text is) — external bookmarks keep working", () => {
    const src = read("pages/dat-apex.tsx");
    expect(src).toMatch(/router\.replace\("\/apex"\)/);
    expect(src).toMatch(/Redirecting to Avrrio TestLab…/);
  });

  it("REQUIRED: internal naming (files, directories, types, stores) stays 'apex'/'DAT Apex' — no renamed imports or route paths", () => {
    // The route tree itself is untouched — confirmed by every href/router.push
    // above still targeting /apex. Spot-check that the internal lib/store
    // directory names referenced from the dashboard weren't touched either.
    const src = read("app/apex/page.tsx");
    expect(src).toMatch(/from "@\/lib\/stores\/apexEngineStore"/);
    expect(src).toMatch(/from "@\/lib\/datApex\/activeBlueprint"/);
  });
});
