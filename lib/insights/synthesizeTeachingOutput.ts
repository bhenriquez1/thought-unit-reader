// lib/insights/synthesizeTeachingOutput.ts
// Educational Interpretation Engine — the "professor layer."
//
// The extraction pipeline finds the best sentences.
// This module asks: "What is the author TEACHING?" — and reasons about it
// like a domain expert, not a sentence copier.

import { z } from "zod";
import type { PageDomain } from "./detectPageDomain";
import type { UltraConceptBlock } from "./buildUltraPageView";

// ---------------------------------------------------------------------------
// Zod schemas — validated at both client and server
// ---------------------------------------------------------------------------

export const TeachingSynthesisConceptSchema = z.object({
  title: z.string(),
  role: z.enum([
    "definition", "theorem", "formula", "mechanism",
    "contrast", "application", "worked_example", "example", "detail",
  ]),
  principle: z.string(),               // the generalized rule — abstracted, never verbatim
  mechanism: z.string(),               // why/how it works
  trap: z.string().nullable(),
  rule: z.string(),        // operational takeaway
  misconception: z.string().nullable(), // "Students often confuse X with Y because..."
  examHook: z.string().nullable(),      // "On DAT/boards/clinical exams, this appears as..."
});

export const TeachingSynthesisSchema = z.object({
  // Page-level educational interpretation
  coreIdea: z.string(),           // what this page teaches (abstracted principle)
  mechanism: z.string(),          // how/why — the causal or logical chain
  rule: z.string(),               // the operational takeaway for the whole page
  trap: z.string().nullable(),    // most important misconception on the page
  application: z.string(),        // real-world, clinical, or practical use
  teachingObjective: z.string(),  // what a student should understand after reading
  examCriticalIdea: z.string(),   // the one thing most likely to be tested or misunderstood
  reasoningFlow: z.string(),      // domain-specific reasoning chain (A → B → C)
  misconceptionAlert: z.string().nullable(), // single biggest misconception across this whole page
  crossLinkHints: z.array(z.string()).optional(), // 1-2 concept connections (max 8 words each)
  // Per-concept educational breakdown (ordered by educational priority)
  concepts: z.array(TeachingSynthesisConceptSchema),
  miniTests: z.array(z.string()).optional(),
});

export type TeachingSynthesisConcept = z.infer<typeof TeachingSynthesisConceptSchema>;
export type TeachingSynthesis = z.infer<typeof TeachingSynthesisSchema>;

// ---------------------------------------------------------------------------
// Input types — structured concepts, NOT raw page text
// ---------------------------------------------------------------------------

export interface SynthesisConceptInput {
  title: string;
  role: string;           // ConceptRole
  text: string;           // the pattern/anchor sentence
  mechanism?: string;     // surgicalReason if available
  trap?: string;
  importance: string;     // "very_high" | "high" | "medium" | "low"
}

export interface SynthesisInput {
  domain: PageDomain;
  pageObjective?: string;                 // heading + teaching statement
  rankedConcepts: SynthesisConceptInput[]; // sorted by educational priority
}

// ---------------------------------------------------------------------------
// Prompt builders (used by the API route)
// ---------------------------------------------------------------------------

