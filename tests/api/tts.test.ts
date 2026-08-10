// tests/api/tts.test.ts
// Regression coverage for a bug found via live browser verification of the
// Speech Engine audit's PR A/PR B (#632/#633): pages/api/tts.ts used to
// construct `new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })` at MODULE
// SCOPE. The `openai` SDK throws synchronously in its constructor when
// apiKey is empty/undefined — so on any deployment with OPENAI_API_KEY
// entirely unset, the whole module crashed before the handler's own
// graceful-degradation logic (missing/invalid key -> 200 with
// useBrowserSpeech: true) ever ran, and every /api/tts request 500'd
// instead. This directly undermined RC3 (Whiteboard fallback-on-failure)
// and RC7 (server-cleaned fallback script) from the Speech Engine audit,
// which both assume /api/tts always resolves to a real response.
//
// Fix: the OpenAI client is now constructed lazily, inside the try block,
// only once hasValidOpenAIKey has already confirmed a real key exists.

import fs from "fs";
import path from "path";

const ROUTE = path.resolve(__dirname, "../../pages/api/tts.ts");

describe("pages/api/tts.ts — OpenAI client is constructed lazily, not at module scope", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(ROUTE, "utf8"); });

  it("REQUIRED: no module-scope `const openai = new OpenAI(...)` immediately after the imports", () => {
    const importIdx = src.indexOf('import OpenAI from "openai";');
    expect(importIdx).toBeGreaterThan(-1);
    // Nothing calls `new OpenAI(` between the import and the first function
    // declaration (module scope) — it must only appear inside a function body.
    const firstFnIdx = src.indexOf("function ", importIdx);
    const moduleScopeSlice = src.slice(importIdx, firstFnIdx);
    expect(moduleScopeSlice).not.toMatch(/new OpenAI\(/);
  });

  it("REQUIRED: `new OpenAI(...)` is constructed inside the try block, after hasValidOpenAIKey has already gated this code path", () => {
    const hasValidKeyIdx = src.indexOf("const hasValidOpenAIKey =");
    const tryIdx = src.indexOf("try {", hasValidKeyIdx);
    const constructIdx = src.indexOf("new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })", tryIdx);
    expect(hasValidKeyIdx).toBeGreaterThan(-1);
    expect(tryIdx).toBeGreaterThan(hasValidKeyIdx);
    expect(constructIdx).toBeGreaterThan(tryIdx);
  });
});

describe("pages/api/tts.ts — handler behavior with OPENAI_API_KEY fully unset (behavioral, not just source-level)", () => {
  const ORIGINAL_KEY = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    jest.resetModules();
  });

  afterAll(() => {
    if (ORIGINAL_KEY !== undefined) process.env.OPENAI_API_KEY = ORIGINAL_KEY;
  });

  function mockReqRes(body: any) {
    const req: any = { method: "POST", body, headers: {} };
    const res: any = {
      statusCode: null,
      jsonBody: null,
      status(code: number) { this.statusCode = code; return this; },
      json(body: any) { this.jsonBody = body; return this; },
      setHeader() { return this; },
      end() { return this; },
    };
    return { req, res };
  }

  it("REQUIRED: importing the module with OPENAI_API_KEY unset does not throw (the historical crash happened at import time, before any request)", () => {
    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require("../../pages/api/tts");
    }).not.toThrow();
  });

  it("REQUIRED: calling the handler with no key configured returns 200 with useBrowserSpeech: true, never a 500", async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const handler = require("../../pages/api/tts").default;
    const { req, res } = mockReqRes({ script: "Hello world.", voice: "alloy", format: "mp3" });
    await expect(handler(req, res)).resolves.not.toThrow();
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toMatchObject({ useBrowserSpeech: true, provider: "browser", fallbackReason: "openai-key-missing" });
    expect(typeof res.jsonBody.script).toBe("string");
    expect(res.jsonBody.script.length).toBeGreaterThan(0);
  });

  it("REQUIRED: SOURCE_VERBATIM browser fallback returns the source script unchanged", async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const handler = require("../../pages/api/tts").default;
    const script = "e.g. A & B; Fig. 2 — exact source.";
    const { req, res } = mockReqRes({
      script,
      voice: "alloy",
      format: "mp3",
      contentRole: "SOURCE_VERBATIM",
    });

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody.script).toBe(script);
  });

  it("keeps explanatory preprocessing for Professor narration", async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const handler = require("../../pages/api/tts").default;
    const { req, res } = mockReqRes({
      script: "See Fig. 2. e.g. compare the result.",
      contentRole: "PROFESSOR_EXPLANATION",
    });

    await handler(req, res);

    expect(res.jsonBody.script).toContain("Figure 2");
    expect(res.jsonBody.script).toContain("for example");
  });
});
