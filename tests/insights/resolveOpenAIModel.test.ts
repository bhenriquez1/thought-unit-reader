// tests/insights/resolveOpenAIModel.test.ts
// Pure-function tests for the ranking logic behind resolveTeachingModel —
// "use the best structured-output model this account actually has, never
// assume/hardcode one that might not exist yet." pickBestModel takes the live model list as
// a plain array so this needs no network/API key to test.

import { pickBestModel, PREFERENCE_ORDER, FALLBACK_MODEL } from "../../lib/insights/resolveOpenAIModel";

describe("pickBestModel — never invents a model, only confirms live availability", () => {
  it("picks the most-preferred model present in the live list", () => {
    const live = ["gpt-4o-2024-08-06", "gpt-4-turbo", "gpt-3.5-turbo"];
    expect(pickBestModel(live)).toBe("gpt-4o-2024-08-06");
  });

  it("REQUIRED: does not select gpt-5.5 unless the live list actually confirms it", () => {
    const live = ["gpt-4o-2024-08-06", "gpt-4-turbo"];
    expect(pickBestModel(live)).not.toBe("gpt-5.5");
  });

  it("prefers the stable structured-output model over a reasoning-first model when both are live", () => {
    const live = ["gpt-5.5-2026-01-01", "gpt-4o-2024-08-06"];
    expect(pickBestModel(live)).toBe("gpt-4o-2024-08-06");
  });

  it("still selects gpt-5.5 when no preferred GPT-4 structured-output model is available", () => {
    const live = ["gpt-5.5-2026-01-01", "text-embedding-3-small"];
    expect(pickBestModel(live)).toBe("gpt-5.5-2026-01-01");
  });

  it("prefers an earlier PREFERENCE_ORDER entry over a later one when both are live", () => {
    const live = ["gpt-4.1-2025-04-14", "gpt-4o-2024-08-06"];
    expect(pickBestModel(live)).toBe("gpt-4.1-2025-04-14");
  });

  it("falls back to FALLBACK_MODEL when nothing in the live list matches any preference", () => {
    expect(pickBestModel(["text-embedding-3-small", "whisper-1"])).toBe(FALLBACK_MODEL);
  });

  it("falls back to FALLBACK_MODEL for an empty live list", () => {
    expect(pickBestModel([])).toBe(FALLBACK_MODEL);
  });

  it("matches an exact preference id, not just a dated variant", () => {
    expect(pickBestModel(["gpt-4o"])).toBe("gpt-4o");
  });

  it("does not mistake a mini/nano family variant for the preferred full model", () => {
    const live = ["gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o-2024-08-06"];
    expect(pickBestModel(live)).toBe("gpt-4o-2024-08-06");
  });

  it("excludes non-chat model variants even if they share a preferred prefix", () => {
    const live = ["gpt-4o-realtime-preview", "gpt-4o-transcribe", "gpt-4-turbo"];
    expect(pickBestModel(live)).toBe("gpt-4-turbo");
  });

  it("is deterministic — same input always produces the same output", () => {
    const live = ["gpt-4o-2024-08-06", "gpt-4-turbo"];
    expect(pickBestModel(live)).toBe(pickBestModel(live));
  });

  it("respects a custom preference order when one is passed explicitly", () => {
    const live = ["model-a", "model-b"];
    expect(pickBestModel(live, ["model-b", "model-a"])).toBe("model-b");
  });
});

describe("PREFERENCE_ORDER", () => {
  it("keeps gpt-5.5 as a fallback wishlist entry, after the bounded structured-output models", () => {
    expect(PREFERENCE_ORDER).toContain("gpt-5.5");
    expect(PREFERENCE_ORDER.indexOf("gpt-4.1")).toBeLessThan(PREFERENCE_ORDER.indexOf("gpt-5.5"));
    expect(PREFERENCE_ORDER.indexOf("gpt-4o")).toBeLessThan(PREFERENCE_ORDER.indexOf("gpt-5.5"));
  });

  it("includes the long-stable fallback model somewhere in the list", () => {
    expect(PREFERENCE_ORDER).toContain(FALLBACK_MODEL);
  });
});

describe("resolveTeachingModel — async wrapper against a mock client", () => {
  const { resolveTeachingModel, __resetModelCacheForTests } = require("../../lib/insights/resolveOpenAIModel");

  beforeEach(() => { __resetModelCacheForTests(); });

  function mockClient(data: Array<{ id: string }>) {
    return { models: { list: async () => ({ data }) } } as any;
  }

  it("resolves via the live models.list() response", async () => {
    const client = mockClient([{ id: "gpt-4o-2024-08-06" }, { id: "gpt-4-turbo" }]);
    expect(await resolveTeachingModel(client)).toBe("gpt-4o-2024-08-06");
  });

  it("falls back to FALLBACK_MODEL when models.list() throws (network/auth failure)", async () => {
    const client = { models: { list: async () => { throw new Error("network down"); } } } as any;
    expect(await resolveTeachingModel(client)).toBe(FALLBACK_MODEL);
  });

  it("never throws, even when the client is completely broken", async () => {
    const client = {} as any;
    await expect(resolveTeachingModel(client)).resolves.toBe(FALLBACK_MODEL);
  });

  it("caches the resolved model — a second call does not re-invoke models.list()", async () => {
    let calls = 0;
    const client = { models: { list: async () => { calls++; return { data: [{ id: "gpt-4o" }] }; } } } as any;
    await resolveTeachingModel(client);
    await resolveTeachingModel(client);
    expect(calls).toBe(1);
  });
});
