// tests/reader/chiefResidentStaleness.test.ts
//
// Regression guard: changing from one page/domain to another must NOT
// allow the previous page's thesis or topic to bleed into a new Chief
// Resident session.
//
// Root cause that was fixed (PR #595): the three "Explain" handlers in
// pages/index.tsx were passing sm?.pageThesis unconditionally, so a study
// model generated for page 3 could be used on page 7 if the model had not
// yet refreshed.
//
// Fix: each handler now checks
//   const isSmFresh = sm?.pageTruthKey === pageTruthKey;
// and only forwards pageThesis when the study model is fresh for the current
// page.  canonicalEntries are mapped from the live canonicalLeftPanelUnits
// (page-scoped) and are never sourced from the study model directly.
//
// These tests are STATIC SOURCE ANALYSIS — they read the compiled TypeScript
// source and assert that the guard pattern is present at all three call
// sites.  They do not run the React component tree.

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
let stepBody: string;
let pageBody: string;
let conceptBody: string;
let askExpertBody: string;
let openExplainStepForUnitBody: string;
let openExplainItBody: string;

beforeAll(() => {
  src = fs.readFileSync(INDEX_TSX, "utf8");
  stepBody    = extractHandlerBody(src, "handleOpenChiefResidentExplainStep");
  pageBody    = extractHandlerBody(src, "handleOpenChiefResidentExplainPage");
  conceptBody = extractHandlerBody(src, "handleOpenChiefResidentExplainConcept");
  askExpertBody               = extractHandlerBody(src, "handleAskExpert");
  openExplainStepForUnitBody  = extractHandlerBody(src, "openExplainStepForThoughtUnit");
  openExplainItBody           = extractHandlerBody(src, "handleOpenExplainIt");
});

// ── Freshness guard ────────────────────────────────────────────────────────

describe("Chief Resident staleness — pageTruthKey freshness guard", () => {
  it("handleOpenChiefResidentExplainStep checks sm.pageTruthKey === pageTruthKey", () => {
    expect(stepBody).toMatch(/sm\?\.pageTruthKey\s*===\s*pageTruthKey/);
  });

  it("handleOpenChiefResidentExplainPage checks sm.pageTruthKey === pageTruthKey", () => {
    expect(pageBody).toMatch(/sm\?\.pageTruthKey\s*===\s*pageTruthKey/);
  });

  it("handleOpenChiefResidentExplainConcept checks sm.pageTruthKey === pageTruthKey", () => {
    expect(conceptBody).toMatch(/sm\?\.pageTruthKey\s*===\s*pageTruthKey/);
  });
});

// ── Conditional pageThesis ─────────────────────────────────────────────────
//
// pageThesis must only be forwarded when isSmFresh is truthy.
// An unconditional `sm?.pageThesis` assignment (without the freshness flag)
// would be the bug we fixed.

