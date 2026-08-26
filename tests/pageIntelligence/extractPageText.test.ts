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

describe("extractPageText — R5: OCR word bounding boxes flow through to the result", () => {
  it("REQUIRED: recognize() is called with { blocks: true } — the default output format silently discards every word's bbox even though tesseract.js computes it", async () => {
    mockRecognize.mockResolvedValueOnce({ data: { text: "Some scanned text here.", confidence: 88, blocks: [] } });
    await extractPageText({
      pageNumber: 4,
      docId: "doc-scan-blocks",
      getNativeText: async () => "",
      getPageImageDataUrl: async () => "data:image/png;base64,fakepageimage",
    });
    expect(mockRecognize).toHaveBeenCalledWith(
      "data:image/png;base64,fakepageimage",
      {},
      { blocks: true },
    );
  });

  it("REQUIRED: word bboxes from data.blocks are flattened onto the result as ocrWords, in reading order", async () => {
    mockRecognize.mockResolvedValueOnce({
      data: {
        text: "Ethanol reacts with oxygen.",
        confidence: 90,
        blocks: [
          {
            paragraphs: [
              {
                lines: [
                  {
                    words: [
                      { text: "Ethanol", bbox: { x0: 10, y0: 20, x1: 60, y1: 34 } },
                      { text: "reacts", bbox: { x0: 65, y0: 20, x1: 100, y1: 34 } },
                      { text: "with", bbox: { x0: 105, y0: 20, x1: 130, y1: 34 } },
                      { text: "oxygen.", bbox: { x0: 135, y0: 20, x1: 180, y1: 34 } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    const result = await extractPageText({
      pageNumber: 5,
      docId: "doc-scan-blocks-2",
      getNativeText: async () => "",
      getPageImageDataUrl: async () => "data:image/png;base64,fakepageimage",
    });
    expect(result.ocrWords).toEqual([
      { text: "Ethanol", bbox: { x0: 10, y0: 20, x1: 60, y1: 34 } },
      { text: "reacts", bbox: { x0: 65, y0: 20, x1: 100, y1: 34 } },
      { text: "with", bbox: { x0: 105, y0: 20, x1: 130, y1: 34 } },
      { text: "oxygen.", bbox: { x0: 135, y0: 20, x1: 180, y1: 34 } },
    ]);
  });

  it("empty/whitespace-only words and words missing a bbox are dropped, never passed through as unusable geometry", async () => {
    mockRecognize.mockResolvedValueOnce({
      data: {
        text: "Real word.",
        confidence: 80,
        blocks: [{
          paragraphs: [{
            lines: [{
              words: [
                { text: "  ", bbox: { x0: 0, y0: 0, x1: 5, y1: 5 } },
                { text: "Real", bbox: null },
                { text: "word.", bbox: { x0: 10, y0: 10, x1: 40, y1: 24 } },
              ],
            }],
          }],
        }],
      },
    });
    const result = await extractPageText({
      pageNumber: 6,
      docId: "doc-scan-blocks-3",
      getNativeText: async () => "",
      getPageImageDataUrl: async () => "data:image/png;base64,fakepageimage",
    });
    expect(result.ocrWords).toEqual([{ text: "word.", bbox: { x0: 10, y0: 10, x1: 40, y1: 24 } }]);
  });

  it("REQUIRED: a cache hit also returns ocrWords — a revisited page gets geometry back without re-running Tesseract", async () => {
    mockRecognize.mockResolvedValueOnce({
      data: {
        text: "Cached scanned text.",
        confidence: 85,
        blocks: [{
          paragraphs: [{
            lines: [{ words: [{ text: "Cached", bbox: { x0: 1, y0: 2, x1: 3, y1: 4 } }] }],
          }],
        }],
      },
    });
    const options = {
      pageNumber: 8,
      docId: "doc-scan-cache",
      getNativeText: async () => "",
      getPageImageDataUrl: async () => "data:image/png;base64,fakepageimage",
    };
    const first = await extractPageText(options);
    expect(first.ocrWords).toEqual([{ text: "Cached", bbox: { x0: 1, y0: 2, x1: 3, y1: 4 } }]);

    // Second call for the same docId/pageNumber — IDB is unavailable in this
    // sandbox (see file header), so getCachedOCR degrades to a miss and this
    // re-runs recognize() rather than truly hitting cache; either way the
    // resulting ocrWords must still be populated, never silently dropped.
    mockRecognize.mockResolvedValueOnce({
      data: {
        text: "Cached scanned text.",
        confidence: 85,
        blocks: [{
          paragraphs: [{
            lines: [{ words: [{ text: "Cached", bbox: { x0: 1, y0: 2, x1: 3, y1: 4 } }] }],
          }],
        }],
      },
    });
    const second = await extractPageText(options);
    expect(second.ocrWords).toEqual([{ text: "Cached", bbox: { x0: 1, y0: 2, x1: 3, y1: 4 } }]);
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

  // Post-merge fix — a page whose native text is well over the length
  // floor but has individual letters replaced with PDF.js's own
  // "unmapped glyph" marker characters (a broken embedded-font CMap) used
  // to be treated as perfectly usable, since the old check was purely
  // text.length-based. Codepoints are built with String.fromCodePoint
  // rather than embedded as raw literals in this file's source, for the
  // same encoding-safety reason lib/page-intelligence/extractor.ts itself
  // avoids raw literals/\u escapes.
  const WHITE_SQUARE = String.fromCodePoint(0x25a1);
  const REPLACEMENT_CHAR = String.fromCodePoint(0xfffd);
  const PRIVATE_USE_AREA_CHAR = String.fromCodePoint(0xe000);

  it(`REQUIRED: true for otherwise-long native text containing a white-square (tofu) glyph mid-word — e.g. "audio${WHITE_SQUARE}etric"`, () => {
    const corrupted = USABLE_NATIVE_TEXT.replace("multiple", `multi${WHITE_SQUARE}ple`);
    expect(corrupted.length).toBeGreaterThan(40);
    expect(shouldUseOCR(corrupted)).toBe(true);
  });

  it("REQUIRED: true for otherwise-long native text containing a Unicode replacement character", () => {
    const corrupted = USABLE_NATIVE_TEXT.replace("real", `re${REPLACEMENT_CHAR}l`);
    expect(shouldUseOCR(corrupted)).toBe(true);
  });

  it("REQUIRED: true for otherwise-long native text containing a Private Use Area glyph (common custom-font-subset corruption)", () => {
    const corrupted = USABLE_NATIVE_TEXT.replace("words", `wor${PRIVATE_USE_AREA_CHAR}ds`);
    expect(shouldUseOCR(corrupted)).toBe(true);
  });
});

describe("extractPageText — long but corrupted native text", () => {
  const WHITE_SQUARE = String.fromCodePoint(0x25a1);
  const CORRUPTED_NATIVE_TEXT = USABLE_NATIVE_TEXT.replace("multiple", `multi${WHITE_SQUARE}ple`);

  it("REQUIRED: routes to OCR instead of short-circuiting on the corrupted native text, even though it's well over the length floor", async () => {
    mockRecognize.mockResolvedValueOnce({
      data: { text: "Clean OCR text with the word multiple spelled correctly.", confidence: 88 },
    });
    const getPageImageDataUrl = jest.fn(async () => "data:image/png;base64,fakepageimage");
    const result = await extractPageText({
      pageNumber: 5,
      docId: "doc-corrupted-1",
      getNativeText: async () => CORRUPTED_NATIVE_TEXT,
      getPageImageDataUrl,
    });
    expect(getPageImageDataUrl).toHaveBeenCalledTimes(1);
    expect(result.source).toBe("ocr");
    expect(result.text).toBe("Clean OCR text with the word multiple spelled correctly.");
    expect(result.text).not.toContain(WHITE_SQUARE);
  });

  it("the corrupted native text is not merged back into the final text — nativeText.length is well above minTextLength, so shouldMergeNativeAndOCR is false and OCR output stands alone", async () => {
    mockRecognize.mockResolvedValueOnce({
      data: { text: "Pure clean OCR replacement text.", confidence: 90 },
    });
    const result = await extractPageText({
      pageNumber: 6,
      docId: "doc-corrupted-2",
      getNativeText: async () => CORRUPTED_NATIVE_TEXT,
      getPageImageDataUrl: async () => "data:image/png;base64,fakepageimage",
    });
    expect(result.text).toBe("Pure clean OCR replacement text.");
    expect(result.nativeText).toBe(CORRUPTED_NATIVE_TEXT);
  });
});
