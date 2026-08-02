// tests/api/whiteboardImageHardening.test.ts
// Regression guards for pages/api/whiteboard-image.ts:
//   - Every failure path logs unconditionally (not DEV-gated) — previously the
//     ONLY failure log for the exact 502 users saw in production was gated
//     behind `DEV &&`, meaning it never appeared in Render logs at all.
//   - Every failure path returns HTTP 200 with a structured degraded envelope
//     instead of 500/501/502 — matches the pattern established this session in
//     claudeEnrichment.ts / cohere-retrieval.ts / page-annotation-plan.ts, and
//     the client (WhiteboardPanel.tsx) already parses `data.error`/`aiDisabled`
//     regardless of HTTP status, so this is a pure improvement with no client
//     changes required.
//   - Both OpenAI calls (director + dall-e-3) and the Ideogram/SDXL fetches are
//     wrapped with an explicit timeout, so a slow upstream response degrades
//     gracefully instead of depending on an ambient platform timeout.
//   - The director (cheap gpt-4o-mini) call retries once with backoff.

import fs from "fs";
import path from "path";

const ROUTE = path.resolve(__dirname, "../../pages/api/whiteboard-image.ts");

describe("pages/api/whiteboard-image.ts — failure logging is unconditional", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(ROUTE, "utf8"); });

  it("missing OPENAI_API_KEY logs via console.error, not DEV &&", () => {
    expect(src).toMatch(/console\.error\("\[WHITEBOARD_IMAGE_UNAVAILABLE\]", \{ failureReason \}\)/);
  });

  it("Phase 1 (director) failure logs unconditionally", () => {
    const idx = src.indexOf("Phase 1 (visual teaching script) failed");
    const block = src.slice(idx, idx + 300);
    expect(block).toMatch(/console\.error\("\[WHITEBOARD_IMAGE_FAILED\]"/);
    expect(block).not.toMatch(/DEV\s*&&\s*console\.error\("\[WHITEBOARD_IMAGE_FAILED\]"/);
  });

  it("Phase 2 (image generation) failure logs unconditionally with upstream diagnostics", () => {
    const idx = src.indexOf("Phase 2 (${provider} image generation) failed");
    const block = src.slice(idx, idx + 900);
    expect(block).toMatch(/console\.error\("\[WHITEBOARD_IMAGE_FAILED\]"/);
    expect(block).not.toMatch(/DEV\s*&&\s*console\.error\("\[WHITEBOARD_IMAGE_FAILED\]"/);
    expect(block).toMatch(/httpStatus:\s*err\?\.httpStatus/);
    expect(block).toMatch(/isTimeout:\s*err\?\.name === "AbortError"/);
  });
});

describe("pages/api/whiteboard-image.ts — always 200, never 500/501/502", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(ROUTE, "utf8"); });

  it("does not return HTTP 500, 501, or 502 anywhere in the handler", () => {
    expect(src).not.toMatch(/res\.status\(500\)/);
    expect(src).not.toMatch(/res\.status\(501\)/);
    expect(src).not.toMatch(/res\.status\(502\)/);
    expect(src).not.toMatch(/status\(debug \? 200 : 5\d\d\)/);
  });

  it("every failure branch returns res.status(200)", () => {
    const failureReturns = src.match(/return res\.status\(200\)\.json\(/g) ?? [];
    // 4 failure paths (missing key, ideogram unconfigured, sdxl unconfigured,
    // phase1 failure, phase2 failure) + the success path = at least 5 total 200s.
    expect(failureReturns.length).toBeGreaterThanOrEqual(5);
  });
});

describe("pages/api/whiteboard-image.ts — explicit timeouts, not ambient platform timeout", () => {
  let src: string;
  beforeAll(() => { src = fs.readFileSync(ROUTE, "utf8"); });

  it("wraps the director (gpt-4o-mini) call with an AbortController timeout", () => {
    expect(src).toMatch(/DIRECTOR_TIMEOUT_MS/);
    expect(src).toMatch(/async function callDirector/);
    expect(src).toMatch(/new AbortController\(\)/);
  });

  it("wraps the dall-e-3 image call with an AbortController timeout", () => {
    const idx = src.indexOf("async function generateWithOpenAI");
    const block = src.slice(idx, idx + 900);
    expect(block).toMatch(/IMAGE_TIMEOUT_MS/);
    expect(block).toMatch(/signal: ctrl\.signal/);
  });

  it("wraps the Ideogram fetch with a timeout", () => {
    const idx = src.indexOf("async function generateWithIdeogram");
    const block = src.slice(idx, idx + 1200);
    expect(block).toMatch(/IMAGE_TIMEOUT_MS/);
    expect(block).toMatch(/signal: ctrl\.signal/);
  });

  it("wraps the SDXL fetch with a timeout", () => {
    const idx = src.indexOf("async function generateWithSDXL");
    const block = src.slice(idx, idx + 1600);
    expect(block).toMatch(/IMAGE_TIMEOUT_MS/);
    expect(block).toMatch(/signal: ctrl\.signal/);
  });

  it("retries the director call once with backoff (cheap gpt-4o-mini call only, not the expensive image call)", () => {
    expect(src).toMatch(/DIRECTOR_RETRY_BACKOFF_MS/);
    expect(src).toMatch(/WHITEBOARD_IMAGE_DIRECTOR_RETRY/);
  });
});