describe("Chief Resident staleness — pageThesis is gated on freshness", () => {
  it("handleOpenChiefResidentExplainStep passes pageThesis only when isSmFresh", () => {
    expect(stepBody).toMatch(/isSmFresh\s*\?\s*\(?\s*sm\?\.pageThesis/);
  });

  it("handleOpenChiefResidentExplainPage passes pageThesis only when isSmFresh", () => {
    expect(pageBody).toMatch(/isSmFresh\s*\?\s*\(?\s*sm\?\.pageThesis/);
  });

  it("handleOpenChiefResidentExplainConcept passes pageThesis only when isSmFresh", () => {
    expect(conceptBody).toMatch(/isSmFresh\s*\?\s*\(?\s*sm\?\.pageThesis/);
  });
});

// ── canonicalEntries from live panel units ─────────────────────────────────
//
// canonicalEntries must be derived from canonicalLeftPanelUnits (which is
// scoped to the current page), not directly from the study model.
// This prevents stale AI-generated anchors from crossing a page boundary.

describe("Chief Resident staleness — canonicalEntries sourced from live page units", () => {
  it("handleOpenChiefResidentExplainStep maps canonicalLeftPanelUnits into canonicalEntries", () => {
    expect(stepBody).toMatch(/canonicalEntries\s*:/);
    expect(stepBody).toMatch(/canonicalLeftPanelUnits/);
  });

  it("handleOpenChiefResidentExplainPage maps canonicalLeftPanelUnits into canonicalEntries", () => {
    expect(pageBody).toMatch(/canonicalEntries\s*:/);
    expect(pageBody).toMatch(/canonicalLeftPanelUnits/);
  });

  it("handleOpenChiefResidentExplainConcept maps canonicalLeftPanelUnits into canonicalEntries", () => {
    expect(conceptBody).toMatch(/canonicalEntries\s*:/);
    expect(conceptBody).toMatch(/canonicalLeftPanelUnits/);
  });
});

// ── Deps include pageTruthKey ──────────────────────────────────────────────
//
// pageTruthKey must appear in the useCallback deps array for each handler so
// the callbacks are recreated whenever the page changes.  A missing dep would
// mean the handler closes over a stale pageTruthKey and can never detect
// cross-page drift.

describe("Chief Resident staleness — pageTruthKey in useCallback deps", () => {
  it("handleOpenChiefResidentExplainStep deps include pageTruthKey", () => {
    expect(stepBody).toMatch(/\[.*pageTruthKey.*\]/s);
  });

  it("handleOpenChiefResidentExplainPage deps include pageTruthKey", () => {
    expect(pageBody).toMatch(/\[.*pageTruthKey.*\]/s);
  });

  it("handleOpenChiefResidentExplainConcept deps include pageTruthKey", () => {
    expect(conceptBody).toMatch(/\[.*pageTruthKey.*\]/s);
  });
});

// ── Exactly three Chief Resident handler definitions ──────────────────────
//
// Ensure no handler was accidentally merged or renamed in a way that would
// make one of the above scoped-body tests quietly pass on the wrong function.

describe("Chief Resident staleness — all three handlers exist", () => {
  it("handleOpenChiefResidentExplainStep is defined as a useCallback", () => {
    expect(src).toContain("const handleOpenChiefResidentExplainStep = useCallback");
  });

  it("handleOpenChiefResidentExplainPage is defined as a useCallback", () => {
    expect(src).toContain("const handleOpenChiefResidentExplainPage = useCallback");
  });

  it("handleOpenChiefResidentExplainConcept is defined as a useCallback", () => {
    expect(src).toContain("const handleOpenChiefResidentExplainConcept = useCallback");
  });
});

// ── Root cause: sel.selectionText survives page navigation ────────────────
//
// Confirmed root cause of a report where, on a calculus page ("Four Ways to
// Represent a Function"), Chief Resident's "Selected Text" scope explained
// insulin/glucagon/glucose regulation instead. Every OTHER piece of "current
// page" state (currentPageStudyModel, finalHighlightAnchors, ...) is cleared
// by an effect keyed on pageTruthKey — sel.selectionText (from
// usePdfSelection(), owned in pages/index.tsx) previously had no such effect.
// It only cleared AFTER being consumed by handleOpenChiefResidentExplainStep
// (sel.clearSelection() at the end of that handler), which does nothing to
// stop a selection made on an EARLIER page (e.g. a biology passage) from
// still being present the FIRST time the user clicks "Ask Chief Resident →
// Selected Text" on a LATER, unrelated page (e.g. the calculus page) —
// producing a response that is faithful to the old biology text but rendered
// under the new page's number/title, exactly matching the reported symptom.

describe("Chief Resident staleness — PDF text selection is cleared on page navigation", () => {
  it("a useEffect keyed on [pageTruthKey] calls sel.clearSelection()", () => {
    // Scoped to this fix's own marker comment rather than matching
    // sel.clearSelection() anywhere in the file, since that call also
    // legitimately appears inside the Chief Resident handlers themselves
    // (clearing AFTER use, which is necessary but not sufficient on its own).
    const resetRegionStart = src.indexOf("CRITICAL: clear the PDF text selection on every page change");
    expect(resetRegionStart).toBeGreaterThan(-1);
    const resetRegion = src.slice(resetRegionStart, resetRegionStart + 800);
    expect(resetRegion).toMatch(/useEffect\(\(\) => \{\s*\n\s*sel\.clearSelection\(\);/);
    expect(resetRegion).toMatch(/\}, \[pageTruthKey\]\);/);
  });

  it("a selection made on one page cannot silently reach a later page's Chief Resident request — narrative check", () => {
    // This test documents the exact bug scenario in a form a reviewer can verify
    // against the fix above:
    //   1. Student selects a passage on page 12 (a biology page, discussing
    //      "insulin, glucagon, and glucose regulation").
    //   2. Student navigates to page 53 (a calculus page — pageTruthKey changes).
    //   3. WITHOUT this fix: sel.selectionText still holds the page-12 biology
    //      text (nothing cleared it), so if the student clicks "Ask Chief
    //      Resident → Selected Text" on page 53, that stale biology passage is
    //      sent as the highlighted passage — Chief Resident correctly explains
    //      it, but under page 53's number/title, looking exactly like context
    //      drift onto the wrong page.
    //   4. WITH this fix: the pageTruthKey-keyed effect calls sel.clearSelection()
    //      the moment the page changes (step 2), so by the time of step 3 the
    //      "Selected Text" scope has nothing stale to send — RightPanel's own
    //      chip-enable check (selectionText.length > 0) also correctly disables
    //      that scope option until a NEW selection is made on page 53.
    const resetRegionStart = src.indexOf("CRITICAL: clear the PDF text selection on every page change");
    const resetRegion = src.slice(resetRegionStart, resetRegionStart + 800);
    expect(resetRegion).toContain("sel.clearSelection();");
  });
});

// ── Adjacent risk: legacy Explain handlers missing the same freshness guard ──
//
// handleAskExpert, openExplainStepForThoughtUnit, and handleOpenExplainIt feed
// the older ExpertBrainCard/ExplainStepChat/ExplainItChat modals via the same
// currentPageStudyModel — architecturally identical to the bug PR #595 fixed
// for the three Chief Resident handlers above, but that fix was never applied
// here. Not the reported bug's proximate cause, but the same class of defect.

describe("Chief Resident staleness — adjacent legacy handlers now carry the same freshness guard", () => {
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
