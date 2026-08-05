// tests/insights/openaiErrorClassification.test.ts
import { APIError } from "openai";
import { isInvalidRequestError } from "../../lib/insights/openaiErrorClassification";

function apiError(status: number): APIError {
  return Object.assign(Object.create(APIError.prototype), { status, message: "boom" });
}

describe("isInvalidRequestError", () => {
  it("returns true for a 400 OpenAI.APIError (e.g. an unsupported parameter)", () => {
    expect(isInvalidRequestError(apiError(400))).toBe(true);
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
