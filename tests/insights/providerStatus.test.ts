// tests/insights/providerStatus.test.ts
import {
  isProviderConfigured, getProviderStatus, logProviderStatusOnce,
  __resetProviderStatusLogForTests, ALL_PROVIDERS, PROVIDER_ROLE,
} from "../../lib/insights/providerStatus";

const ENV_VARS = {
  openai: "OPENAI_API_KEY",
  claude: "CLAUDE_API_KEY",
  gemini: "GEMINI_API_KEY",
  cohere: "COHERE_API_KEY",
  tldraw: "NEXT_PUBLIC_TLDRAW_LICENSE_KEY",
} as const;

describe("isProviderConfigured / getProviderStatus", () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("REQUIRED: reports true only when the env var is present and non-empty", () => {
    delete process.env.OPENAI_API_KEY;
    expect(isProviderConfigured("openai")).toBe(false);
    process.env.OPENAI_API_KEY = "";
    expect(isProviderConfigured("openai")).toBe(false);
    process.env.OPENAI_API_KEY = "   ";
    expect(isProviderConfigured("openai")).toBe(false);
    process.env.OPENAI_API_KEY = "sk-real-key";
    expect(isProviderConfigured("openai")).toBe(true);
  });

  it("checks each provider against its own distinct env var", () => {
    for (const [provider, envVar] of Object.entries(ENV_VARS) as Array<[keyof typeof ENV_VARS, string]>) {
      for (const other of Object.values(ENV_VARS)) delete process.env[other];
      process.env[envVar] = "configured";
      expect(isProviderConfigured(provider)).toBe(true);
      for (const p of ALL_PROVIDERS) {
        if (p !== provider) expect(isProviderConfigured(p)).toBe(false);
      }
    }
  });

  it("getProviderStatus reports all 5 providers, keyed by name", () => {
    process.env.OPENAI_API_KEY = "x";
    delete process.env.CLAUDE_API_KEY;
    process.env.GEMINI_API_KEY = "x";
    delete process.env.COHERE_API_KEY;
    delete process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY;
    expect(getProviderStatus()).toEqual({ openai: true, claude: false, gemini: true, cohere: false, tldraw: false });
  });

  it("REQUIRED: uses CLAUDE_API_KEY, not the retired ANTHROPIC_API_KEY name — renamed for a consistent CLAUDE_/OPENAI_/GEMINI_/COHERE_ provider-name convention", () => {
    delete process.env.CLAUDE_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-ant-still-set-under-the-old-name";
    expect(isProviderConfigured("claude")).toBe(false);
    delete process.env.ANTHROPIC_API_KEY;
    process.env.CLAUDE_API_KEY = "sk-ant-under-the-new-name";
    expect(isProviderConfigured("claude")).toBe(true);
  });

  it("REQUIRED: never accepts a mixed-case alias of the canonical env var name — process.env lookups are case-sensitive by construction, and this module must not work around that with its own fallback matching", () => {
    delete process.env.COHERE_API_KEY;
    process.env.Cohere_API_Key = "sk-wrong-casing";
    process.env.cohere_api_key = "sk-also-wrong-casing";
    expect(isProviderConfigured("cohere")).toBe(false);

    delete process.env.GEMINI_API_KEY;
    process.env.Gemini_API_Key = "sk-wrong-casing";
    expect(isProviderConfigured("gemini")).toBe(false);

    // Cleanup — these aren't real env vars this suite otherwise touches.
    delete process.env.Cohere_API_Key;
    delete process.env.cohere_api_key;
    delete process.env.Gemini_API_Key;
  });
});

describe("ALL_PROVIDERS / PROVIDER_ROLE", () => {
  it("PROVIDER_ROLE documents every provider in ALL_PROVIDERS, no more, no less", () => {
    expect(Object.keys(PROVIDER_ROLE).sort()).toEqual([...ALL_PROVIDERS].sort());
  });

  it("every role description is a non-empty string", () => {
    for (const provider of ALL_PROVIDERS) {
      expect(typeof PROVIDER_ROLE[provider]).toBe("string");
      expect(PROVIDER_ROLE[provider].length).toBeGreaterThan(0);
    }
  });
});

describe("logProviderStatusOnce", () => {
  beforeEach(() => { __resetProviderStatusLogForTests(); });

  it("REQUIRED: logs only once even across multiple calls (idempotent per process)", () => {
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    logProviderStatusOnce();
    logProviderStatusOnce();
    logProviderStatusOnce();
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("logs under the [PROVIDER_STATUS] tag with the status object, never a raw key value", () => {
    process.env.OPENAI_API_KEY = "sk-super-secret-value";
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    logProviderStatusOnce();
    expect(spy).toHaveBeenCalledWith("[PROVIDER_STATUS]", expect.any(Object));
    const loggedArgs = spy.mock.calls[0];
    expect(JSON.stringify(loggedArgs)).not.toContain("sk-super-secret-value");
    spy.mockRestore();
  });
});
