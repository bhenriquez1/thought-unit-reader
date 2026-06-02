// lib/insights/claudeEnrichmentClient.ts
// Client-side fetch wrapper for the Claude enrichment API (Stage 3).

import type { ClaudeEnrichmentInput, ClaudeEnrichmentOutput } from "@/pages/api/claudeEnrichment";
export type { ClaudeEnrichmentInput, ClaudeEnrichmentOutput };

export async function fetchClaudeEnrichment(
  input: ClaudeEnrichmentInput,
  signal?: AbortSignal,
): Promise<ClaudeEnrichmentOutput> {
  const res = await fetch("/api/claudeEnrichment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
  if (!res.ok) throw new Error(`Claude enrichment HTTP ${res.status}`);
  return res.json() as Promise<ClaudeEnrichmentOutput>;
}
