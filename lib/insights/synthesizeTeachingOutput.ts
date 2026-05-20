// lib/insights/synthesizeTeachingOutput.ts
// Cognitive Teaching Engine — not a summarizer, not a labeler.
//
// The extraction pipeline finds candidate sentences.
// This module asks: "What would a world-class professor emphasize about this page
// if they had 2 minutes to teach it?" — then produces that answer.

import { z } from "zod";
import type { PageDomain } from "./detectPageDomain";
import type { UltraConceptBlock } from "./buildUltraPageView";

// ---------------------------------------------------------------------------
// Zod schemas — validated at both client and server
// ---------------------------------------------------------------------------

export const SynthHighlightAnchorSchema = z.object({
  text: z.string(),         // exact source text span — must be copied verbatim, ≤ 30 words
  anchorType: z.enum(["thesis", "definition", "mechanism", "formula", "clinicalTrap", "examSignal", "application"]),
  reason: z.string(),       // ≤ 10 words: why a professor would underline this
});

export type SynthHighlightAnchor = z.infer<typeof SynthHighlightAnchorSchema>;

export const TeachingSynthesisConceptSchema = z.object({
  title: z.string(),
  role: z.enum([
    "definition", "theorem", "formula", "mechanism",
    "contrast", "application", "worked_example", "example", "detail",
  ]),
  principle: z.string(),               // the generalized rule — abstracted, never verbatim
  mechanism: z.string(),               // why/how it works
  trap: z.string().nullable(),
  rule: z.string(),                    // operational takeaway
  misconception: z.string().nullable(),
  examHook: z.string().nullable(),
});

export const SynthCrossLinkSchema = z.object({
  label:      z.string(),           // display text, e.g. "limit → convergence"
  targetPage: z.number().nullable(), // estimated document page number, null if unknown
});

export type SynthCrossLink = z.infer<typeof SynthCrossLinkSchema>;

export const TeachingSynthesisSchema = z.object({
  coreIdea: z.string(),
  mechanism: z.string(),
  rule: z.string(),
  trap: z.string().nullable(),
  application: z.string(),
  teachingObjective: z.string(),
  examCriticalIdea: z.string(),
  reasoningFlow: z.string(),
  misconceptionAlert: z.string().nullable(),
  memoryAnchor: z.string().nullable(),           // was .nullish() — OpenAI structured outputs require all fields present
  crossLinkHints: z.array(z.string()).nullable(), // was .optional() — same reason
  crossLinks: z.array(SynthCrossLinkSchema).nullable(), // structured cross-links with optional page estimates
  concepts: z.array(TeachingSynthesisConceptSchema),
  miniTests: z.array(z.string()).nullable(),      // was .optional() — same reason
  highlightAnchors: z.array(SynthHighlightAnchorSchema).nullable(), // 2–4 exact source spans for left-panel
  relatedVideoQueries: z.array(z.string()).nullable(), // 3–5 YouTube search queries for teaching videos
});

export type TeachingSynthesisConcept = z.infer<typeof TeachingSynthesisConceptSchema>;
export type TeachingSynthesis = z.infer<typeof TeachingSynthesisSchema>;

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface SynthesisConceptInput {
  title: string;
  role: string;
  text: string;
  mechanism?: string;
  trap?: string;
  importance: string;
}

