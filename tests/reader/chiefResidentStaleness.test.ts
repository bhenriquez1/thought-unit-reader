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

beforeAll(() => {
  src = fs.readFileSync(INDEX_TSX, "utf8");
  stepBody    = extractHandlerBody(src, "handleOpenChiefResidentExplainStep");
  pageBody    = extractHandlerBody(src, "handleOpenChiefResidentExplainPage");
  conceptBody = extractHandlerBody(src, "handleOpenChiefResidentExplainConcept");
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
