// lib/summarizeText.ts
// Compat shim that preserves the old API:
//   summarizeText(input: string, readingLevel?: string)
//
// Under the hood it delegates to the new server-first helper in ./aiSummary
// (POST /api/summarize), so we don't depend on the "ai" package at build time.

import { summarizeText as summarizeViaServer } from "./aiSummary";
export type { SummarizeOpts } from "./aiSummary";

/**
 * Summarizes text. If `readingLevel` is provided, we pass it as guidance
 * to the server route via `instructions`.
 */
export async function summarizeText(input: string, readingLevel?: string): Promise<string> {
  const instructions = readingLevel
    ? `Use a style appropriate for a child aged ${readingLevel}.`
    : undefined;

  // You can further tune here (sentences/model) if you like
  return summarizeViaServer(input, { instructions });
}

// Keep default export for legacy imports
export default summarizeText;