export function buildSystemPrompt(domain: PageDomain): string {
  const domainInstructions: Record<PageDomain, string> = {
    math: `You are a mathematics professor. Focus on: theorems (precise condition → conclusion), convergence/divergence criteria, when a formula applies vs. fails, and common student misconceptions.

MATH REASONING CHAIN: condition → theorem/rule → convergence/result → exception/trap → worked application`,

    science: `You are a biology/chemistry/physics professor. Focus on: mechanisms (cause → effect), the molecular-level principle behind observations, why a process occurs, and what breaks if conditions change.

SCIENCE REASONING CHAIN: cause → mechanism → effect → biological significance → common misconception`,

    clinical: `You are a medical educator. Focus on: clinical significance (what does this finding mean for patient care?), pathophysiology in plain terms, diagnostic reasoning, and the most dangerous mistake a student could make.

CLINICAL REASONING CHAIN: finding → interpretation → pathophysiology → risk → next action → consequence if missed`,

    fiction: `You are a literature educator. Focus on: thematic meaning, character motivation, narrative technique, and the deeper human truth the author is conveying.

LITERARY REASONING CHAIN: event → character motivation → thematic meaning → authorial technique → deeper truth`,

    general: `You are an expert educator. Focus on: the core principle being taught, why it matters, how it works, and what misconceptions to avoid.

GENERAL REASONING CHAIN: concept → mechanism → significance → application → trap`,
  };

  return `${domainInstructions[domain] ?? domainInstructions.general}

EXPERT TUTOR MINDSET — You think like a senior professor reviewing for exams:
- You know what students confuse, misremember, or skip
- You compress ideas to their essence: no redundancy, no filler
- You connect this concept to what came before and what comes next
- You flag exam traps before the student sees them

MISCONCEPTION DETECTION:
For every concept, identify the most common student error. Phrase it as:
"Students often confuse [X] with [Y] because [reason]."
or "Do not mistake [A] for [B] — [distinction]."
If no specific misconception exists, return null.

EXAM FRAMING (domain-specific):
- Math/DAT: "On DAT this often appears as: [calculation type] or [conceptual question]"
- Clinical/medical: "Clinically this matters because: [patient impact] or [diagnostic step]"
- Science/biology: "On boards this is tested as: [application question type]"
- General: "This is exam-critical because: [why this is high-yield]"
Return null if the concept is low-yield for exams.

CONCEPT RANKING — rank concepts in this educational priority order:
  1. theorem / core rule (highest — this IS what the page teaches)
  2. definition (foundational — establishes what a term means)
  3. mechanism (how/why it works — cause → effect)
  4. contrast / trap (what NOT to confuse — prevents misconceptions)
  5. application (real-world/clinical use — why it matters)
  6. worked example (support — illustrates, never leads)
  7. example / detail (lowest — never make an example the primary concept)

TRANSFORMATION EXAMPLES — follow this exact pattern, no exceptions:

BAD: "Water (H2O), another compound…"
GOOD: "Compounds exhibit emergent properties distinct from their constituent elements."

BAD: "Then a nurse noticed he'd stopped babbling."
GOOD: "Sudden neurological deterioration after initially stable trauma presentation may indicate delayed internal compromise."

BAD: "Example E1 | What happens to a_n = 1/n as n grows…"
GOOD: "A sequence converges when its terms approach a fixed limit as n becomes arbitrarily large."

BAD: "Figure 2.2 shows emergent properties."
GOOD: "Emergent properties arise at higher levels of biological organization and cannot be predicted from component parts alone."

BAD: "The atomic number is 6 for carbon."
GOOD: "Atomic number uniquely identifies an element by defining its proton count; it is invariant across all isotopes of that element."

CRITICAL RULES — every violation makes the output educationally worthless:
1. NEVER copy a sentence verbatim. Restate every idea using expert conceptual language.
2. IGNORE figure captions, image labels, OCR artifacts, and narrative story fragments.
3. coreIdea = an abstracted principle, never a figure reference or example sentence.
4. principle = generalized rule — abstract FROM the example TO the rule it illustrates.
5. mechanism ≠ rule — if they would be identical, make mechanism the WHY and rule the WHAT TO DO.
6. reasoningFlow must use the domain-specific chain format above (A → B → C).
7. Keep every field to 1–2 sentences maximum.
8. Write like Ninja Nerd, Pathoma, or a clinical attending — compressed expert cognition, not notes.`;
}

