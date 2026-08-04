// tests/reader/chiefResidentContextBuilder.test.ts
// Tests for lib/reader/chiefResidentContextBuilder.ts
//
// buildCanonicalContext() and its dedicated tests were removed here: it was
// dead code even before the #611 consolidation (ChiefResidentModal.tsx called
// it but discarded the result — see PR #611's description), and #611 dropped
// the discarded call entirely. It had zero production callers left. Prompt/
// context assembly now lives solely in lib/reader/buildChiefResidentContext.ts
// (see tests/reader/buildChiefResidentContext.test.ts and
// tests/reader/chiefResidentConsolidation.test.ts).

import {
  toCanonicalUnitInputs,
  type CanonicalUnitSummary,
} from "../../lib/reader/chiefResidentContextBuilder";

describe("toCanonicalUnitInputs", () => {
  it("filters out entries with empty text", () => {
    const entries: CanonicalUnitSummary[] = [
      { id: "a", text: "valid" },
      { id: "b", text: "" },
      { id: "c", text: "   " },
    ];
    const result = toCanonicalUnitInputs(entries);
    expect(result.length).toBe(1);
    expect(result[0].text).toBe("valid");
  });

  it("strips the id field from output", () => {
    const entries: CanonicalUnitSummary[] = [{ id: "myid", text: "hello" }];
    const result = toCanonicalUnitInputs(entries);
    expect("id" in result[0]).toBe(false);
  });

  it("preserves canonicalType, importanceScore, priorityTier, title, page", () => {
    const entry: CanonicalUnitSummary = {
      id: "x",
      text: "text",
      canonicalType: "definition",
      importanceScore: 75,
      priorityTier: 4,
      title: "My Title",
      page: 7,
    };
    const [out] = toCanonicalUnitInputs([entry]);
    expect(out.canonicalType).toBe("definition");
    expect(out.importanceScore).toBe(75);
    expect(out.priorityTier).toBe(4);
    expect(out.title).toBe("My Title");
    expect(out.page).toBe(7);
  });

  it("trims whitespace from text", () => {
    const entry: CanonicalUnitSummary = { id: "x", text: "  hello world  " };
    const [out] = toCanonicalUnitInputs([entry]);
    expect(out.text).toBe("hello world");
  });
});
