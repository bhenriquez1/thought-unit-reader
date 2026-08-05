// tests/insights/openaiChatParams.test.ts
import { modelSupportsCustomSampling, buildChatCompletionTuning } from "../../lib/insights/openaiChatParams";

describe("modelSupportsCustomSampling", () => {
  it("REQUIRED: gpt-5.x models (dated or bare) do not support custom sampling — this is the exact model family the production 400 was reported against", () => {
    expect(modelSupportsCustomSampling("gpt-5.5")).toBe(false);
    expect(modelSupportsCustomSampling("gpt-5.5-2026-01-01")).toBe(false);
    expect(modelSupportsCustomSampling("gpt-5")).toBe(false);
    expect(modelSupportsCustomSampling("gpt-5.1")).toBe(false);
  });

  it("o-series reasoning models do not support custom sampling", () => {
    expect(modelSupportsCustomSampling("o1")).toBe(false);
    expect(modelSupportsCustomSampling("o1-mini")).toBe(false);
    expect(modelSupportsCustomSampling("o3")).toBe(false);
    expect(modelSupportsCustomSampling("o3-mini")).toBe(false);
    expect(modelSupportsCustomSampling("o4-mini")).toBe(false);
  });

  it("gpt-4-family models still support custom sampling — the fallback model must keep working exactly as before", () => {
    expect(modelSupportsCustomSampling("gpt-4o")).toBe(true);
    expect(modelSupportsCustomSampling("gpt-4o-2024-08-06")).toBe(true);
    expect(modelSupportsCustomSampling("gpt-4-turbo")).toBe(true);
    expect(modelSupportsCustomSampling("gpt-4.1")).toBe(true);
    expect(modelSupportsCustomSampling("gpt-4.5")).toBe(true);
  });

  it("does not false-positive on an unrelated model name that merely contains 'o1' or 'gpt-5' as a substring, not a prefix", () => {
    expect(modelSupportsCustomSampling("custom-o1-lookalike")).toBe(true);
    expect(modelSupportsCustomSampling("not-gpt-5-really")).toBe(true);
  });
});

describe("buildChatCompletionTuning", () => {
  it("REQUIRED: omits temperature entirely for a fixed-sampling model — never sends a value it will reject", () => {
    const params = buildChatCompletionTuning("gpt-5.5-2026-01-01", { temperature: 0, maxCompletionTokens: 2500 });
    expect(params).not.toHaveProperty("temperature");
    expect(params.max_completion_tokens).toBe(2500);
  });

  it("includes temperature for a model that supports custom sampling", () => {
    const params = buildChatCompletionTuning("gpt-4o", { temperature: 0.4, maxCompletionTokens: 2000 });
    expect(params.temperature).toBe(0.4);
    expect(params.max_completion_tokens).toBe(2000);
  });

  it("max_completion_tokens is never gated by model — sent for both fixed-sampling and custom-sampling models", () => {
    expect(buildChatCompletionTuning("gpt-5.5", { maxCompletionTokens: 100 }).max_completion_tokens).toBe(100);
    expect(buildChatCompletionTuning("gpt-4o", { maxCompletionTokens: 100 }).max_completion_tokens).toBe(100);
  });

  it("omits top_p/frequency_penalty/presence_penalty for a fixed-sampling model", () => {
    const params = buildChatCompletionTuning("o3-mini", {
      temperature: 0.5, topP: 0.9, frequencyPenalty: 0.2, presencePenalty: 0.2,
    });
    expect(params).toEqual({});
  });

  it("never includes a field the caller didn't ask for, even on a model that supports custom sampling", () => {
    const params = buildChatCompletionTuning("gpt-4o", { maxCompletionTokens: 500 });
    expect(params).toEqual({ max_completion_tokens: 500 });
  });
});
