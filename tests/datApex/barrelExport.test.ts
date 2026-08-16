// tests/datApex/barrelExport.test.ts
// X1 — canonicalQuestionMapper.ts was previously reachable ONLY via a
// relative import; it was absent from lib/datApex/index.ts's barrel, the
// repo's documented "import from here, not individual files" entry point.
// This proves the barrel now actually re-exports it — a real behavioral
// check (call the pure functions through the barrel import), not just a
// grep, since these functions have zero IDB/browser dependency.

import { canonicalUnitsToDatStubs, buildDatQuestionStub, buildQuestionStem, groupStubsBySection } from "@/lib/datApex";
import type { CanonicalThoughtUnit } from "@/lib/canonical/types";

function makeUnit(overrides: Partial<CanonicalThoughtUnit> = {}): CanonicalThoughtUnit {
  return {
    id: "doc-1:0:0",
    documentId: "doc-1",
    pageIndex: 0,
    unitIndex: 0,
    text: "Mitochondria are the powerhouse of the cell.",
    anchor: { pageIndex: 0, startChar: 0, endChar: 10, quote: "Mitochondria" },
    datSection: "biology",
    datTopic: "Cell Biology",
    datUnitType: "fact",
    datRelevance: 0.8,
    classificationConfidence: 0.9,
    classificationSource: "content_lexicon",
    difficulty: 0.5,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("lib/datApex barrel — canonicalQuestionMapper is reachable via `import from \"@/lib/datApex\"`", () => {
  it("REQUIRED: canonicalUnitsToDatStubs is exported and callable through the barrel", () => {
    const unit = makeUnit();
    const stubs = canonicalUnitsToDatStubs([unit]);
    expect(stubs).toHaveLength(1);
    expect(stubs[0].canonicalUnitId).toBe(unit.id);
  });

  it("buildDatQuestionStub, buildQuestionStem, groupStubsBySection are all exported through the barrel", () => {
    const unit = makeUnit();
    expect(typeof buildQuestionStem(unit)).toBe("string");
    const stub = buildDatQuestionStub(unit);
    expect(stub.datSection).toBe("biology");
    const grouped = groupStubsBySection([stub]);
    expect(grouped.get("biology")).toHaveLength(1);
  });
});
