import { createCurrentPageTruth, matchesCurrentPageTruth } from "../../lib/context/currentPageTruth";

const base = {
  documentId: "sha256-document-a",
  bookId: "Textbook",
  pageNumber: 7,
  pageText: "A grounded page about cellular respiration.",
  textReady: true,
};

describe("CurrentPageTruth", () => {
  it("builds and freezes one canonical page identity", () => {
    const truth = createCurrentPageTruth(base);
    expect(truth.pageTruthKey).toBe("sha256-document-a::7::t");
    expect(truth.pageContentHash).toMatch(/^pch_/);
    expect(Object.isFrozen(truth)).toBe(true);
  });

  it("rejects a pageTruthKey made from a filename or different document", () => {
    expect(() => createCurrentPageTruth({ ...base, pageTruthKey: "Textbook::7::t" })).toThrow(/identity mismatch/);
  });

  it("rejects canonical units from another page", () => {
    expect(() => createCurrentPageTruth({
      ...base,
      canonicalUnits: [{ id: "u1", text: "wrong page", page: 8 }],
    })).toThrow(/belongs to page 8/);
  });

  it("detects changed content even in the same page slot", () => {
    const first = createCurrentPageTruth(base);
    const second = createCurrentPageTruth({ ...base, pageText: "Different extraction." });
    expect(matchesCurrentPageTruth(first, second)).toBe(false);
  });
});
