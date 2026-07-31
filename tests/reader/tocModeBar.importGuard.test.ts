// tests/reader/tocModeBar.importGuard.test.ts
//
// Regression guard for the production ReferenceError: TocModeBar is not defined.
//
// Root cause: ThoughtUnitNavigator.tsx used <TocModeBar /> without importing it;
// the component existed at components/reader/TocModeBar.tsx but the import was
// absent, producing a runtime crash on every page load.
//
// This test catches the class of bug at the static-analysis layer:
//   1. The component file exists and has a default export.
//   2. ThoughtUnitNavigator explicitly imports it.
// It runs in the Node test environment (no DOM/jsdom required) and completes
// in milliseconds, making it safe to include in the standard test suite.

import fs from "fs";
import path from "path";

const READER_DIR   = path.resolve(__dirname, "../../components/reader");
const NAVIGATOR    = path.join(READER_DIR, "ThoughtUnitNavigator.tsx");
const TOC_MODE_BAR = path.join(READER_DIR, "TocModeBar.tsx");

describe("TocModeBar import guard", () => {
  it("TocModeBar.tsx exists", () => {
    expect(fs.existsSync(TOC_MODE_BAR)).toBe(true);
  });

  it("TocModeBar.tsx has a default export", () => {
    const src = fs.readFileSync(TOC_MODE_BAR, "utf8");
    expect(src).toMatch(/export default function TocModeBar/);
  });

  it("ThoughtUnitNavigator.tsx imports TocModeBar", () => {
    const src = fs.readFileSync(NAVIGATOR, "utf8");
    // Must have a static import (not just a JSX reference) so bundlers resolve it.
    expect(src).toMatch(/import TocModeBar from ["']\.\/TocModeBar["']/);
  });

  it("ThoughtUnitNavigator.tsx references <TocModeBar", () => {
    const src = fs.readFileSync(NAVIGATOR, "utf8");
    expect(src).toMatch(/<TocModeBar/);
  });
});
