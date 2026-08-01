// tests/reader/tocModeBar.importGuard.test.ts
//
// Originally: guard against a ReferenceError where TocModeBar was used without
// being imported in ThoughtUnitNavigator.
//
// Updated (stabilization sprint): TocModeBar and ReaderModeBar were intentionally
// removed from ThoughtUnitNavigator as part of the left-panel simplification —
// the panel now always renders one adaptive Student Guide instead of offering
// Standard / Learning / Concept mode switches.
//
// This test now guards the opposite: that neither mode-switch component creeps
// back into ThoughtUnitNavigator without a deliberate decision.

import fs from "fs";
import path from "path";

const READER_DIR   = path.resolve(__dirname, "../../components/reader");
const NAVIGATOR    = path.join(READER_DIR, "ThoughtUnitNavigator.tsx");
const TOC_MODE_BAR = path.join(READER_DIR, "TocModeBar.tsx");
const READER_MODE_BAR = path.join(READER_DIR, "ReaderModeBar.tsx");

describe("Left-panel mode-bar removal guard", () => {
  it("TocModeBar.tsx still exists as a standalone component", () => {
    // The file is kept — it may be useful outside ThoughtUnitNavigator in future.
    expect(fs.existsSync(TOC_MODE_BAR)).toBe(true);
  });

  it("ReaderModeBar.tsx still exists as a standalone component", () => {
    expect(fs.existsSync(READER_MODE_BAR)).toBe(true);
  });

  it("ThoughtUnitNavigator does NOT import TocModeBar (intentional removal)", () => {
    const src = fs.readFileSync(NAVIGATOR, "utf8");
    expect(src).not.toMatch(/import TocModeBar from/);
  });

  it("ThoughtUnitNavigator does NOT render <TocModeBar (intentional removal)", () => {
    const src = fs.readFileSync(NAVIGATOR, "utf8");
    expect(src).not.toMatch(/<TocModeBar/);
  });

  it("ThoughtUnitNavigator does NOT import ReaderModeBar (intentional removal)", () => {
    const src = fs.readFileSync(NAVIGATOR, "utf8");
    expect(src).not.toMatch(/import ReaderModeBar from/);
  });

  it("ThoughtUnitNavigator does NOT render <ReaderModeBar (intentional removal)", () => {
    const src = fs.readFileSync(NAVIGATOR, "utf8");
    expect(src).not.toMatch(/<ReaderModeBar/);
  });

  it("ThoughtUnitNavigator renders LEARNING_BUCKETS directly (adaptive Student Guide)", () => {
    const src = fs.readFileSync(NAVIGATOR, "utf8");
    expect(src).toMatch(/LEARNING_BUCKETS/);
    expect(src).toMatch(/renderLearningGroups/);
  });
});