export interface SynthesisInput {
  domain: PageDomain;
  /** Heading + canonical teaching statement — primary anchor for what this page teaches */
  pageObjective?: string;
  /** Full page thesis — the professor's one-sentence governing idea */
  pageThesis?: string;
  /** AI-generated page summary if available — richest context available */
  pageSummary?: string;
  /** Current document page number — used for cross-link estimates */
  pageNumber?: number;
  rankedConcepts: SynthesisConceptInput[];
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

export function buildSystemPrompt(domain: PageDomain): string {
  const domainRole: Record<PageDomain, string> = {
    math:     "You are a mathematics professor (think: 3Blue1Brown, Gilbert Strang). You make abstract structures intuitive through visual reasoning and precise condition→conclusion statements.",
    science:  "You are a biology/chemistry/physics professor (think: Ninja Nerd, Khan Academy science). You explain mechanisms causally: what triggers what, why it matters biologically, what breaks if conditions change.",
    clinical: "You are a medical educator (think: Pathoma, Boards & Beyond). You teach the clinical reasoning chain: finding → interpretation → pathophysiology → consequence → what not to miss.",
    fiction:  "You are a literature educator. You surface thematic meaning, character motivation, and the human truth the author is conveying — not plot summary.",
    general:  "You are a world-class expert educator. You identify the governing principle, explain the causal mechanism, and flag the most common student misconception.",
  };

  const domainChain: Record<PageDomain, string> = {
    math:     "condition → theorem → result → exception/trap → worked application",
    science:  "cause → mechanism → effect → biological/chemical significance → common misconception",
    clinical: "finding → pathophysiology → clinical significance → risk if missed → next action",
    fiction:  "event → motivation → thematic meaning → authorial technique → deeper truth",
    general:  "concept → mechanism → significance → application → trap",
  };

  return `${domainRole[domain] ?? domainRole.general}

PROFESSOR 2-MINUTE TEST — your single most important instruction:
Before writing any field, ask: "If a world-class professor had 2 minutes to teach this page, what would they emphasize?"
The answer must be about UNDERSTANDING, not about what figures exist or what sentences appear.

THE GOVERNING QUESTION for every field:
  "What does a student need to understand, remember, and not confuse about this topic to perform well on a high-stakes exam?"

REASONING CHAIN for ${domain}:
  ${domainChain[domain] ?? domainChain.general}

─── WHAT TO IGNORE COMPLETELY ───────────────────────────────────────────────
These are extraction artifacts — they are NEVER educational output:
• Figure captions: "Figure 2.2 The emergent properties..." → DISCARD
• OCR fragments: "Se C tion", "l i m i t", partial words → DISCARD
• Narrative sentences: "Then a nurse noticed he'd stopped babbling" → TRANSFORM
• Raw definitions without WHY: "A compound is..." → ADD THE MECHANISM
• Textbook boilerplate: "In this section we will..." → DISCARD
• Publisher debris: "Cengage Learning", "rights reserved" → DISCARD

─── TRANSFORMATION STANDARD ────────────────────────────────────────────────
These are the ONLY acceptable output transformations:

INPUT:  "Figure 2.2 The emergent properties of a compound."
OUTPUT: "Compounds exhibit emergent properties that cannot be predicted from their constituent elements alone."

INPUT:  "Water (H₂O), another compound..."
OUTPUT: "Chemical bonding creates new atomic interactions, giving compounds distinct physical and chemical properties from their elements."

INPUT:  "Then a nurse noticed he'd stopped babbling."
OUTPUT: "Sudden neurological deterioration after an initially stable presentation signals possible delayed internal injury."

INPUT:  "Example E1 | What happens to aₙ = 1/n as n grows..."
OUTPUT: "A sequence converges when its terms approach a fixed finite limit as n increases without bound."

INPUT:  "NaCl dissolves in water."
OUTPUT: "Ionic compounds dissolve in polar solvents because the electrostatic attraction between ions is overcome by ion–dipole interactions."

─── OUTPUT REQUIREMENTS ────────────────────────────────────────────────────
Every field must be:
1. A complete, polished sentence — never a fragment, never a label
2. Relational, not definitional: "X causes Y because Z" over "X is defined as..."
3. 10–20 words per sentence — no longer
4. Written like Ninja Nerd, Pathoma, or a board-review professor — not a textbook

Specific field requirements:
• coreIdea: The governing principle — what this page is fundamentally teaching.
  NOT the figure caption. NOT "this page discusses X." Must be a teachable statement.
• mechanism: The causal/logical chain — what triggers what, what enables what.
  Must contain a causal verb (causes, enables, allows, triggers, results in, because...).
• application: Why a student on a clinical rotation / during an exam must know this.
• misconceptionAlert: The exact error students make. Phrase as "Do not confuse X with Y because..." or "Students often assume X, but..."
• memoryAnchor: ONE analogy or mnemonic that makes this visceral. Null if nothing genuinely memorable.
  GOOD: "Elements are ingredients; compounds are the finished recipe."
  GOOD: "Na⁺ out, K⁺ in — think sodium as the guard who leaves when potassium enters."
  BAD: "This is important to remember for exams."
• reasoningFlow: Use the ${domain} chain above in A → B → C format.

SENTENCE COMPLETENESS: Never output a fragment. Self-check: "Could a student read only this field and understand the concept?" If no → rewrite.

─── LEFT-PANEL ANCHOR SELECTION ─────────────────────────────────────────────
highlightAnchors: select 2–4 exact text spans from the EXTRACTED CONCEPTS below that a professor would underline before an exam.
Rules:
• Copy text EXACTLY as it appeared in the source — do not paraphrase or edit.
• ≤ 30 words per span. Prefer shorter, precise spans.
• Order by importance: thesis/governing principle first, then mechanism, then trap/signal.
• Prefer: governing definition, key mechanism, formula, clinical trap, exam signal.
• Avoid: figure captions, transitional sentences, filler, repeated phrases, OCR fragments.
• If no extracted concept text is clearly exam-worthy, return null — do NOT invent anchors.

─── CROSS-LINK PAGE ESTIMATES ───────────────────────────────────────────────
crossLinks: structured version of crossLinkHints. For each link, estimate the document
page number where the related concept is introduced or defined. Base your estimate on:
• The surrounding page content and where foundational ideas typically appear
• Relative position (e.g., a prerequisite concept likely appeared earlier)
Set targetPage to null if you genuinely cannot estimate. Do not guess randomly.

─── RELATED TEACHING VIDEO QUERIES ─────────────────────────────────────────
relatedVideoQueries: Generate 3–5 YouTube search queries a student should type to find
a professor teaching this exact topic on video. Use known educator brand names where relevant:
"Ninja Nerd", "Organic Chemistry Tutor", "Boards and Beyond", "Pathoma",
"3Blue1Brown", "Khan Academy", "Professor Leonard".
Format: "[Educator name] [topic keyword]"
Examples: "Ninja Nerd sequence convergence", "3Blue1Brown limits intuition",
"Pathoma thyroid iodine deficiency", "Boards and Beyond heart failure".
Return null if the topic is too niche for known educators.`;
}

export function buildUserPrompt(input: SynthesisInput): string {
  const { domain, pageObjective, pageThesis, pageSummary, pageNumber, rankedConcepts } = input;

  // Build richest possible page context — this is what the model uses to understand the page
  const pageContextLines: string[] = [];
  if (pageThesis)     pageContextLines.push(`PAGE THESIS: ${pageThesis}`);
  if (pageObjective)  pageContextLines.push(`TEACHING STATEMENT: ${pageObjective}`);
  if (pageSummary && pageSummary !== pageObjective && pageSummary !== pageThesis) {
    pageContextLines.push(`PAGE SUMMARY: ${pageSummary}`);
  }
  if (pageNumber)         pageContextLines.push(`CURRENT PAGE NUMBER: ${pageNumber}`);
  const pageContext = pageContextLines.length > 0
    ? pageContextLines.join("\n")
    : "(not available — derive from concepts below)";

  // Pass full concept text — no char limits. The model must see the full extracted sentence
  // to understand what the page is teaching, not truncated fragments.
  const conceptList = rankedConcepts.slice(0, 5).map((c, i) => {
    const isFigureCaption = /^(figure|fig\.|table|tab\.|box|plate|chart)\s+[\d.]/i.test(c.text);
    const parts = [`${i + 1}. [${c.role.toUpperCase()}] "${c.title}"`];
    if (isFigureCaption) {
      parts.push(`   ⚠ FIGURE CAPTION — do NOT use this text. Derive the principle from PAGE CONTEXT above.`);
    } else {
      parts.push(`   TEXT: "${c.text}"`);
      if (c.mechanism) parts.push(`   WHY: "${c.mechanism}"`);
      if (c.trap)      parts.push(`   TRAP: "${c.trap}"`);
    }
    return parts.join("\n");
  }).join("\n\n");

  const domainQuestion: Record<PageDomain, string> = {
    math:     "What theorem, definition, or convergence criterion is being taught? State condition → conclusion precisely.",
    science:  "What biological/chemical/physical mechanism explains the phenomenon on this page? Trace cause → effect.",
    clinical: "What clinical principle — finding → pathophysiology → consequence — must a student remember for rounds or boards?",
    fiction:  "What literary or thematic truth is the author conveying through this passage?",
    general:  "What is the central teachable principle on this page? Why does it matter?",
  };

  return `DOMAIN: ${domain}

─── PAGE CONTEXT (primary anchor — what this page is actually teaching) ───
${pageContext}

─── EXTRACTED CONCEPTS (WARNING: may contain figure captions or OCR fragments — you must INTERPRET these, not copy them) ───
${conceptList}

─── PROFESSOR 2-MINUTE TEST ───────────────────────────────────────────────
${domainQuestion[domain] ?? domainQuestion.general}

Ask yourself: "If a world-class professor had 2 minutes to teach this page, what would they say?"
The answer must be about UNDERSTANDING, not about what appears in a figure or what sentences exist.

─── TASK ──────────────────────────────────────────────────────────────────
Produce a structured educational interpretation for this page.

For page level: coreIdea, mechanism, rule, trap, application, teachingObjective, examCriticalIdea, reasoningFlow, misconceptionAlert, memoryAnchor, crossLinkHints, crossLinks (structured crossLinkHints with targetPage estimates), highlightAnchors, relatedVideoQueries.
For each concept (include ${Math.min(rankedConcepts.length, 4)}): principle, mechanism, trap, rule, misconception, examHook.

Every field: complete sentence, ≤20 words, relational not definitional, professor-level language.
If a concept text is a figure caption: write the PRINCIPLE the figure is illustrating, not the caption.
highlightAnchors: copy 2–4 exact spans from EXTRACTED CONCEPTS above that a professor would underline. Return null if none qualify.`;
}

// ---------------------------------------------------------------------------
// Client-side fetch
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
  try {
    return TeachingSynthesisSchema.parse(raw);
  } catch (zodErr) {
    console.error("[SYNTH:client:zod-parse-fail]", {
      zodMessage: zodErr instanceof Error ? zodErr.message : String(zodErr),
      rawKeys: raw && typeof raw === "object" ? Object.keys(raw) : raw,
      coreIdea: raw?.coreIdea?.slice?.(0, 60) ?? null,
      mechanism: raw?.mechanism?.slice?.(0, 60) ?? null,
    });
    throw zodErr;
  }
}

