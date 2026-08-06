// tests/insights/resolveVisualContext.test.ts
import { resolveVisualContext } from "../../lib/insights/resolveVisualContext";

const BASE_ARGS = {
  pageImageDataUrl: "data:image/jpeg;base64,AAAA",
  documentId: "doc-1",
  pageNumber: 5,
  pageTruthKey: "doc-1::5::t",
};

describe("resolveVisualContext — never throws, always resolves to a description or null", () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks(); });

  it("returns null immediately without calling fetch when there is no page image", async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as any;
    const result = await resolveVisualContext({ ...BASE_ARGS, pageImageDataUrl: null });
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("REQUIRED: returns the description when Gemini found real visual content", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ ok: true, hasVisualContent: true, visualDescription: "A labeled anatomical diagram of the heart." }),
    }) as any;
    const result = await resolveVisualContext(BASE_ARGS);
    expect(result).toBe("A labeled anatomical diagram of the heart.");
  });

  it("returns null when Gemini found no visual content on the page (a valid, non-error outcome)", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ ok: true, hasVisualContent: false, visualDescription: null }),
    }) as any;
    const result = await resolveVisualContext(BASE_ARGS);
    expect(result).toBeNull();
  });

  it("REQUIRED: returns null (never throws) when the API responds with ok:false (missing key, timeout, upstream failure)", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ ok: false, error: "Gemini is not configured.", code: "NOT_CONFIGURED", fallbackAllowed: true }),
    }) as any;
    const result = await resolveVisualContext(BASE_ARGS);
    expect(result).toBeNull();
  });

  it("REQUIRED: returns null (never throws) on a network error/abort", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network down")) as any;
    await expect(resolveVisualContext(BASE_ARGS)).resolves.toBeNull();
  });

  it("REQUIRED: returns null (never throws) when the response body is malformed JSON", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => { throw new Error("invalid json"); },
    }) as any;
    await expect(resolveVisualContext(BASE_ARGS)).resolves.toBeNull();
  });

  it("sends documentId/pageNumber/pageTruthKey alongside the page image, matching the server's diagnostic contract", async () => {
    const fetchSpy = jest.fn().mockResolvedValue({
      json: async () => ({ ok: true, hasVisualContent: false, visualDescription: null }),
    });
    global.fetch = fetchSpy as any;
    await resolveVisualContext(BASE_ARGS);
    expect(fetchSpy).toHaveBeenCalledWith("/api/gemini-visual", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        pageImageDataUrl: BASE_ARGS.pageImageDataUrl,
        documentId:       BASE_ARGS.documentId,
        pageNumber:       BASE_ARGS.pageNumber,
        pageTruthKey:     BASE_ARGS.pageTruthKey,
      }),
    }));
  });

  it("passes the caller's AbortSignal through, so a real page-navigation abort cancels the Gemini request too", async () => {
    const controller = new AbortController();
    const fetchSpy = jest.fn().mockResolvedValue({
      json: async () => ({ ok: true, hasVisualContent: false, visualDescription: null }),
    });
    global.fetch = fetchSpy as any;
    await resolveVisualContext({ ...BASE_ARGS, signal: controller.signal });
    const [, options] = fetchSpy.mock.calls[0];
    expect(options.signal).toBe(controller.signal);
  });
});
