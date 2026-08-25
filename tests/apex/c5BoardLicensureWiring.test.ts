// tests/apex/c5BoardLicensureWiring.test.ts
// C5 (Phase 0 audit) — closes the gap the Phase 0 audit found: the exam-
// profile catalog listed "Board / Licensure" as a real, visible option since
// Product-split Phase 1, but it was `available: false` with zero
// implementation, and the generator's Exam Type picker only ever offered
// DAT/Custom as real, clickable buttons (board-licensure only ever rendered
// in the "Coming soon" list). This locks in that Board/Licensure is now a
// real, selectable third profile, and that the last DAT-only mode label
// ("Full DAT Exam", the one live mode string the earlier audit flagged as
// still not generalized) is gone.
//
// No jsdom/render harness for these App Router pages in this repo — source
// inspection, matching this repo's established pattern for React components.

import fs from "fs";
import path from "path";

function read(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, "../..", relPath), "utf8");
}

describe("lib/examEngine/profiles/profileCatalog.ts — board-licensure is real, not a placeholder", () => {
  it("REQUIRED: board-licensure entry is available", () => {
    const { EXAM_PROFILE_CATALOG } = require("@/lib/examEngine/profiles/profileCatalog");
    const entry = EXAM_PROFILE_CATALOG.find((p: { id: string }) => p.id === "board-licensure");
    expect(entry).toBeDefined();
    expect(entry.available).toBe(true);
  });

  it("mcat remains a visible 'coming soon' placeholder — C5 only implements board-licensure (course-exam followed in C6)", () => {
    const { EXAM_PROFILE_CATALOG } = require("@/lib/examEngine/profiles/profileCatalog");
    const mcat = EXAM_PROFILE_CATALOG.find((p: { id: string }) => p.id === "mcat");
    expect(mcat.available).toBe(false);
  });
});

describe("app/apex/generator/page.tsx — Board/Licensure is a real, clickable Exam Type button", () => {
  const SRC = read("app/apex/generator/page.tsx");

  it("REQUIRED: imports BOARD_LICENSURE_EXAM_PROFILE_ID and resolveProfileById", () => {
    expect(SRC).toMatch(/import \{ BOARD_LICENSURE_EXAM_PROFILE_ID \} from '@\/lib\/examEngine\/profiles\/boardLicensureProfile';/);
    expect(SRC).toMatch(/import \{ resolveProfileById \} from '@\/lib\/examEngine\/profiles\/profileRegistry';/);
  });

  it("REQUIRED: has a real onClick handler selecting the board-licensure profile", () => {
    expect(SRC).toMatch(/onClick=\{\(\) => handleProfileChange\(BOARD_LICENSURE_EXAM_PROFILE_ID\)\}/);
  });

  it("REQUIRED: the DAT and Custom Exam buttons from the original two-profile picker still exist unchanged", () => {
    expect(SRC).toMatch(/onClick=\{\(\) => handleProfileChange\('dat'\)\}/);
    expect(SRC).toMatch(/onClick=\{\(\) => handleProfileChange\(CUSTOM_EXAM_PROFILE_ID\)\}/);
  });

  it("selectedProfile now resolves through the shared registry instead of a hardcoded DAT/Custom ternary", () => {
    expect(SRC).toMatch(/const selectedProfile: ExamProfile = resolveProfileById\(examProfileId\);/);
  });
});

describe("lib/apex/bookCatalogue.ts — the last DAT-only mode label is gone", () => {
  it("REQUIRED: 'full-dat' mode's label no longer says 'Full DAT Exam'", () => {
    const SRC = read("lib/apex/bookCatalogue.ts");
    expect(SRC).not.toMatch(/Full DAT Exam/);
    expect(SRC).toMatch(/label: "Full Simulation",/);
  });

  it("the full-dat mode id itself is unchanged — routing/strictMode logic keys off this id, not the label", () => {
    const SRC = read("lib/apex/bookCatalogue.ts");
    expect(SRC).toMatch(/id: "full-dat",/);
  });
});
