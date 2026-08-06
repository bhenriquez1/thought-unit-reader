// lib/insights/providerStatus.ts
// Single shared source of truth for "which AI provider keys are actually
// configured in this deployment" — replaces ~6 files each doing their own
// inline `process.env.X_API_KEY` presence check with no shared visibility
// into the overall picture, and pages/api/chief-resident-status.ts (a dead,
// zero-caller, single-provider health check misleadingly named after a
// feature that actually depends on Anthropic, not OpenAI, for DAT Apex).
//
// Deliberately does NOT make a live API call to any provider — that would
// cost tokens/quota and add latency on every status check, the same
// reasoning the old chief-resident-status.ts documented. This only confirms
// a key is PRESENT, not that the provider is currently reachable; per-route
// call sites still degrade gracefully on an actual request failure exactly
// as they already do (missing key vs. unreachable provider are different
// failure modes, and only the request itself can tell them apart).

export type AIProvider = "openai" | "anthropic" | "gemini" | "cohere";

export const ALL_PROVIDERS: AIProvider[] = ["openai", "anthropic", "gemini", "cohere"];

const ENV_VAR_FOR: Record<AIProvider, string> = {
  openai:    "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  gemini:    "GEMINI_API_KEY",
  cohere:    "COHERE_API_KEY",
};

/** What each provider is actually responsible for in this app, for a
 *  human reading the status output — not used by any routing logic. */
export const PROVIDER_ROLE: Record<AIProvider, string> = {
  openai:    "Primary page-reading brain — highlights, Whiteboard, teaching synthesis",
  anthropic: "Expert-review enrichment (reads OpenAI's output, never re-reads the page) and isolated features (DAT Apex Chief Resident, Elena Mode)",
  gemini:    "Figure/diagram/table visual understanding, merged into the shared page annotation plan",
  cohere:    "Related-reading/video search-query suggestions",
};

export function isProviderConfigured(provider: AIProvider): boolean {
  const value = process.env[ENV_VAR_FOR[provider]];
  return typeof value === "string" && value.trim().length > 0;
}

export function getProviderStatus(): Record<AIProvider, boolean> {
  const status = {} as Record<AIProvider, boolean>;
  for (const provider of ALL_PROVIDERS) status[provider] = isProviderConfigured(provider);
  return status;
}

let loggedOnce = false;

/** Logs the current provider configuration exactly once per server process
 *  (idempotent — safe to call from every request handler). Never logs key
 *  values, only presence. */
export function logProviderStatusOnce(): void {
  if (loggedOnce) return;
  loggedOnce = true;
  console.log("[PROVIDER_STATUS]", getProviderStatus());
}

/** Test-only: resets the log-once guard between test cases. */
export function __resetProviderStatusLogForTests(): void {
  loggedOnce = false;
}
