// lib/insights/openaiErrorClassification.ts
// Shared classification for OpenAI Chat Completions errors, used by both
// pages/api/page-annotation-plan.ts and pages/api/professor-lesson-plan.ts's
// retry-once logic.
//
// A 400 (invalid_request_error) means the REQUEST ITSELF is malformed for the
// resolved model — e.g. a parameter that model doesn't accept. Retrying an
// identical request against the same model just reproduces the identical
// failure a second time; it never resolves a config/parameter bug, and it
// masks the real problem behind a misleading "retry" log line. Only genuinely
// transient failures (timeouts, network errors, 429 rate limits, 5xx) are
// worth a retry.

import OpenAI from "openai";

export function isInvalidRequestError(err: unknown): boolean {
  return err instanceof OpenAI.APIError && err.status === 400;
}
