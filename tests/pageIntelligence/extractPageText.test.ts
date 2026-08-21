// tests/pageIntelligence/extractPageText.test.ts
// Stabilization fix — OCR wired into the actual Reader extraction path.
// Real behavioral tests against the actual exported extractPageText(),
// mocking only tesseract.js. This repo's jest config runs
// testEnvironment:"node" with no IndexedDB polyfill (see e.g.
// tests/canonical/surgeonAnnotationPlanStore.test.ts's header comment) —
// getCachedOCR/cacheOCR both wrap their idb-keyval calls in try/catch and
// gracefully degrade to a cache miss/no-op here, which is exercised for
// real (not mocked away), matching this sandbox's actual runtime behavior.

const mockRecognize = jest.fn();
jest.mock("tesseract.js", () => ({
  createWorker: jest.fn(async () => ({ recognize: mockRecognize })),
}));

import { extractPageText, shouldUseOCR } from "../../lib/page-intelligence/extractor";

const USABLE_NATIVE_TEXT =
  "A completely normal paragraph of real prose. It contains multiple sentences " +
  "with real words. This page is definitely not scanned, and the native PDF text " +
  "layer works perfectly for extracting its content. There is nothing wrong with " +
  "this page at all, and it should never need OCR to read it properly.";

describe("extractPageText — normal PDF text path", () => {
  it("REQUIRED: usable native text short-circuits before any OCR image render is requested", async () => {
    const getPageImageDataUrl = jest.fn(async () => "data:image/png;base64,unused");
    const result = await extractPageText({
      pageNumber: 3,
      docId: "doc-1",
      getNativeText: async () => USABLE_NATIVE_TEXT,
      getPageImageDataUrl,
    });
    expect(result.source).toBe("native");
    expect(result.text).toBe(USABLE_NATIVE_TEXT);
    expect(getPageImageDataUrl).not.toHaveBeenCalled();
  });

  it("does not OCR a normal text PDF unnecessarily, even with ocrEnabled left at its default (true)", async () => {
    const getPageImageDataUrl = jest.fn();
    await extractPageText({
      pageNumber: 1,
      docId: "doc-1",
      getNativeText: async () => USABLE_NATIVE_TEXT,
      getPageImageDataUrl,
    });
    expect(getPageImageDataUrl).not.toHaveBeenCalled();
  });

  it("REQUIRED: page identity is preserved on the returned result — pageNumber always matches what was requested", async () => {
    const result = await extractPageText({
      pageNumber: 42,
      docId: "doc-1",
      getNativeText: async () => USABLE_NATIVE_TEXT,
      getPageImageDataUrl: async () => "unused",
    });
    expect(result.pageNumber).toBe(42);
  });
});

describe("extractPageText — scanned/image-only page", () => {
  it("REQUIRED: near-empty native text triggers OCR, which supplies the page text", async () => {
    mockRecognize.mockResolvedValueOnce({
      data: { text: "Recognized scanned page text, plenty of real words here.", confidence: 91 },
    });
    const getPageImageDataUrl = jest.fn(async () => "data:image/png;base64,fakepageimage");
    const result = await extractPageText({
      pageNumber: 7,
      docId: "doc-scan-1",
      getNativeText: async () => "",
      getPageImageDataUrl,
    });
    expect(getPageImageDataUrl).toHaveBeenCalledTimes(1);
    expect(result.source).toBe("ocr");
    expect(result.text).toContain("Recognized scanned page text");
    expect(result.confidence).toBe(91);
    expect(result.pageNumber).toBe(7);
  });
});

describe("extractPageText — OCR failure", () => {
  it("REQUIRED: recognition throwing degrades gracefully — empty result, never throws", async () => {
    mockRecognize.mockRejectedValueOnce(new Error("tesseract crashed"));
    await expect(
      extractPageText({
        pageNumber: 9,
        docId: "doc-scan-2",
        getNativeText: async () => "",
        getPageImageDataUrl: async () => "data:image/png;base64,fakepageimage",
      }),
    ).resolves.toEqual(
      expect.objectContaining({ text: "", confidence: 0, pageNumber: 9 }),
    );
  });

  it("a failing page-image render (not just OCR itself) also degrades gracefully rather than throwing", async () => {
    await expect(
      extractPageText({
        pageNumber: 11,
        docId: "doc-scan-3",
        getNativeText: async () => "",
        getPageImageDataUrl: async () => { throw new Error("canvas render failed"); },
      }),
    ).resolves.toEqual(
      expect.objectContaining({ text: "", confidence: 0 }),
    );
  });
});

describe("shouldUseOCR", () => {
  it("true for empty/near-empty native text", () => {
    expect(shouldUseOCR("")).toBe(true);
    expect(shouldUseOCR("   ")).toBe(true);
    expect(shouldUseOCR("short")).toBe(true);
  });

  it("false for usable native text", () => {
    expect(shouldUseOCR(USABLE_NATIVE_TEXT)).toBe(false);
  });
});
