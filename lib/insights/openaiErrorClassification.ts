// lib/insights/openaiErrorClassification.ts
// Shared classification for OpenAI Chat/Responses API errors, used by the
// retry-once logic in pages/api/page-annotation-plan.ts,
// pages/api/professor-lesson-plan.ts, pages/api/notebook-plan.ts, and
// pages/api/intelligenceSynthesis.ts.
//
// A 4xx in NON_RETRYABLE_STATUSES means the REQUEST ITSELF, or the account's
// standing, is the problem — not a transient upstream hiccup. Retrying an
// identical request just reproduces the identical failure a second time; it
// masks the real problem behind a misleading "retry" log line. Only
// genuinely transient failures (timeouts, network errors, real rate limits,
// 5xx) are worth a retry.
//   400 Bad Request           — malformed request (e.g. an unsupported param)
//   401 Unauthorized          — bad/missing API key
//   403 Forbidden             — key lacks permission for this model/endpoint
//   404 Not Found             — unknown model/resource
//   422 Unprocessable Entity  — well-formed but semantically invalid request
// (L11 review finding — this used to check only 400; 401/403/404/422 are
// exactly as non-retryable, and every caller above benefits from the fix.)

import OpenAI from "openai";

const NON_RETRYABLE_STATUSES = new Set([400, 401, 403, 404, 422]);

export function isInvalidRequestError(err: unknown): boolean {
  return err instanceof OpenAI.APIError && typeof err.status === "number" && NON_RETRYABLE_STATUSES.has(err.status);
}

// A 429 can mean two very different things: a genuinely transient rate limit
// (worth a short-backoff retry) or an exhausted/insufficient billing quota
// (permanent until the account is topped up — retrying just reproduces the
// identical failure, and "try again shortly" is actively misleading advice
// for it). OpenAI's error body carries this distinction in `code`.
export function isInsufficientQuotaError(err: unknown): boolean {
  return err instanceof OpenAI.APIError && err.status === 429 && err.code === "insufficient_quota";
}
