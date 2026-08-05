// lib/insights/openaiChatParams.ts
// Shared parameter builder for every Chat Completions call this app makes
// against a DYNAMICALLY resolved model (see resolveOpenAIModel.ts). A
// hardcoded model (gpt-4o-class, used by most routes in this app) safely
// accepts temperature/top_p/penalty overrides — but resolveTeachingModel()
// can hand back a newer reasoning-family model (o-series, gpt-5.x), and
// those models reject ANY non-default sampling override outright:
//
//   400 Unsupported value: 'temperature' does not support 0.0 with this
//   model. Only the default (1) value is supported.
//
// (mirrors the earlier max_tokens -> max_completion_tokens fix — same root
// cause: a request built for an older model generation, sent to a newer one)
//
// Every call site that uses resolveTeachingModel() must build its request
// params through this helper instead of hardcoding temperature/top_p/
// frequency_penalty/presence_penalty directly, so this bug class can only
// ever be fixed in one place.

// Models whose Chat Completions endpoint fixes sampling at its default and
// rejects any override — confirmed in production for the gpt-5.x family;
// o-series reasoning models (o1/o3/o4) carry the same well-documented
// restriction. Matched against the RESOLVED model id (e.g.
// "gpt-5.5-2026-01-01"), not the wishlist entry, so a dated snapshot still
// matches.
const FIXED_SAMPLING_MODEL_PATTERN = /^(o[134](-|$)|gpt-5)/;

/** True if `model` accepts custom temperature/top_p/frequency_penalty/
 *  presence_penalty. False for reasoning-family models that reject any
 *  override of their fixed default. */
export function modelSupportsCustomSampling(model: string): boolean {
  return !FIXED_SAMPLING_MODEL_PATTERN.test(model);
}

export interface ChatCompletionTuning {
  /** Sent as max_completion_tokens (never the deprecated max_tokens) —
   *  supported by every model generation, never gated. */
  maxCompletionTokens?: number;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

/**
 * Builds the tuning fields of a Chat Completions request for `model`,
 * dropping temperature/top_p/frequency_penalty/presence_penalty entirely
 * when the model doesn't support overriding them — never sending a value
 * the resolved model will reject with HTTP 400. Spread the result into the
 * request body alongside model/messages/response_format.
 */
export function buildChatCompletionTuning(
  model: string,
  tuning: ChatCompletionTuning,
): Record<string, number> {
  const params: Record<string, number> = {};

  if (tuning.maxCompletionTokens !== undefined) {
    params.max_completion_tokens = tuning.maxCompletionTokens;
  }

  if (modelSupportsCustomSampling(model)) {
    if (tuning.temperature !== undefined)     params.temperature = tuning.temperature;
    if (tuning.topP !== undefined)             params.top_p = tuning.topP;
    if (tuning.frequencyPenalty !== undefined) params.frequency_penalty = tuning.frequencyPenalty;
    if (tuning.presencePenalty !== undefined)  params.presence_penalty = tuning.presencePenalty;
  }

  return params;
}
