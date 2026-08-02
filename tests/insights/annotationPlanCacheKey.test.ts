// tests/insights/annotationPlanCacheKey.test.ts
// Unit tests for lib/insights/annotationPlanCache.ts

import {
  buildAnnotationCacheKey,
  isAnnotationPlanFresh,
  STRUCTURE_VERSION,
  PARAGRAPH_ALGORITHM_VERSION,
  SEMANTIC_PACK_VERSION,
} from "../../lib/insights/annotationPlanCache";

// ── buildAnnotationCacheKey ───────────────────────────────────────────────────

describe("buildAnnotationCacheKey", () => {
  it("includes the book id and page index", () => {
    const key = buildAnnotationCacheKey({ bookId: "book-xyz", pageIndex: 5 });
    expect(key).toContain("book-xyz");
    expect(key).toContain("p5");
  });

  it("includes all three version numbers", () => {
    const key = buildAnnotationCacheKey({ bookId: "b", pageIndex: 1 });
    expect(key).toContain(`${STRUCTURE_VERSION}`);
    expect(key).toContain(`${PARAGRAPH_ALGORITHM_VERSION}`);
    expect(key).toContain(`${SEMANTIC_PACK_VERSION}`);
  });

  it("includes semantic pack id when provided", () => {
    const key = buildAnnotationCacheKey({ bookId: "b", pageIndex: 1, semanticPackId: "dentistry" });
    expect(key).toContain("dentistry");
  });

  it("omits pack suffix when no semanticPackId provided", () => {
    const keyWithout = buildAnnotationCacheKey({ bookId: "b", pageIndex: 1 });
    const keyWith    = buildAnnotationCacheKey({ bookId: "b", pageIndex: 1, semanticPackId: "dentistry" });
    expect(keyWith).not.toBe(keyWithout);
  });

  it("produces different keys for different pages", () => {
    const k1 = buildAnnotationCacheKey({ bookId: "b", pageIndex: 1 });
    const k2 = buildAnnotationCacheKey({ bookId: "b", pageIndex: 2 });
    expect(k1).not.toBe(k2);
  });

  it("produces different keys for different books", () => {
    const k1 = buildAnnotationCacheKey({ bookId: "book-a", pageIndex: 1 });
    const k2 = buildAnnotationCacheKey({ bookId: "book-b", pageIndex: 1 });
    expect(k1).not.toBe(k2);
  });

  it("key starts with aplan: prefix", () => {
    const key = buildAnnotationCacheKey({ bookId: "b", pageIndex: 1 });
    expect(key).toMatch(/^aplan:/);
  });
});

// ── isAnnotationPlanFresh ────────────────────────────────────────────────────

describe("isAnnotationPlanFresh", () => {
  const params = {
    cachedPlanPtk:       "doc-abc::3::t",
    currentPageTruthKey: "doc-abc::3::t",
    cachedCacheKey:      "aplan:v1-1-1:book-xyz:p3",
    currentCacheKey:     "aplan:v1-1-1:book-xyz:p3",
  };

  it("returns true when both keys match", () => {
    expect(isAnnotationPlanFresh(params)).toBe(true);
  });

  it("returns false when pageTruthKey has changed (page navigation)", () => {
    expect(isAnnotationPlanFresh({
      ...params,
      currentPageTruthKey: "doc-abc::4::t",
    })).toBe(false);
  });

  it("returns false when cacheKey has changed (version bump)", () => {
    expect(isAnnotationPlanFresh({
      ...params,
      currentCacheKey: "aplan:v2-1-1:book-xyz:p3",
    })).toBe(false);
  });

  it("returns false when document changes (new book loaded)", () => {
    expect(isAnnotationPlanFresh({
      ...params,
      currentPageTruthKey: "doc-NEW::3::t",
      currentCacheKey:     "aplan:v1-1-1:book-NEW:p3",
    })).toBe(false);
  });

  it("returns false when pageTruthKey not-yet-ready (::f)", () => {
    // Text has not yet been extracted — plan built before text was ready is stale
    expect(isAnnotationPlanFresh({
      ...params,
      cachedPlanPtk:       "doc-abc::3::f",
      currentPageTruthKey: "doc-abc::3::t",
    })).toBe(false);
  });
});

// ── Version constants are positive integers ────────────────────────────────────

describe("version constants", () => {
  it("STRUCTURE_VERSION is a positive integer", () => {
    expect(Number.isInteger(STRUCTURE_VERSION)).toBe(true);
    expect(STRUCTURE_VERSION).toBeGreaterThanOrEqual(1);
  });

  it("PARAGRAPH_ALGORITHM_VERSION is a positive integer", () => {
    expect(Number.isInteger(PARAGRAPH_ALGORITHM_VERSION)).toBe(true);
    expect(PARAGRAPH_ALGORITHM_VERSION).toBeGreaterThanOrEqual(1);
  });

  it("SEMANTIC_PACK_VERSION is a positive integer", () => {
    expect(Number.isInteger(SEMANTIC_PACK_VERSION)).toBe(true);
    expect(SEMANTIC_PACK_VERSION).toBeGreaterThanOrEqual(1);
  });
});
