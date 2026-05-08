// lib/insights/synthesizeTeachingOutput.ts
// LLM-based educational interpretation layer.
//
// The extraction pipeline finds the best sentences. This module asks:
// "What is the author TEACHING?" — producing abstractions that heuristics
// cannot derive from ranked text alone.

import type { PageDomain } from "./detectPageDomain";
import type { UltraConceptBlock } from "./buildUltraPageView";

export interface TeachingSynthesisConcept {
  title: string;
  principle: string;    // → pattern field (abstracted, never copied)
  mechanism: string;    // → surgicalReason field
  trap: string | null;  // → trap field
  rule: string;         // → rule field
}

export interface TeachingSynthesis {
  coreIdea: string;
  teachingObjective: string;
  examCriticalIdea: string;
  concepts: TeachingSynthesisConcept[];
}

function buildSystemPrompt(domain: PageDomain): string {
  const domainInstructions: Record<PageDomain, string> = {
    math: `You are a mathematics educator. Focus on: theorems (state the precise condition and conclusion), convergence/divergence criteria, proof strategies, when a formula applies vs. fails, and common student misconceptions.`,
    science: `You are a science educator. Focus on: mechanisms (cause → effect), the biological/chemical principle behind observations, why a process occurs at the molecular level, and what would happen if conditions changed.`,
    clinical: `You are a medical educator. Focus on: clinical significance (what does this finding mean for patient care?), pathophysiology in plain terms, diagnostic reasoning, and the most dangerous mistake a student could make.`,
    fiction: `You are a literature educator. Focus on: thematic meaning, character motivation, narrative technique, and the deeper human truth the author is conveying.`,
    general: `You are an expert educator. Focus on: the core principle being taught, why it matters, how it works, and what misconceptions to avoid.`,
  };

  return `${domainInstructions[domain] ?? domainInstructions.general}

CRITICAL RULES — violating any of these makes your output useless:
1. NEVER copy a sentence verbatim from the source text. Restate every idea in your own words.
2. IGNORE figure captions, image labels, narrative transitions, and OCR artifacts.
3. The coreIdea must be an abstracted principle — "Compounds exhibit emergent properties distinct from their elements" not "Figure 2.2 shows emergent properties."
4. Each concept's "principle" must be a generalized statement, never an example. Abstract from the example to the rule.
5. If two fields would be identical, make one more specific and one more general — never duplicate.
6. Keep every field to 1–2 sentences maximum.
7. Respond ONLY with valid JSON matching the exact schema provided.`;
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

Return a JSON object with EXACTLY this structure:
{
  "coreIdea": "<1-2 sentence abstracted principle — what this page is TEACHING, not what it says>",
  "teachingObjective": "<what a student should understand after reading this page>",
  "examCriticalIdea": "<the one thing most likely to appear on an exam or be misunderstood>",
  "concepts": [
    {
      "title": "<concept name — match the extracted anchors where accurate>",
      "principle": "<the generalized rule or definition, abstracted from examples>",
      "mechanism": "<why or how it works — cause/condition → effect/consequence>",
      "trap": "<common misconception or confusion to avoid, or null>",
      "rule": "<operational takeaway — what to DO with this knowledge>"
    }
  ]
}

Include ${Math.min(extractedConcepts.length, 4)} concepts total. The concepts array should correspond to the extracted concept anchors in order.`;
}

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

  return response.json() as Promise<TeachingSynthesis>;
}

export { buildSystemPrompt, buildUserPrompt };
