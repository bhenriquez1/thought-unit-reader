// tests/reader/chiefResidentStaleness.test.ts
//
// Regression guard: changing from one page/domain to another must NOT
// allow the previous page's thesis or topic to bleed into a new Chief
// Resident session.
//
// Original root cause fixed here (PR #595): the three "Explain" handlers in
// pages/index.tsx were passing sm?.pageThesis unconditionally into a
// captured ChiefResidentContext snapshot, so a study model generated for
// page 3 could be used on page 7 if the model had not yet refreshed.
//
// A later pass deleted that entire snapshot mechanism: the three handlers,
// ChiefResidentContext, and components/reader/ChiefResidentModal.tsx are
// all gone (see tests/reader/chiefResidentConsolidation.test.ts). Reader's
// Chief Resident now opens ChiefResidentModalShell with LIVE props
// (currentPageStudyModel, pageText, pageTruthKey — read directly off
// pages/index.tsx's own state on every render), so the specific staleness
// bug this file was written to catch — a value snapshotted at click time
// going stale before it's sent — cannot recur by construction: there is no
// more snapshot to go stale. This file now covers only the OTHER Chief-
// Resident-adjacent staleness risks that are unaffected by that change,
// plus the OTHER legacy Explain handlers that carry the same class of
// defect PR #595 originally fixed.
//
// These tests are STATIC SOURCE ANALYSIS — they read the compiled TypeScript
// source and assert that the guard pattern is present at the relevant call
// sites. They do not run the React component tree.

import fs from "fs";
import path from "path";

const INDEX_TSX = path.resolve(__dirname, "../../pages/index.tsx");

// Extract the function body of each handler so assertions are scoped to the
// right call site (avoids false positives from other uses of the same tokens).
function extractHandlerBody(src: string, handlerName: string): string {
  const start = src.indexOf(`const ${handlerName} = useCallback`);
  if (start < 0) throw new Error(`Handler not found: ${handlerName}`);
  // Walk forward to find the matching closing paren of useCallback(...)
  let depth = 0;
  let i = start + `const ${handlerName} = useCallback`.length;
  // Find the opening paren of useCallback
  while (i < src.length && src[i] !== "(") i++;
  const callbackOpen = i;
  depth = 0;
  for (i = callbackOpen; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")") {
      depth--;
      if (depth === 0) break;
    }
  }
  return src.slice(start, i + 1);
}

let src: string;
let askExpertBody: string;
let openExplainStepForUnitBody: string;
let openExplainItBody: string;

beforeAll(() => {
  src = fs.readFileSync(INDEX_TSX, "utf8");
  askExpertBody               = extractHandlerBody(src, "handleAskExpert");
  openExplainStepForUnitBody  = extractHandlerBody(src, "openExplainStepForThoughtUnit");
  openExplainItBody           = extractHandlerBody(src, "handleOpenExplainIt");
});

// ── Chief Resident's old snapshot-staleness mechanism is gone ──────────────

describe("Chief Resident staleness — the old click-time snapshot mechanism no longer exists", () => {
  it("no handleOpenChiefResidentExplain* handler remains", () => {
    expect(src).not.toMatch(/handleOpenChiefResidentExplainStep/);
    expect(src).not.toMatch(/handleOpenChiefResidentExplainPage/);
    expect(src).not.toMatch(/handleOpenChiefResidentExplainConcept/);
  });

  it("ChiefResidentModalShell receives currentPageStudyModel and pageTruthKey as live props — nothing is captured/frozen at click time to go stale", () => {
    const idx = src.indexOf("<ChiefResidentModalShell");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 700);
    expect(block).toMatch(/studyModel=\{currentPageStudyModel\}/);
    expect(block).toMatch(/pageTruthKey=\{pageTruthKey\}/);
  });
});

// ── Adjacent risk: legacy Explain handlers carry the same freshness guard ──
//
// handleAskExpert, openExplainStepForThoughtUnit, and handleOpenExplainIt feed
// the older ExpertBrainCard/ExplainStepChat/ExplainItChat modals via the same
// currentPageStudyModel — architecturally identical to the bug PR #595 fixed
// for the (now-deleted) three Chief Resident handlers. Unrelated to and
// unaffected by the Chief Resident consolidation.

