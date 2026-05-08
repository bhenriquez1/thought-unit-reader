// lib/insights/synthesizeTeachingOutput.ts
// LLM-based educational interpretation layer.
//
// The extraction pipeline finds the best sentences. This module asks:
// "What is the author TEACHING?" — producing abstractions that heuristics
// cannot derive from ranked text alone.

import { z } from "zod";
import type { PageDomain } from "./detectPageDomain";
import type { UltraConceptBlock } from "./buildUltraPageView";

// ---------------------------------------------------------------------------
// Zod schemas — used by both client and API route for validation
// ---------------------------------------------------------------------------

export const TeachingSynthesisConceptSchema = z.object({
  title: z.string(),
  role: z.enum(["definition", "theorem", "formula", "mechanism", "contrast", "application", "worked_example", "example", "detail"]),
  principle: z.string(),   // → pattern field (abstracted, never copied)
  mechanism: z.string(),   // → surgicalReason field
  trap: z.string().nullable(),
  rule: z.string(),        // → rule field
});

export const TeachingSynthesisSchema = z.object({
  coreIdea: z.string(),
  teachingObjective: z.string(),
  examCriticalIdea: z.string(),
  concepts: z.array(TeachingSynthesisConceptSchema),
});

// ---------------------------------------------------------------------------
// TypeScript types derived from schemas
// ---------------------------------------------------------------------------

export type TeachingSynthesisConcept = z.infer<typeof TeachingSynthesisConceptSchema>;
export type TeachingSynthesis = z.infer<typeof TeachingSynthesisSchema>;

// ---------------------------------------------------------------------------
// Prompt builders (used by the API route)
// ---------------------------------------------------------------------------

function buildSystemPrompt(domain: PageDomain): string {
  const domainInstructions: Record<PageDomain, string> = {
    math: `You are a mathematics educator. Focus on: theorems (state the precise condition and conclusion), convergence/divergence criteria, proof strategies, when a formula applies vs. fails, and common student misconceptions.`,
    science: `You are a science educator. Focus on: mechanisms (cause → effect), the biological/chemical principle behind observations, why a process occurs at the molecular level, and what would happen if conditions changed.`,
    clinical: `You are a medical educator. Focus on: clinical significance (what does this finding mean for patient care?), pathophysiology in plain terms, diagnostic reasoning, and the most dangerous mistake a student could make.`,
    fiction: `You are a literature educator. Focus on: thematic meaning, character motivation, narrative technique, and the deeper human truth the author is conveying.`,
    general: `You are an expert educator. Focus on: the core principle being taught, why it matters, how it works, and what misconceptions to avoid.`,
  };

  return `${domainInstructions[domain] ?? domainInstructions.general}

CONCEPT RANKING — order concepts by educational priority:
  1. definitions and theorems (the foundational rule being taught)
  2. mechanisms (cause → effect, how/why it works)
  3. contrasts and traps (what to NOT confuse, common errors)
  4. applications (real-world or clinical use)
  5. examples and details (last — never let an example be the primary concept)

CRITICAL RULES — violating any of these makes your output useless:
1. NEVER copy a sentence verbatim from the source text. Restate every idea in your own words.
2. IGNORE figure captions, image labels, narrative transitions, and OCR artifacts.
3. The coreIdea must be an abstracted principle — "Compounds exhibit emergent properties distinct from their elements" not "Figure 2.2 shows emergent properties."
4. Each concept's "principle" must be a generalized statement, never an example. Abstract from the example to the rule.
5. If two fields would be identical, make one more specific and one more general — never duplicate.
6. Keep every field to 1–2 sentences maximum.
7. Assign each concept a "role" that reflects its educational function: definition, theorem, formula, mechanism, contrast, application, worked_example, example, or detail.`;
}

function buildUserPrompt(
  pageText: string,
  domain: PageDomain,
  extractedConcepts: UltraConceptBlock[],
): string {
  const conceptList = extractedConcepts.slice(0, 5).map((c, i) =>
    `${i + 1}. "${c.title}" — anchor: "${c.pattern.slice(0, 120)}"`
  ).join("\n");

  const domainHint: Record<PageDomain, string> = {
    math: "What theorem, definition, or technique is being taught? State the conditions and consequences precisely.",
    science: "What biological/chemical/physical principle explains the observations on this page?",
    clinical: "What clinical principle should a student remember from this page?",
    fiction: "What literary or thematic idea is being communicated?",
    general: "What is the central teachable concept on this page?",
  };

  return `PAGE TEXT (${pageText.length} chars):
---
${pageText.slice(0, 2000)}
---

EXTRACTED CONCEPT ANCHORS (from automated pipeline — may include filler):
${conceptList}

TASK: Produce an educational interpretation of this page.

${domainHint[domain] ?? domainHint.general}

Rank concepts by educational priority: definitions/theorems first, mechanisms second, contrasts/traps third, applications fourth, examples last. Never let an example be the first or primary concept.

Include ${Math.min(extractedConcepts.length, 4)} concepts total, ordered by educational priority.`;
}

// ---------------------------------------------------------------------------
// Client-side fetch (runs in browser, calls the Next.js API route)
// ---------------------------------------------------------------------------

export async function synthesizeTeachingOutput(
  pageText: string,
  domain: PageDomain,
  extractedConcepts: UltraConceptBlock[],
  signal?: AbortSignal,
): Promise<TeachingSynthesis> {
  const response = await fetch("/api/intelligenceSynthesis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pageText, domain, extractedConcepts }),
    signal,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error ?? `synthesis failed: ${response.status}`);
  }

  const raw = await response.json();
  return TeachingSynthesisSchema.parse(raw);
}

export { buildSystemPrompt, buildUserPrompt };
