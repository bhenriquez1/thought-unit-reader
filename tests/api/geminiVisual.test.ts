// tests/api/geminiVisual.test.ts
// Regression guards for pages/api/gemini-visual.ts — the real implementation
// replacing the previous stub (which checked GEMINI_API_KEY, returned
// {ok:true} unconditionally if present, and had a literal
// "// TODO: implement Gemini call here" — i.e. it never actually called
// Gemini). Mirrors the degrade-not-throw / structured-envelope pattern
// established for pages/api/page-annotation-plan.ts and
// pages/api/professor-lesson-plan.ts, with a narrower scope: this is a
// best-effort, purely additive enrichment step, never a blocking dependency.

import fs from "fs";
import path from "path";

const ROUTE = path.resolve(__dirname, "../../pages/api/gemini-visual.ts");

describe("pages/api/gemini-visual.ts — a real implementation, not the stub", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(ROUTE, "utf8"); });

  it("REQUIRED: actually calls the Gemini SDK — the old stub never did", () => {
    expect(src).not.toMatch(/TODO: implement Gemini call here/);
    expect(src).toMatch(/import \{ GoogleGenAI \} from "@google\/genai"/);
    expect(src).toMatch(/client\.models\.generateContent\(/);
  });

  it("only accepts POST", () => {
    expect(src).toMatch(/if \(req\.method !== "POST"\)/);
  });

  it("requires pageImageDataUrl on the request body", () => {
    expect(src).toMatch(/missing_page_image/);
  });

  it("rejects a pageImageDataUrl that isn't a valid data: URL, distinctly from a missing one", () => {
    expect(src).toMatch(/invalid_page_image/);
    expect(src).toMatch(/function parseDataUrl/);
  });

  it("sends the page image as inlineData with its real mimeType, not assumed to always be JPEG", () => {
    const idx = src.indexOf("inlineData: { mimeType: image.mimeType, data: image.data } }");
    expect(idx).toBeGreaterThan(-1);
  });

  it("REQUIRED: missing GEMINI_API_KEY returns HTTP 200 with a degraded envelope, never a hard error — this is an OPTIONAL provider", () => {
    const idx = src.indexOf("if (!apiKey) {");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 500);
    expect(block).toMatch(/res\.status\(200\)\.json\(degraded\(/);
    expect(block).toMatch(/"NOT_CONFIGURED"/);
  });

  it("the missing-key log is DEV-gated (unlike the required-provider routes) — logging it unconditionally would spam production logs every time an optional provider is simply unset", () => {
    const idx = src.indexOf("if (!apiKey) {");
    const block = src.slice(idx, idx + 500);
    expect(block).toMatch(/process\.env\.NODE_ENV === "development"/);
  });

  it("wraps the Gemini call with a request timeout via AbortController, and passes the signal to the SDK", () => {
    expect(src).toMatch(/new AbortController\(\)/);
    expect(src).toMatch(/setTimeout\(\(\) => ctrl\.abort\(\), VISUAL_TIMEOUT_MS\)/);
    expect(src).toMatch(/abortSignal:\s*ctrl\.signal,/);
  });

  it("does NOT retry — this is a best-effort, bounded-latency enrichment step, not a required pipeline stage", () => {
    expect(src).not.toMatch(/RETRY_BACKOFF_MS/);
    expect(src).not.toMatch(/attempt/i);
  });

  it("distinguishes a timeout from a generic upstream failure in both the code and the message", () => {
    expect(src).toMatch(/"TIMEOUT"/);
    expect(src).toMatch(/isTimeout \? "Gemini timed out\." : "Gemini is temporarily unavailable\."/);
  });

  it("parses the response through GeminiVisualOutputSchema (Zod), not trusted as raw JSON", () => {
    expect(src).toMatch(/GeminiVisualOutputSchema\.safeParse\(parsed\)/);
    expect(src).toMatch(/hasVisualContent:\s*z\.boolean\(\)/);
  });

  it("REQUIRED: visualDescription is forced to null when hasVisualContent is false — never a stray description for a page with no real visual content", () => {
    const idx = src.indexOf("res.status(200).json({\n      ok: true,");
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 250);
    expect(block).toMatch(/visualDescription:\s*result\.data\.hasVisualContent \? result\.data\.visualDescription : null,/);
  });

  it("returns the structured degraded envelope on every failure path, never a bare error", () => {
    expect(src).toMatch(/ok:\s*false,\s*error:\s*message,\s*code/);
    expect(src).toMatch(/fallbackAllowed:\s*true/);
  });

  it("uses a configurable model with a documented default, not silently hardcoded with no override", () => {
    expect(src).toMatch(/const DEFAULT_MODEL = "gemini-2\.0-flash";/);
    expect(src).toMatch(/process\.env\.GEMINI_MODEL \|\| DEFAULT_MODEL/);
  });

  it("logs diagnostics via the shared requestDiagnostics helpers, hashing documentId — never the raw id or the image/description text", () => {
    expect(src).toMatch(/import \{ hashDocumentId, newRequestId \} from "@\/lib\/insights\/requestDiagnostics"/);
    expect(src).toMatch(/documentIdHash:\s*body\?\.documentId \? hashDocumentId\(body\.documentId\) : null,/);
    // Only the .length of visualDescription may appear near a console call —
    // the raw string value itself must never be passed to console.*.
    expect(src).not.toMatch(/visualDescription,\n/); // a bare `visualDescription,` object-shorthand log line
    expect(src).not.toMatch(/console\.(log|error|warn)\([^)]*pageImageDataUrl/);
  });

  it("the success log carries only booleans/counts/timing, never the description text itself", () => {
    const idx = src.indexOf('console.log("[GEMINI_VISUAL_OK]"');
    expect(idx).toBeGreaterThan(-1);
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/hasVisualContent:\s*result\.data\.hasVisualContent,/);
    expect(block).toMatch(/descriptionLength:\s*result\.data\.visualDescription\?\.length \?\? 0,/);
    expect(block).not.toMatch(/visualDescription:\s*result\.data\.visualDescription,/);
  });

  it("keeps GEMINI_API_KEY server-side only", () => {
    expect(src).not.toMatch(/NEXT_PUBLIC_GEMINI_API_KEY/);
    expect(src).toMatch(/process\.env\.GEMINI_API_KEY/);
  });

  it("prompt explicitly forbids inventing a description when the page has no real visual content", () => {
    expect(src).toMatch(/Do not invent a description for a\s*\n?\s*page that doesn't have one/);
  });

  it("prompt explicitly forbids transcribing body text — that's handled by a separate text-reading pass", () => {
    expect(src).toMatch(/Never transcribe body text/);
  });

  it("documents that this endpoint is never called directly by any downstream consumer (Highlights/Whiteboard/RightPanel) — only merged into the shared plan", () => {
    expect(src).toMatch(/never proposes highlights, never plans the\s*\n\/\/ Whiteboard/);
  });
});
