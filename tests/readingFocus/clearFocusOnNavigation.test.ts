// tests/readingFocus/clearFocusOnNavigation.test.ts
// Stabilization fix #3 — wires the ALREADY-EXISTING, already-unit-tested
// readingFocusStore.clearFocus() (see readingFocusStore.test.ts) into page
// navigation. clearFocus()'s own doc comment ("Clear all focus state (e.g.
// on page/book change)") documented this exact call site, but no code in
// the app ever called it — a previous page's eye-follow word marker and
// playbackState could survive into a new page until the next speech tick
// happened to overwrite it, rather than clearing immediately on navigation.
//
// Static source analysis, matching the established convention for
// "clear stale state on page change" effects in pages/index.tsx (see
// tests/reader/chiefResidentStaleness.test.ts) — this repo's jest config has
// no jsdom/React Testing Library, so component-tree tests aren't how these
// effects get regression coverage.

import fs from "fs";
import path from "path";

const INDEX_TSX = path.resolve(__dirname, "../../pages/index.tsx");

describe("pages/index.tsx — clearFocus() fires on every page-identity change", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(INDEX_TSX, "utf8"); });

  it("REQUIRED: a useEffect keyed on [pageTruthKey] calls useReadingFocusStore.getState().clearFocus()", () => {
    const idx = src.indexOf("CRITICAL: clear the Reading Focus Engine's eye-follow/word-sync state");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 1500);
    expect(block).toMatch(/useEffect\(\(\) => \{\s*\n\s*useReadingFocusStore\.getState\(\)\.clearFocus\(\);/);
    expect(block).toMatch(/\}, \[pageTruthKey\]\);/);
  });

  it("useReadingFocusStore is imported from the canonical store module", () => {
    expect(src).toMatch(/import \{ useReadingFocusStore \} from "@\/lib\/readingFocus\/readingFocusStore";/);
  });

  it("this effect is distinct from (not a duplicate of) the PDF-selection-clear effect that already exists for the same [pageTruthKey] dependency", () => {
    const clearFocusIdx = src.indexOf("useReadingFocusStore.getState().clearFocus();");
    const clearSelectionIdx = src.indexOf("sel.clearSelection();");
    expect(clearFocusIdx).toBeGreaterThan(-1);
    expect(clearSelectionIdx).toBeGreaterThan(-1);
    expect(clearFocusIdx).not.toBe(clearSelectionIdx);
  });
});
