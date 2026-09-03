// tests/insights/openaiErrorClassification.test.ts
import { APIError } from "openai";
import { isInvalidRequestError, isInsufficientQuotaError } from "../../lib/insights/openaiErrorClassification";

function apiError(status: number, code?: string | null): APIError {
  return Object.assign(Object.create(APIError.prototype), { status, code: code ?? null, message: "boom" });
}

describe("isInvalidRequestError", () => {
  it("returns true for a 400 OpenAI.APIError (e.g. an unsupported parameter)", () => {
    expect(isInvalidRequestError(apiError(400))).toBe(true);
  });

  // L11 review finding (PR #759): a bad/missing key, a key lacking model
  // permission, an unknown model, or a semantically-invalid-but-well-formed
  // request are exactly as non-retryable as a 400 — retrying reproduces the
  // identical failure every one of these callers previously masked behind a
  // misleading "retry" log line.
  it("returns true for 401/403/404/422 — permanent request/account errors, not transient upstream hiccups", () => {
    expect(isInvalidRequestError(apiError(401))).toBe(true);
    expect(isInvalidRequestError(apiError(403))).toBe(true);
    expect(isInvalidRequestError(apiError(404))).toBe(true);
    expect(isInvalidRequestError(apiError(422))).toBe(true);
  });

  it("returns false for a 429 (rate limit) — that IS worth retrying", () => {
    expect(isInvalidRequestError(apiError(429))).toBe(false);
  });

  it("returns false for a 500/503 (transient upstream failure) — that IS worth retrying", () => {
    expect(isInvalidRequestError(apiError(500))).toBe(false);
    expect(isInvalidRequestError(apiError(503))).toBe(false);
  });

  it("returns false for a plain network/timeout error (not an OpenAI.APIError at all)", () => {
    expect(isInvalidRequestError(new Error("aborted"))).toBe(false);
  });

  it("returns false for non-error values", () => {
    expect(isInvalidRequestError(null)).toBe(false);
    expect(isInvalidRequestError(undefined)).toBe(false);
  });
});

describe("isInsufficientQuotaError", () => {
  it("returns true for a 429 whose code is insufficient_quota — the observed '429 You have no credits remaining' production error", () => {
    expect(isInsufficientQuotaError(apiError(429, "insufficient_quota"))).toBe(true);
  });

  it("returns false for a generic 429 rate limit (no code, or a different code) — that one IS worth retrying", () => {
    expect(isInsufficientQuotaError(apiError(429))).toBe(false);
    expect(isInsufficientQuotaError(apiError(429, "rate_limit_exceeded"))).toBe(false);
  });

  it("returns false for a non-429 APIError even with a matching code", () => {
    expect(isInsufficientQuotaError(apiError(400, "insufficient_quota"))).toBe(false);
  });

  it("returns false for non-APIError and non-error values", () => {
    expect(isInsufficientQuotaError(new Error("boom"))).toBe(false);
    expect(isInsufficientQuotaError(null)).toBe(false);
    expect(isInsufficientQuotaError(undefined)).toBe(false);
  });
});
