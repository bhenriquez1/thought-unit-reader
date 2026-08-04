// tests/api/chiefResidentTeachingContext.test.ts
// Unit tests for pages/api/chief-resident-teaching.ts's buildUserContext().
//
// Root cause fixed: canonicalUnits used to REPLACE sourceText entirely
// whenever any were present (`canonicalUnits.length > 0 ? buildCanonicalBlock
// (...) : rawBlock`). components/reader/ChiefResidentModal.tsx (the Reader's
// Chief Resident) always sends canonicalUnits, so the model would see ONLY a
// handful of ungrounded anchor strings — canonicalUnits carry no guarantee
// they're grounded to the actual page, unlike sourceText — plus the book's
// filename as "Document:", with ZERO real page text as a check. Confirmed
// root cause of a report where a chemistry page's Chief Resident answered
// about glycolysis/Krebs cycle instead (components/notelab/ChiefResidentPanel.tsx,
// which never sends canonicalUnits, stayed correct on the same book/page).
//
// Fix: canonicalUnits now AUGMENT sourceText, never replace it.

import { buildUserContext, type ChiefResidentRequest, type CanonicalUnitInput } from "../../pages/api/chief-resident-teaching";

function makeRequest(overrides: Partial<ChiefResidentRequest> = {}): ChiefResidentRequest {
  return {
    mode:       "explain-page",
    sourceText: "Dalton based his conclusions about atoms on chemical observations made in the laboratory.",
    messages:   [],
    ...overrides,
  };
}

const WRONG_SUBJECT_UNITS: CanonicalUnitInput[] = [
  { text: "Glycolysis converts glucose into pyruvate.", canonicalType: "mechanism" },
  { text: "The Krebs cycle oxidizes acetyl-CoA.", canonicalType: "mechanism" },
];

describe("buildUserContext — sourceText is never discarded when canonicalUnits are present", () => {
  it("includes sourceText even when canonicalUnits is a non-empty array", () => {
    const ctx = buildUserContext(makeRequest({ canonicalUnits: WRONG_SUBJECT_UNITS }));
    expect(ctx).toContain("Dalton based his conclusions about atoms");
  });

  it("REGRESSION GUARD: real page content survives even when canonicalUnits describe a completely different subject", () => {
    // This is the exact reported scenario: a chemistry page's sourceText, with
    // canonicalUnits that (due to an upstream ungrounded-visualAnchors bug)
    // describe biology instead. The model must still see the real page text.
    const ctx = buildUserContext(makeRequest({
      sourceText: "Page thesis: John Dalton's atomic theory. Scanning tunneling microscopy revealed individual atoms for the first time.",
      canonicalUnits: WRONG_SUBJECT_UNITS,
    }));
    expect(ctx).toContain("Dalton's atomic theory");
    expect(ctx).toContain("Scanning tunneling microscopy");
  });

  it("also includes the canonicalUnits block (augmentation, not exclusion)", () => {
    const ctx = buildUserContext(makeRequest({ canonicalUnits: WRONG_SUBJECT_UNITS }));
    expect(ctx).toContain("SEMANTIC UNITS");
    expect(ctx).toContain("Glycolysis converts glucose into pyruvate.");
  });

  it("instructs the model to defer to sourceText over canonicalUnits if they conflict", () => {
    const ctx = buildUserContext(makeRequest({ canonicalUnits: WRONG_SUBJECT_UNITS }));
    expect(ctx).toMatch(/defer to the page content above if they conflict/i);
  });

  it("canonicalUnits block appears AFTER the sourceText block, not before", () => {
    const ctx = buildUserContext(makeRequest({ canonicalUnits: WRONG_SUBJECT_UNITS }));
    const sourceIdx    = ctx.indexOf("Dalton based his conclusions");
    const canonicalIdx = ctx.indexOf("SEMANTIC UNITS");
    expect(sourceIdx).toBeGreaterThan(-1);
    expect(canonicalIdx).toBeGreaterThan(sourceIdx);
  });
});

describe("buildUserContext — behavior without canonicalUnits (NoteLab's path)", () => {
  it("renders sourceText alone when canonicalUnits is absent", () => {
    const ctx = buildUserContext(makeRequest());
    expect(ctx).toContain("Dalton based his conclusions about atoms");
    expect(ctx).not.toContain("SEMANTIC UNITS");
  });

  it("renders sourceText alone when canonicalUnits is an empty array", () => {
    const ctx = buildUserContext(makeRequest({ canonicalUnits: [] }));
    expect(ctx).toContain("Dalton based his conclusions about atoms");
    expect(ctx).not.toContain("SEMANTIC UNITS");
  });
});

describe("buildUserContext — explain-text mode still surfaces the highlighted passage", () => {
  it("includes the selected passage ahead of the content block", () => {
    const ctx = buildUserContext(makeRequest({
      mode: "explain-text",
      selectedText: "particles with opposite charge attract",
      canonicalUnits: WRONG_SUBJECT_UNITS,
    }));
    expect(ctx).toContain("HIGHLIGHTED PASSAGE");
    expect(ctx).toContain("particles with opposite charge attract");
    const passageIdx = ctx.indexOf("HIGHLIGHTED PASSAGE");
    const sourceIdx   = ctx.indexOf("Dalton based his conclusions");
    expect(passageIdx).toBeLessThan(sourceIdx);
  });
});

describe("buildUserContext — header includes page number (documented as model-visible)", () => {
  it("renders Page: N when pageNumber is provided", () => {
    const ctx = buildUserContext(makeRequest({ pageNumber: 42 }));
    expect(ctx).toContain("Page: 42");
  });

  it("renders Document title when provided", () => {
    const ctx = buildUserContext(makeRequest({ title: "General Chemistry" }));
    expect(ctx).toContain('Document: "General Chemistry"');
  });
});
