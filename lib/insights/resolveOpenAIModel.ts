// lib/insights/resolveOpenAIModel.ts
// Resolves which OpenAI chat model to use by asking the organization's own
// /v1/models endpoint what it actually has access to, instead of hardcoding
// a model id that may not exist (or may not yet exist) for this account.
// PREFERENCE_ORDER is a wishlist, most-capable-first — a candidate is only
// ever selected if the live list confirms the account actually has it.
//
// Falls back to FALLBACK_MODEL (a long-stable, universally-available model)
// on any failure — missing key, network error, empty/malformed list — so a
// models.list() outage never blocks page generation.

import type OpenAI from "openai";

const DEV = process.env.NODE_ENV === "development";

/** Most-capable-first wishlist. A prefix match against the live model list
 *  (e.g. "gpt-4o" matches a live id of "gpt-4o-2024-08-06") counts as
 *  confirmed availability. Update this list as new models ship — never
 *  invent a match, only prefer earlier entries when BOTH are present. */
export const PREFERENCE_ORDER: string[] = [
  "gpt-5.5",
  "gpt-5.1",
  "gpt-5",
  "gpt-4.5",
  "gpt-4.1",
  "gpt-4o",
  "gpt-4-turbo",
  "gpt-4",
];

export const FALLBACK_MODEL = "gpt-4o";

// Never select an embeddings/audio/moderation/image model even if its id
// happens to share a prefix with a chat-model preference entry.
const EXCLUDED_SUFFIXES = ["-instruct", "-embedding", "-audio", "-realtime", "-transcribe", "-tts", "-moderation", "-search", "-vision-preview"];

/**
 * Pure ranking function — given the raw list of model ids an account has
 * access to, pick the best one per PREFERENCE_ORDER. No network, fully
 * unit-testable. Returns FALLBACK_MODEL if nothing in the live list matches
 * any preference (or the list is empty).
 */
export function pickBestModel(availableModelIds: string[], preferenceOrder: string[] = PREFERENCE_ORDER): string {
  const usable = availableModelIds.filter(id => !EXCLUDED_SUFFIXES.some(suf => id.includes(suf)));
  for (const preferred of preferenceOrder) {
    const match = usable.find(id => id === preferred || id.startsWith(`${preferred}-`));
    if (match) return match;
  }
  return FALLBACK_MODEL;
}

let cachedModel: string | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 min — long enough to avoid a models.list() round trip per page, short enough to pick up newly-granted model access without a redeploy.

/**
 * Resolve the strongest model this account actually has access to, per
 * PREFERENCE_ORDER, confirmed live against OpenAI's /v1/models endpoint.
 * Never throws — any failure (network, auth, malformed response) falls back
 * to FALLBACK_MODEL so a models.list() outage never blocks generation.
 */
export async function resolveTeachingModel(client: OpenAI): Promise<string> {
  const now = Date.now();
  if (cachedModel && now - cachedAt < CACHE_TTL_MS) return cachedModel;

  try {
    const list = await client.models.list();
    const ids = list.data.map(m => m.id);
    const resolved = pickBestModel(ids);
    cachedModel = resolved;
    cachedAt = now;
    DEV && console.log("[OPENAI_MODEL_RESOLVED]", { resolved, availableCount: ids.length });
    return resolved;
  } catch (err: any) {
    console.warn("[OPENAI_MODEL_RESOLUTION_FAILED]", { error: err?.message ?? String(err), fallback: FALLBACK_MODEL });
    return FALLBACK_MODEL;
  }
}

/** Test-only: clears the module-level cache between test cases. */
export function __resetModelCacheForTests(): void {
  cachedModel = null;
  cachedAt = 0;
}
