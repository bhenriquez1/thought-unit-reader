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

export const ExternalStudyLinkSchema = z.object({
  label:       z.string(),                                               // display text, ≤5 words
  searchQuery: z.string(),                                               // Google / Google Scholar query string
  type:        z.enum(["textbook-search", "article-search", "reference"]),
});

export type ExternalStudyLink = z.infer<typeof ExternalStudyLinkSchema>;

export const MiniTestItemSchema = z.object({
  question:      z.string(),
  type:          z.enum(["multiple-choice", "short-answer", "application"]),
  options:       z.array(z.string()).nullable(), // exactly 4 items for multiple-choice, null otherwise
  correctAnswer: z.string(),                     // MC: exact correct option text; others: model answer
  explanation:   z.string(),                     // why correct + what to study if wrong
});

export type MiniTestItem = z.infer<typeof MiniTestItemSchema>;

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
  memoryAnchor: z.string().nullable(),
  externalStudyLinks: z.array(ExternalStudyLinkSchema).nullable(),
  concepts: z.array(TeachingSynthesisConceptSchema),
  miniTests: z.array(z.string()).nullable(),           // legacy — kept for backward compat
  miniTestItems: z.array(MiniTestItemSchema).nullable(), // structured interactive questions
  highlightAnchors: z.array(SynthHighlightAnchorSchema).nullable(),
  relatedVideoQueries: z.array(z.string()).nullable(),
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

─── LEFT-PANEL HIGHLIGHT ANCHORS ────────────────────────────────────────────
highlightAnchors: Select 2–4 exact verbatim text spans that answer the question:
"What is this page teaching?" — the sentences a professor would underline on the board.

A student reading ONLY these highlighted sentences must understand the page's core idea.
Quality > quantity. Two sharp highlights beat six mediocre ones.

TARGET ROLES — in priority order:
  1. anchorType "thesis"       — the one sentence that states what this page is about (REQUIRED)
  2. anchorType "mechanism"    — how/why it works; cause-effect chain (include if present)
  3. anchorType "clinicalTrap" — the mistake or misconception that trips students up
  4. anchorType "definition"   — the core definition or rule (include only if distinct from thesis)
  5. anchorType "examSignal"   — a sentence a board exam would quote or derive from
  6. anchorType "application"  — real-world consequence or clinical implication
  7. anchorType "formula"      — equation or procedure (only if central to the page)

QUALITY RULES:
• Copy text EXACTLY as it appears in the source — verbatim, no paraphrase.
• Each span must be a complete grammatical sentence or clause (≤ 30 words).
• Prefer sentence-ending spans (with period) — these match the PDF text layer reliably.
• NEVER highlight: figure captions, "In this chapter…" transitions, publisher/copyright text,
  OCR noise, incomplete fragments, or repeated content from another anchor.
• Do NOT lower the bar to hit a count. Return 2 sharp anchors rather than 4 weak ones.
• Return null ONLY if the page has fewer than 3 real instructional sentences.

─── STRUCTURED MINI TEST ────────────────────────────────────────────────────
miniTestItems: Generate 2–3 structured practice questions testing the governing concept.
For each item:
• type: "multiple-choice" | "short-answer" | "application"
• question: one clear exam-style question — must directly test the governing concept, not a tangential detail
• options: for multiple-choice: exactly 4 options (A=correct, B/C/D=plausible wrong); null for other types
• correctAnswer: for MC: the exact correct option text; for short-answer/application: a 1–2 sentence model answer
• explanation: why this answer is correct and what to study if a student gets it wrong (1–2 sentences)
Priority: 1 MC on the governing concept, 1 short-answer on mechanism, 1 application/trap if warranted.
Return null if the page is too brief to generate meaningful questions.

─── EXTERNAL STUDY LINKS ────────────────────────────────────────────────────
externalStudyLinks: Generate 3–5 external references a student should search to deepen
understanding of this exact topic. For each link:
• label: Concise concept name (≤5 words), e.g. "Limit Convergence", "Thyroid Physiology"
• searchQuery: A Google or Google Scholar query string that finds the best resource
  Examples: "sequence convergence epsilon delta proof", "thyroid hormone synthesis iodine"
• type: one of:
  - "textbook-search" — for a foundational textbook chapter (query → Google Scholar)
  - "article-search" — for a review article or tutorial
  - "reference" — for a specific trusted site (Khan Academy, Wikipedia, MIT OCW)
Return null if the topic is highly specialized and no reliable search would help.

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

For page level: coreIdea, mechanism, rule, trap, application, teachingObjective, examCriticalIdea, reasoningFlow, misconceptionAlert, memoryAnchor, externalStudyLinks, highlightAnchors (2–4 sharp anchors answering "What is this page teaching?"), miniTestItems (2–3 structured questions), relatedVideoQueries.
For each concept (include ${Math.min(rankedConcepts.length, 4)}): principle, mechanism, trap, rule, misconception, examHook.

