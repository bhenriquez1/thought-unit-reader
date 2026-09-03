// tests/api/intelligenceSynthesisResilience.test.ts
// L11 — live-testing diagnosis from Brian: NoteLab showed "OpenAI synthesis
// failed" / "OpenAI synthesis timed out — retry to try again" / "No notes
// yet", with production logs showing repeated "429 You have no credits
// remaining." pages/api/intelligenceSynthesis.ts (both its Stage 1 fast
// path and Stage 2 full synthesis) had no request timeout, no retry, and no
// failure classification at all — unlike its sibling pages/api/notebook-
// plan.ts, which got the identical fix in an earlier phase — and every log
// line in the file was DEV-gated, so a production failure left no
// server-side trace to diagnose it by.
//
// No jsdom/render harness for this API route in this repo (see
// tests/notelab/notebookPlanRoute.test.ts's own header comment) — source
// inspection, matching this repo's established pattern.

import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.resolve(__dirname, "../../pages/api/intelligenceSynthesis.ts"), "utf8");

describe("pages/api/intelligenceSynthesis.ts — shared timeout/retry/classification infrastructure", () => {
  it("REQUIRED: wraps the OpenAI call with a request timeout via AbortController, same pattern as notebook-plan.ts/page-annotation-plan.ts", () => {
    expect(SRC).toMatch(/new AbortController\(\)/);
    expect(SRC).toMatch(/setTimeout\(\(\) => ctrl\.abort\(\), timeoutMs\)/);
    expect(SRC).toMatch(/await openai\.responses\.parse\(input, \{ signal: ctrl\.signal \}\)/);
  });

  it("REQUIRED: classifies failures into distinct stages instead of one undifferentiated 500 — including rate_limited for the observed '429 no credits' production error", () => {
    expect(SRC).toMatch(/function classifySynthesisFailure/);
    for (const stage of ["timeout", "rate_limited", "invalid_request", "provider_request", "provider_response", "schema_validation"]) {
      expect(SRC).toContain(`"${stage}"`);
    }
    expect(SRC).toMatch(/if \(err instanceof OpenAI\.APIError && err\.status === 429\) return "rate_limited";/);
  });

  it("REQUIRED: never retries a 400 invalid_request_error — retrying an identical malformed request just reproduces the same failure", () => {
    expect(SRC).toMatch(/import \{ isInvalidRequestError \} from "@\/lib\/insights\/openaiErrorClassification";/);
    const matches = SRC.match(/if \(isInvalidRequestError\(firstErr\)\) throw firstErr;/g) ?? [];
    expect(matches.length).toBe(2); // once per stage (1 and 2)
  });
});

describe("pages/api/intelligenceSynthesis.ts — Stage 1 (fast path)", () => {
  it("REQUIRED: retries once with backoff before giving up", () => {
    expect(SRC).toMatch(/\[SYNTH:stage1:retry\]/);
    const idx = SRC.indexOf('if (stage === "1") {');
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 1200);
    expect(block).toMatch(/attempts = 2;/);
    expect(block).toMatch(/await new Promise\(\(r\) => setTimeout\(r, RETRY_BACKOFF_MS\)\);/);
  });

  it("REQUIRED: a null output and a schema-validation failure are each classified distinctly, not folded into the generic upstream-failure branch", () => {
    const idx = SRC.indexOf('if (stage === "1") {');
    const nextStageIdx = SRC.indexOf("// ── Stage 2", idx);
    const block = SRC.slice(idx, nextStageIdx);
    expect(block).toMatch(/stage: "provider_response", attempts,/);
    expect(block).toMatch(/stage: "schema_validation", attempts,/);
    expect(block).toMatch(/Stage1SynthesisSchema\.parse\(s1\)/);
  });

  it("REQUIRED: failure, retry, and success diagnostics log unconditionally in production, not DEV-gated", () => {
    const idx = SRC.indexOf('if (stage === "1") {');
    const nextStageIdx = SRC.indexOf("// ── Stage 2", idx);
    const block = SRC.slice(idx, nextStageIdx);
    for (const marker of [
      'console.warn("[SYNTH:stage1:retry]"',
      'console.error("[SYNTH:stage1:failed]"',
      'console.log("[SYNTH:stage1:success]"',
    ]) {
      const markerIdx = block.indexOf(marker);
      expect(markerIdx).toBeGreaterThan(-1);
      expect(block.slice(Math.max(0, markerIdx - 20), markerIdx)).not.toMatch(/DEV\s*&&\s*$/);
    }
  });

  it("still returns HTTP 500 with an { error, code } body — the client (synthesizeStage1Output) only checks response.ok and reads err.error, so code is a purely additive diagnostic field", () => {
    const idx = SRC.indexOf('if (stage === "1") {');
    const nextStageIdx = SRC.indexOf("// ── Stage 2", idx);
    const block = SRC.slice(idx, nextStageIdx);
    expect(block).toMatch(/return res\.status\(500\)\.json\(\{ error: synthesisFailureMessage\(failureStage, "Stage 1 synthesis"\), code: failureStage \}\);/);
  });
});

describe("pages/api/intelligenceSynthesis.ts — Stage 2 (full synthesis)", () => {
  it("REQUIRED: retries once with backoff before giving up", () => {
    expect(SRC).toMatch(/\[SYNTH:stage2:retry\]/);
    const idx = SRC.indexOf("// ── Stage 2");
    expect(idx).toBeGreaterThan(-1);
    const block = SRC.slice(idx, idx + 1800);
    expect(block).toMatch(/attempts = 2;/);
    expect(block).toMatch(/await new Promise\(\(r\) => setTimeout\(r, RETRY_BACKOFF_MS\)\);/);
  });

  it("REQUIRED: a null output and a schema-validation failure are each classified distinctly", () => {
    const idx = SRC.indexOf("// ── Stage 2");
    const block = SRC.slice(idx);
    expect(block).toMatch(/stage: "provider_response", attempts,/);
    expect(block).toMatch(/stage: "schema_validation", attempts,/);
    expect(block).toMatch(/TeachingSynthesisSchema\.parse\(synthesis\)/);
  });

  it("REQUIRED: failure, retry, and success diagnostics log unconditionally in production, not DEV-gated", () => {
    const idx = SRC.indexOf("// ── Stage 2");
    const block = SRC.slice(idx);
    for (const marker of [
      'console.warn("[SYNTH:stage2:retry]"',
      'console.error("[SYNTH:stage2:failed]"',
      'console.log("[SYNTH:stage2:success]"',
    ]) {
      const markerIdx = block.indexOf(marker);
      expect(markerIdx).toBeGreaterThan(-1);
      expect(block.slice(Math.max(0, markerIdx - 20), markerIdx)).not.toMatch(/DEV\s*&&\s*$/);
    }
  });

  it("still returns HTTP 500 with an { error, code } body — the client (synthesizeStage2Output-equivalent) only checks response.ok and reads err.error", () => {
    const idx = SRC.indexOf("// ── Stage 2");
    const block = SRC.slice(idx);
    expect(block).toMatch(/return res\.status\(500\)\.json\(\{ error: synthesisFailureMessage\(failureStage, "Synthesis"\), code: failureStage \}\);/);
  });

  it("sets maxDuration: 60, unchanged — SYNTH_TIMEOUT_MS is chosen so one retry (two attempts + backoff) still fits inside it", () => {
    expect(SRC).toMatch(/maxDuration:\s*60/);
    expect(SRC).toMatch(/const SYNTH_TIMEOUT_MS\s*=\s*28_000;/);
  });
});
