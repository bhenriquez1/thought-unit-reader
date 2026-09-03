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

  it("REQUIRED: classifies failures into distinct stages instead of one undifferentiated 500 — including rate_limited for a genuine rate limit and insufficient_quota for the observed '429 no credits' production error", () => {
    expect(SRC).toMatch(/function classifySynthesisFailure/);
    for (const stage of ["timeout", "rate_limited", "insufficient_quota", "invalid_request", "provider_request", "provider_response", "schema_validation"]) {
      expect(SRC).toContain(`"${stage}"`);
    }
    expect(SRC).toMatch(/if \(isInsufficientQuotaError\(err\)\) return "insufficient_quota";/);
    expect(SRC).toMatch(/if \(err instanceof OpenAI\.APIError && err\.status === 429\) return "rate_limited";/);
    // insufficient_quota must be checked BEFORE the generic 429 branch, or it's dead code.
    expect(SRC.indexOf('return "insufficient_quota"')).toBeLessThan(SRC.indexOf('return "rate_limited"'));
  });

  it("REQUIRED: never retries a permanent provider error (invalid_request or insufficient_quota) — retrying an identical malformed/unpayable request just reproduces the same failure", () => {
    expect(SRC).toMatch(/import \{ isInvalidRequestError, isInsufficientQuotaError \} from "@\/lib\/insights\/openaiErrorClassification";/);
    expect(SRC).toMatch(/function isRetryableSynthesisFailure/);
    expect(SRC).toMatch(/failureStage !== "timeout" && failureStage !== "invalid_request" && failureStage !== "insufficient_quota"/);
    const matches = SRC.match(/if \(!isRetryableSynthesisFailure\(firstErr\)\) throw firstErr;/g) ?? [];
    expect(matches.length).toBe(2); // once per stage (1 and 2)
  });

  it("REQUIRED: never retries when the first attempt's own failure was a timeout — a same-size retry cannot finish before the caller has already given up", () => {
    expect(SRC).toMatch(/failureStage !== "timeout"/);
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

  it("sets maxDuration: 60, unchanged — the platform serverless limit, independent of the caller-facing per-stage timeouts", () => {
    expect(SRC).toMatch(/maxDuration:\s*60/);
  });

  it("REQUIRED: STAGE2_TIMEOUT_MS leaves margin under the caller's 20_000ms Stage 2 deadline for a single attempt", () => {
    const m = SRC.match(/const STAGE2_TIMEOUT_MS\s*=\s*(\d+)(?:_(\d+))?;/);
    expect(m).not.toBeNull();
    const value = Number(m![1] + (m![2] ?? ""));
    expect(value).toBeLessThan(20_000);
    // a retry is only attempted for FAST (non-timeout) failures — see
    // isRetryableSynthesisFailure — so a two-attempt sequence only ever
    // happens when the failing attempt returned in well under its own
    // budget, not when it consumed the full STAGE2_TIMEOUT_MS.
  });
});

describe("pages/api/intelligenceSynthesis.ts — per-stage timeouts fit under the caller's own deadlines (review follow-up)", () => {
  it("REQUIRED: STAGE1_TIMEOUT_MS leaves margin under the caller's 12_000ms Stage 1 deadline for a single attempt", () => {
    const m = SRC.match(/const STAGE1_TIMEOUT_MS\s*=\s*(\d+)(?:_(\d+))?;/);
    expect(m).not.toBeNull();
    const value = Number(m![1] + (m![2] ?? ""));
    expect(value).toBeLessThan(12_000);
  });

  it("REQUIRED: Stage 1 and Stage 2 use their own per-stage timeout, not a single shared constant", () => {
    const idx = SRC.indexOf('if (stage === "1") {');
    const nextStageIdx = SRC.indexOf("// ── Stage 2", idx);
    const stage1Block = SRC.slice(idx, nextStageIdx);
    const stage2Block = SRC.slice(nextStageIdx);
    expect(stage1Block).toMatch(/callSynthesis\(s1Input, STAGE1_TIMEOUT_MS\)/);
    expect(stage2Block).toMatch(/callSynthesis\(s2Input, STAGE2_TIMEOUT_MS\)/);
    expect(SRC).not.toMatch(/SYNTH_TIMEOUT_MS/);
  });
});
