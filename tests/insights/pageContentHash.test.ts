// tests/insights/pageContentHash.test.ts
// Pure-function tests for the content-derived integrity key used, additively
// to pageTruthKey, to reject a Surgeon Annotation response computed against
// different underlying page text than what's currently on screen.

import { computePageContentHash, normalizeForContentHash } from "../../lib/insights/pageContentHash";

describe("computePageContentHash", () => {
  it("is deterministic — identical inputs always produce the identical hash", () => {
    const a = computePageContentHash("doc-1", 5, "Glycolysis converts glucose into pyruvate.");
    const b = computePageContentHash("doc-1", 5, "Glycolysis converts glucose into pyruvate.");
    expect(a).toBe(b);
  });

  it("changes when the page text content changes", () => {
    const a = computePageContentHash("doc-1", 5, "Glycolysis converts glucose into pyruvate.");
    const b = computePageContentHash("doc-1", 5, "The Krebs cycle oxidizes acetyl-CoA.");
    expect(a).not.toBe(b);
  });

  it("changes when the page number changes, even with identical text", () => {
    const a = computePageContentHash("doc-1", 5, "Same text.");
    const b = computePageContentHash("doc-1", 6, "Same text.");
    expect(a).not.toBe(b);
  });

  it("changes when the documentId changes, even with identical text and page number", () => {
    const a = computePageContentHash("doc-1", 5, "Same text.");
    const b = computePageContentHash("doc-2", 5, "Same text.");
    expect(a).not.toBe(b);
  });

  it("is insensitive to whitespace-only differences (case + collapsed spacing)", () => {
    const a = computePageContentHash("doc-1", 5, "Glycolysis converts glucose into pyruvate.");
    const b = computePageContentHash("doc-1", 5, "GLYCOLYSIS   converts glucose\ninto   pyruvate.  ");
    expect(a).toBe(b);
  });

  it("is sensitive to a genuine word-level content difference, not just whitespace", () => {
    const a = computePageContentHash("doc-1", 5, "The mitochondria produces ATP.");
    const b = computePageContentHash("doc-1", 5, "The mitochondria produce ATP.");
    expect(a).not.toBe(b);
  });

  it("returns a stable string format (non-empty, prefixed)", () => {
    const hash = computePageContentHash("doc-1", 5, "text");
    expect(typeof hash).toBe("string");
    expect(hash.startsWith("pch_")).toBe(true);
    expect(hash.length).toBeGreaterThan(4);
  });
});

describe("normalizeForContentHash", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normalizeForContentHash("  Hello   World\n\n")).toBe("hello world");
  });
});