Every field: complete sentence, ≤20 words, relational not definitional, professor-level language.
If a concept text is a figure caption: write the PRINCIPLE the figure is illustrating, not the caption.
highlightAnchors: 2–4 verbatim spans from the source. Prefer the thesis sentence and mechanism sentence. Return null only if fewer than 3 sentences of real content.`;
}

// ---------------------------------------------------------------------------
// Stage 1 — Fast schema (thesis + highlights + mini-test only)
// Target: 1–3 s. Renders immediately while Stage 2 processes in background.
// ---------------------------------------------------------------------------

export const Stage1SynthesisSchema = z.object({
  coreIdea:        z.string(),
  highlightAnchors: z.array(SynthHighlightAnchorSchema).nullable(),
  miniTestItems:   z.array(MiniTestItemSchema).nullable(),
});
export type Stage1Synthesis = z.infer<typeof Stage1SynthesisSchema>;

export function buildStage1SystemPrompt(domain: PageDomain): string {
  return `You are a world-class ${domain} educator. Extract exactly 3 things from the page content provided:

1. coreIdea — The governing principle in ONE precise, complete sentence (≤20 words). What a professor would write on the board first.

2. highlightAnchors — 2–4 exact verbatim text spans that answer "What is this page teaching?"
   TARGET: thesis (required) + mechanism (if present) + clinicalTrap or examSignal (if present).
   Quality over quantity — 2 sharp highlights beat 5 mediocre ones. Copy text EXACTLY (≤30 words each).
   NEVER highlight figure captions, filler, or fragments. Return null only if < 3 real sentences.

3. miniTestItems — 2 exam-quality practice questions:
   • Question 1: multiple-choice — 4 options, correct answer is the BEST option.
   • Question 2: short-answer or application — model answer in 1–2 sentences.
   Include a 1-sentence explanation for each.

Be fast and precise. Do NOT elaborate beyond the schema fields.`;
}

export function buildStage1UserPrompt(input: SynthesisInput): string {
  const { domain, pageThesis, pageObjective, rankedConcepts } = input;
  const context = [pageThesis, pageObjective].filter(Boolean).slice(0, 2).join("\n");
  const concepts = rankedConcepts.slice(0, 3).map((c, i) =>
    `${i + 1}. [${c.role.toUpperCase()}] "${c.title}"\n   "${c.text.slice(0, 220)}"`
  ).join("\n\n");
  return `DOMAIN: ${domain}\n\nPAGE CONTEXT:\n${context || "(derive from concepts below)"}\n\nKEY CONCEPTS:\n${concepts}\n\nExtract: coreIdea, highlightAnchors (2–4 sharp verbatim spans — thesis + mechanism + trap/examSignal), miniTestItems (1 MC + 1 short-answer).`;
}

/** Client-side Stage 1 fetch — fast path. */
export async function synthesizeStage1Output(
  input: SynthesisInput,
  signal?: AbortSignal,
): Promise<Stage1Synthesis> {
  const response = await fetch("/api/intelligenceSynthesis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, stage: "1" }),
    signal,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error ?? `stage1 failed: ${response.status}`);
  }
  const raw = await response.json();
  try {
    return Stage1SynthesisSchema.parse(raw);
  } catch (zodErr) {
    console.error("[SYNTH:stage1:zod-fail]", zodErr instanceof Error ? zodErr.message : String(zodErr));
    throw zodErr;
  }
}

/** Build a valid full TeachingSynthesis stub from Stage 1 results.
 *  Empty strings for unrequested fields — validSynthField() rejects them so they don't render. */
export function makeStubFromStage1(stage1: Stage1Synthesis): TeachingSynthesis {
  return {
    coreIdea:          stage1.coreIdea,
    mechanism:         "",
    rule:              "",
    trap:              null,
    application:       "",
    teachingObjective: "",
    examCriticalIdea:  "",
    reasoningFlow:     "",
    misconceptionAlert: null,
    memoryAnchor:      null,
    externalStudyLinks: null,
    concepts:          [],
    miniTests:         null,
    miniTestItems:     stage1.miniTestItems,
    highlightAnchors:  stage1.highlightAnchors,
    relatedVideoQueries: null,
  };
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

  // Chunk to high-signal content: if total concept text > 2000 chars, trim lower-priority concepts.
  // This prevents oversized prompts from causing timeouts on dense pages.
  const MAX_CONCEPT_CHARS = 2000;
  const totalChars = rankedConcepts.reduce((s, c) => s + (c.text?.length ?? 0), 0);
  const chunkedConcepts = totalChars > MAX_CONCEPT_CHARS
    ? (() => {
        const result: SynthesisConceptInput[] = [];
        let chars = 0;
        for (const c of rankedConcepts) {
          const len = c.text?.length ?? 0;
          if (chars + len > MAX_CONCEPT_CHARS && result.length >= 2) break;
          result.push(c);
          chars += len;
        }
        return result;
      })()
    : rankedConcepts;

  return { domain, pageObjective, pageThesis, pageSummary, pageNumber, rankedConcepts: chunkedConcepts };
}
