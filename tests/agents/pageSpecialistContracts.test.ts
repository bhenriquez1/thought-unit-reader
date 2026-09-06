import { createCurrentPageTruth } from "../../lib/context/currentPageTruth";
import { isSpecialistResultCurrent, routePageSpecialist } from "../../lib/agents/pageSpecialistContracts";

const truth = createCurrentPageTruth({
  documentId: "doc-a", bookId: "same-name", pageNumber: 2,
  pageText: "Grounded source", textReady: true,
});

describe("page specialist coordinator", () => {
  it.each(["professor", "whiteboard-artist", "chief-resident", "highlight"] as const)(
    "routes %s through the same identity",
    (specialist) => {
      const envelope = routePageSpecialist(specialist, truth, { task: "test" });
      expect(envelope.identity.documentId).toBe("doc-a");
      expect(envelope.identity.pageTruthKey).toBe("doc-a::2::t");
    },
  );

  it("rejects a late result when same slot has different text", () => {
    const result = routePageSpecialist("professor", truth, {});
    const changed = createCurrentPageTruth({
      documentId: "doc-a", bookId: "same-name", pageNumber: 2,
      pageText: "Changed extraction", textReady: true,
    });
    expect(isSpecialistResultCurrent(result, changed)).toBe(false);
  });

  it("keeps same-named documents distinct", () => {
    const result = routePageSpecialist("highlight", truth, {});
    const other = createCurrentPageTruth({
      documentId: "doc-b", bookId: "same-name", pageNumber: 2,
      pageText: "Grounded source", textReady: true,
    });
    expect(isSpecialistResultCurrent(result, other)).toBe(false);
  });
});