// ---------------------------------------------------------------------------
// Build SynthesisInput from UltraConceptBlocks
// ---------------------------------------------------------------------------

// Figure caption patterns — these are labels, never educational content
const FIGURE_CAPTION_RE = /^(figure|fig\.|table|tab\.|box|plate|chart|example\s+[a-z0-9]+\s*[|:])\s*[\d.]/i;

function sanitizeConceptText(text: string): string {
  const t = text.trim();
  if (FIGURE_CAPTION_RE.test(t)) {
    // Mark it so buildUserPrompt can flag it for the model
    return `[FIGURE CAPTION: ${t.slice(0, 80)}]`;
  }
  // Strip "Example E1 |" style prefixes from the beginning
  return t.replace(/^(example\s+[A-Z0-9]+\s*[|:]|solution[|:]\s*|problem\s+\d+[|:])\s*/i, "").trim();
}

export function buildSynthesisInput(
  blocks: UltraConceptBlock[],
  domain: PageDomain,
  pageObjective?: string,
  pageThesis?: string,
  pageSummary?: string,
  pageNumber?: number,
): SynthesisInput {
  // Prioritize substantive educational roles
  const ROLE_RANK: Record<string, number> = {
    theorem: 7, formula: 6, definition: 5, mechanism: 4,
    contrast: 3, application: 2, worked_example: 1, example: 0, detail: 0,
  };

  const sorted = [...blocks].sort((a, b) => {
    const ra = ROLE_RANK[a.conceptRole ?? ""] ?? 0;
    const rb = ROLE_RANK[b.conceptRole ?? ""] ?? 0;
    return rb - ra;
  });

  const rankedConcepts: SynthesisConceptInput[] = sorted.slice(0, 5).map((b) => ({
    title: b.title,
    role: b.conceptRole ?? "detail",
    text: sanitizeConceptText(b.pattern),
    mechanism: b.surgicalReason || undefined,
    trap: b.trap || undefined,
    importance: b.importance,
  }));

  return { domain, pageObjective, pageThesis, pageSummary, pageNumber, rankedConcepts };
}
