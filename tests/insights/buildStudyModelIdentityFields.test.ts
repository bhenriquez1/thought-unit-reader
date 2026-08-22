// tests/insights/buildStudyModelIdentityFields.test.ts
// P0 stabilization, Tier 4 — Page Thesis formalization. buildStudyModel() now
// carries an explicit documentId (the resolved, collision-resistant identity
// — bookId stays filename-derived and unchanged), an optional confidence
// value, and supportingAnnotationIds (the visualAnchors that ground
// pageThesis specifically). All three are additive: every existing call
// without the new 6th `identity` argument keeps working exactly as before.
//
// Real behavioral tests against the actual exported function — buildStudyModel
// has no React/DOM/network dependency, matching this repo's convention for
// pure functions (see this file's sibling currentPageStudyModel tests).

import { buildStudyModel, type CurrentPageStudyModel } from "../../lib/insights/currentPageStudyModel";

const BASE_VIEW = {
  title: "Buffer Systems",
  coreIdea: "Buffer solutions resist changes in pH by neutralizing added acid or base.",
  blocks: [
    { title: "Mechanism", pattern: "Weak acid/conjugate base pair", surgicalReason: "Neutralizes excess H+", trap: "Assuming unlimited capacity", rule: "Henderson-Hasselbalch" },
  ],
  miniTest: ["What happens when the weak acid is fully consumed?"],
};

describe("buildStudyModel — documentId (Tier 4)", () => {
  it("REQUIRED: defaults documentId to bookId when no identity arg is passed — every pre-existing call site keeps working unchanged", () => {
    const model = buildStudyModel(BASE_VIEW, {}, "my-book.pdf", 4, "universal");
    expect(model.documentId).toBe("my-book.pdf");
    expect(model.bookId).toBe("my-book.pdf");
  });

  it("REQUIRED: uses identity.documentId when provided, without touching bookId", () => {
    const model = buildStudyModel(BASE_VIEW, {}, "my-book.pdf", 4, "universal", {
      documentId: "resolved-doc-abc123",
    });
    expect(model.documentId).toBe("resolved-doc-abc123");
    expect(model.bookId).toBe("my-book.pdf"); // unchanged — bookId is still filename-derived display/grouping metadata
  });
});

describe("buildStudyModel — confidence (Tier 4)", () => {
  it("REQUIRED: confidence is undefined when no identity arg is passed", () => {
    const model = buildStudyModel(BASE_VIEW, {}, "book", 1, "universal");
    expect(model.confidence).toBeUndefined();
  });

  it("REQUIRED: carries identity.confidence through unchanged", () => {
    const model = buildStudyModel(BASE_VIEW, {}, "book", 1, "universal", { confidence: 0.82 });
    expect(model.confidence).toBe(0.82);
  });
});

describe("buildStudyModel — supportingAnnotationIds (Tier 4)", () => {
  it("REQUIRED: is always present (never undefined) — an array, empty when there's no pageThesis-sourced anchor", () => {
    const model = buildStudyModel({ blocks: [], miniTest: [] }, {}, "book", 1, "universal");
    expect(Array.isArray(model.supportingAnnotationIds)).toBe(true);
  });

  it("REQUIRED: contains exactly the visualAnchors.id values whose sourceField is \"pageThesis\", nothing else", () => {
    const model = buildStudyModel(BASE_VIEW, {}, "book", 1, "universal");
    const thesisAnchors = model.visualAnchors.filter((a) => a.sourceField === "pageThesis");
    expect(model.supportingAnnotationIds).toEqual(thesisAnchors.map((a) => a.id));
    // Sanity: every id we listed really does trace back to a pageThesis anchor —
    // and nothing with a DIFFERENT sourceField leaked in.
    for (const id of model.supportingAnnotationIds) {
      const anchor = model.visualAnchors.find((a) => a.id === id);
      expect(anchor?.sourceField).toBe("pageThesis");
    }
  });

  it("is empty when the heuristic view has no coreIdea/title to seed a thesis anchor from", () => {
    const model = buildStudyModel({ blocks: [], miniTest: [] }, {}, "book", 1, "universal");
    expect(model.supportingAnnotationIds).toEqual([]);
  });
});

describe("buildStudyModel — backward compatibility (Tier 4)", () => {
  it("REQUIRED: a call with exactly the pre-Tier-4 5-argument signature still type-checks and behaves identically aside from the 3 new fields", () => {
    const model: CurrentPageStudyModel = buildStudyModel(BASE_VIEW, {}, "book", 7, "universal");
    expect(model.page).toBe(7);
    expect(model.bookId).toBe("book");
    expect(model.pageThesis).toContain("Buffer solutions resist changes in pH");
  });
});