export function buildUserPrompt(
  input: SynthesisInput,
): string {
  const { domain, pageObjective, rankedConcepts } = input;

  const conceptList = rankedConcepts.slice(0, 5).map((c, i) =>
    `${i + 1}. [${c.role.toUpperCase()}] "${c.title}" — "${c.text.slice(0, 100)}"`
  ).join("\n");

  const domainHint: Record<PageDomain, string> = {
    math: "What theorem, definition, or convergence criterion is being taught? State condition and conclusion precisely.",
    science: "What biological/chemical/physical principle explains the mechanism on this page?",
    clinical: "What clinical principle — finding → action → consequence — should a student remember?",
    fiction: "What literary or thematic idea is being communicated?",
    general: "What is the central teachable principle on this page?",
  };

  return `DOMAIN: ${domain}
PAGE OBJECTIVE (from heading + highest-confidence canonical statement — use this as your primary anchor):
${pageObjective ?? "(derive from domain context below)"}

RANKED CONCEPTS (ordered by educational priority — higher role = more important):
${conceptList}

⚠️ FIGURE/TABLE/CAPTION RULE: If ANY concept text starts with "Figure", "Table", "Box", "Fig.", or "Example E", that is an OCR artifact — IGNORE THAT TEXT COMPLETELY. Derive the educational principle from the PAGE OBJECTIVE and domain context instead.

⚠️ NARRATIVE RULE: If a concept text reads like a story event ("Then a nurse noticed...", "He suddenly..."), convert it into a clinical/educational signal. Do not copy it.

TASK: Reason about this page as an expert educator using the ${domain} reasoning chain.

${domainHint[domain] ?? domainHint.general}

Produce a structured educational interpretation. Order concepts by educational priority (theorem/definition before example/detail). Include ${Math.min(rankedConcepts.length, 4)} concepts.

For each concept: fill principle, mechanism, trap, rule, misconception, examHook.
For page level: fill coreIdea, mechanism, rule, trap, application, teachingObjective, examCriticalIdea, reasoningFlow, misconceptionAlert, crossLinkHints.
Keep every field ≤ 2 sentences. Write like a professor, not a textbook.`;
}

// ---------------------------------------------------------------------------
// Client-side fetch (browser → Next.js API route)
// ---------------------------------------------------------------------------

export async function synthesizeTeachingOutput(
  input: SynthesisInput,
  signal?: AbortSignal,
): Promise<TeachingSynthesis> {
  const response = await fetch("/api/intelligenceSynthesis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error ?? `synthesis failed: ${response.status}`);
  }

  const raw = await response.json();
  return TeachingSynthesisSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// Helper: build SynthesisInput from UltraConceptBlocks
// ---------------------------------------------------------------------------

function sanitizeConceptText(text: string): string {
  const t = text.trim();
  // Figure/table captions are never educational principles — flag them explicitly
  if (/^(figure|fig\.|table|tab\.|box|plate|chart)\s+[\d.]+/i.test(t)) {
    return "[figure/table caption — derive principle from page context]";
  }
  // Strip "Example E1 |" style prefixes
  return t.replace(/^(example\s+[A-Z0-9]+\s*[|:]|solution[|:]\s*|problem\s+\d+[|:])\s*/i, "").trim();
}

export function buildSynthesisInput(
  blocks: UltraConceptBlock[],
  domain: PageDomain,
  pageObjective?: string,
): SynthesisInput {
  // Prioritize substantive educational roles; push examples/details to end
  const sorted = [...blocks].sort((a, b) => {
    const highValue = ["theorem", "formula", "definition", "mechanism", "contrast", "application"];
    const aHigh = highValue.includes(a.conceptRole ?? "") ? 0 : 1;
    const bHigh = highValue.includes(b.conceptRole ?? "") ? 0 : 1;
    return aHigh - bHigh;
  });

  const rankedConcepts: SynthesisConceptInput[] = sorted.slice(0, 5).map((b) => ({
    title: b.title,
    role: b.conceptRole ?? "detail",
    text: sanitizeConceptText(b.pattern),
    mechanism: b.surgicalReason || undefined,
    trap: b.trap || undefined,
    importance: b.importance,
  }));

  return { domain, pageObjective, rankedConcepts };
}