describe("Chief Resident staleness — adjacent legacy handlers carry the same freshness guard", () => {
  it("handleAskExpert checks sm.pageTruthKey === pageTruthKey and gates pageThesis on it", () => {
    expect(askExpertBody).toMatch(/sm\?\.pageTruthKey\s*===\s*pageTruthKey/);
    expect(askExpertBody).toMatch(/isSmFresh\s*\?\s*\(?\s*sm\?\.pageThesis/);
  });

  it("openExplainStepForThoughtUnit checks both sm freshness AND that detail.pageNumber matches currentPage", () => {
    expect(openExplainStepForUnitBody).toMatch(/sm\?\.pageTruthKey\s*===\s*pageTruthKey/);
    expect(openExplainStepForUnitBody).toMatch(/detail\.pageNumber\s*===\s*currentPage/);
    expect(openExplainStepForUnitBody).toMatch(/isSmFresh\s*\?\s*\(?\s*sm\?\.pageThesis/);
  });

  it("handleOpenExplainIt checks sm.pageTruthKey === pageTruthKey and gates pageThesis on it", () => {
    expect(openExplainItBody).toMatch(/sm\?\.pageTruthKey\s*===\s*pageTruthKey/);
    expect(openExplainItBody).toMatch(/isSmFresh\s*\?\s*\(?\s*sm\?\.pageThesis/);
  });

  it("all three legacy handlers include pageTruthKey in their useCallback deps", () => {
    expect(askExpertBody).toMatch(/\[.*pageTruthKey.*\]/s);
    expect(openExplainStepForUnitBody).toMatch(/\[.*pageTruthKey.*\]/s);
    expect(openExplainItBody).toMatch(/\[.*pageTruthKey.*\]/s);
  });
});

// ── Root cause: sel.selectionText survives page navigation ────────────────
//
// Still relevant: sel.selectionText/sel.clearSelection() has several
// consumers beyond the deleted Chief Resident handlers (handleAskExpert,
// the PDF context menu's hasSelection check, RightPanel's selectionText
// prop, etc.) — this effect protects all of them, not just Chief Resident.

describe("Chief Resident staleness — PDF text selection is cleared on page navigation", () => {
  it("a useEffect keyed on [pageTruthKey] calls sel.clearSelection()", () => {
    const resetRegionStart = src.indexOf("CRITICAL: clear the PDF text selection on every page change");
    expect(resetRegionStart).toBeGreaterThan(-1);
    const resetRegion = src.slice(resetRegionStart, resetRegionStart + 800);
    expect(resetRegion).toMatch(/useEffect\(\(\) => \{\s*\n\s*sel\.clearSelection\(\);/);
    expect(resetRegion).toMatch(/\}, \[pageTruthKey\]\);/);
  });
});

// ── Root cause: explainItContext survives page navigation ─────────────────
//
// chiefResidentContext no longer exists (see above), so the effect that
// used to null both chiefResidentContext and explainItContext together now
// only needs to null explainItContext — ExplainItChat is a separate,
// unrelated feature (hits /api/explainIt, not /api/chief-resident-teaching)
// that still captures its context at open time and still needs this guard.

describe("Explain It staleness — explainItContext closes on page navigation", () => {
  it("a useEffect keyed on [pageTruthKey] nulls explainItContext", () => {
    const idx = src.indexOf("setExplainItContext(null);");
    expect(idx).toBeGreaterThan(-1);
    const before = src.slice(Math.max(0, idx - 300), idx);
    expect(before).toMatch(/useEffect\(\(\) => \{\s*$/);
  });

  it("no longer also nulls a chiefResidentContext — that state doesn't exist anymore", () => {
    expect(src).not.toMatch(/setChiefResidentContext\(null\)/);
  });
});

// ── Root cause: canonicalLeftPanelUnits built from a stale currentPageStudyModel ──
//
// Unaffected by the Chief Resident consolidation — canonicalLeftPanelUnits
// still feeds the left panel / ThoughtUnitNavigator via its own pipeline.

describe("canonicalLeftPanelUnits — stale currentPageStudyModel guard", () => {
  it("the producing effect only trusts currentPageStudyModel when its .page AND .bookId match the current ones", () => {
    const idx = src.indexOf("useEffect(() => {\n    const pageText = pageTextByPage.get(`${bookId}:${currentPage}`) || \"\";\n    // Guard against a stale currentPageStudyModel");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 4000);
    expect(block).toMatch(/currentPageStudyModel\.page === currentPage/);
    // REQUIRED: page-number equality alone is not enough — a document switch
    // that happens to land on the same page number must not let the OLD
    // document's study model through. This is the exact class of bug a
    // nearby comment documents as a real prior incident (a chemistry page's
    // Chief Resident request answering about cell signaling instead).
    expect(block).toMatch(/currentPageStudyModel\.bookId === bookId/);
    expect(block).toMatch(/studyModel:\s*freshStudyModel/);
    expect(block).toMatch(/\}, \[bookId, currentPage, currentPageStudyModel, pageTextByPage, sharedPresetId\]\);/);
  });

  it("a stale model (wrong page OR wrong document) falls back to null (buildCanonicalLeftPanelUnits' own page-text fallback), not the wrong subject's visualAnchors", () => {
    const idx = src.indexOf("const freshStudyModel = (!currentPageStudyModel || (currentPageStudyModel.page === currentPage && currentPageStudyModel.bookId === bookId))");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 200);
    expect(block).toMatch(/\?\s*currentPageStudyModel\s*\n\s*:\s*null;/);
  });

  it("REQUIRED: the clear-stale-synthesis-state effect resets on bookId change too, not just currentPage — a document switch landing on the same page number must still clear the previous document's units", () => {
    const idx = src.indexOf("// Clear stale synthesis state immediately when the user navigates to a new");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 800);
    expect(block).toMatch(/setCurrentPageStudyModel\(null\);/);
    expect(block).toMatch(/setCanonicalLeftPanelUnits\(\[\]\);/);
    expect(block).toMatch(/\}, \[bookId, currentPage\]\);/);
  });
});
