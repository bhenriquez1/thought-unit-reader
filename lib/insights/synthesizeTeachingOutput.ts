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
  anchorType: z.enum(["thesis", "definition", "mechanism", "trap", "application"]),
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
  type:          z.enum(["multiple-choice", "short-answer", "application", "fill-in-the-blank", "trap"]),
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
  miniTests: z.array(z.string()).nullable(),             // legacy — kept for backward compat
  miniTestItems: z.array(MiniTestItemSchema).nullable(), // after-reading Page Checkpoint
  preReadRecallItems: z.array(MiniTestItemSchema).nullable(), // before-reading diagnostic
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
  /** First ~1500 chars of raw page text — lets OpenAI select verbatim highlight spans */
  pageText?: string;
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
highlightAnchors: You are selecting COGNITIVE RECONSTRUCTION ANCHORS — not annotations.

The goal is NOT sentence importance. The goal is: can a student mentally rebuild the full
page from these 2–6 highlights alone, without rereading?

HOLISTIC PAGE READING (complete ALL steps BEFORE selecting any highlight):
  1. Read the ENTIRE page context and raw text provided.
  2. Identify the governing thesis — what is this page fundamentally teaching?
  3. Identify the causal mechanism — how or why does the main concept work?
  4. Find the best application/example — where do we see this in reality?
  5. Detect any trap or contrast — what mistake will students make?
  6. Find the single most testable/memorable fact — what must be remembered?
  7. Determine how the page sections connect and build on each other.
  8. Determine WHY the author included each section — what understanding does it build?
  Only AFTER completing steps 1–8 should you select highlights.

INTERNAL TEST (answer all 7 before finalizing highlights):
  1. What is this page truly about?
  2. What mechanism is being taught?
  3. What relationships between concepts matter?
  4. What would appear on an exam from this page?
  5. What would students misunderstand?
  6. What must be remembered tomorrow?
  7. Could the page be reconstructed from these highlights alone? → If no, revise.

5-COLOR ROLE SYSTEM (select ONE anchor per applicable role, 2–4 total):
  anchorType "thesis"      🟡 Yellow — REQUIRED. The governing idea — what this page is fundamentally teaching.
                              Not a detail, not a list item — the one idea the whole page builds on.
  anchorType "definition"  🔵 Blue   — Core concept definition — what the key term IS. The foundational meaning.
  anchorType "mechanism"   🟢 Green  — How or why it works. Cause → effect. The causal chain.
  anchorType "trap"        🩷 Pink   — Common confusion, misconception, contrast, or exam trap.
  anchorType "application" 🟣 Purple — Real-world use, clinical relevance, experiment, or worked example.

WHAT GOOD HIGHLIGHTS DO:
  ✓ Compress understanding — the full page in minimal text
  ✓ Reveal structure — show how the page is organized around an idea
  ✓ Show causality — expose the mechanism chain
  ✓ Preserve relationships — how concepts connect to each other
  ✓ Expose mechanisms — not just what, but how and why
  ✓ Expose contrasts — what this is and what it is NOT
  ✓ Preserve memory anchors — the one fact that must survive tomorrow

WHAT BAD HIGHLIGHTS ARE:
  ✗ Isolated fragments with no page-level relevance
  ✗ Filler or decorative highlighting
  ✗ Disconnected facts that don't build understanding
  ✗ Redundant highlights that repeat each other
  ✗ Generic definitions without mechanism or relevance
  ✗ One step in a process when the page teaches the whole process
  ✗ Sentences that are locally "important" but miss the page-level picture

GOLD STANDARD EXAMPLE — Campbell Biology, Elements & Compounds (pages 78–79):
  🟡 thesis:      "Matter is made up of elements."
     Why: entire page depends on this; shortest governing concept; immediately orients the student.
  🔵 definition:  "An element is a substance that cannot be broken down to other substances by chemical reactions."
     Why: foundational definition; teaches what "element" actually means; the page builds from this.
  🟢 mechanism:   "When elements combine in fixed ratios, they form compounds with properties different from those of the constituent elements."
     Why: explains HOW compounds arise — the causal rule that unlocks the rest of the page.
  🟣 application: "When chemically combined, however, sodium and chlorine form an edible compound."
     Why: converts abstraction to understanding; shows why mechanism matters in reality.

  NOT highlighted: "Rocks, metals, oils, gases…" → filler. Figure captions → discard.
  Random narrow details → miss the page picture. Long paragraph summaries → too broad.

QUALITY RULES (copy verbatim from RAW PAGE TEXT when provided):
• VERBATIM: Copy text exactly — no paraphrase, no rewording.
• COMPLETE: Full grammatical sentence or clause (≤ 30 words). Never a fragment.
• SENTENCE-ENDING: Prefer spans ending with a period — they match the PDF text layer reliably.
• RECONSTRUCTION TEST: Do these highlights together let the student reconstruct the page mentally?

REJECT any span that is:
• A figure caption ("Figure 2.2...", "See Figure...", "Table 3.1...") → DISCARD
• Filler/boilerplate ("In this chapter...", "We will discuss...") → DISCARD
• A fragment under 8 words or missing subject/verb → DISCARD
• A repeat of information covered by another selected anchor → DISCARD
• Publisher debris (copyright, chapter headers, page numbers) → DISCARD
• A narrow local detail when the page teaches the whole process

FAILURE MODE (avoid): Selecting a precise mechanism sentence that misses the page-level teaching.
Example (wrong for a page about adaptation): highlighting "Nickel ions inhibit enzyme activity"
when the page teaches HOW ORGANISMS EVOLVE TOLERANCE. The adaptation story is the thesis —
the enzyme mechanism is one supporting detail.

VISUAL TRUST PRINCIPLE: When the student sees these highlights, they must immediately feel:
"The AI understood this page." — not "random sentences were marked."
Quality over quantity. 2 sharp anchors beat 6 weak ones.
Return null ONLY if the page has fewer than 3 real instructional sentences.

─── PAGE CHECKPOINT — AFTER-READING TEST ────────────────────────────────────
miniTestItems: Generate 4–5 structured after-reading comprehension questions.
These test whether the student UNDERSTOOD the page after reading it.
Use ALL of these types in order:
  1. type "multiple-choice"    — 4 options (A=correct, B/C/D=plausible wrong); tests governing concept
  2. type "short-answer"       — 1–2 sentence model answer; tests mechanism or cause-effect
  3. type "application"        — tests real-world use or clinical implication; model answer 1–2 sentences
  4. type "fill-in-the-blank"  — phrase with one key term blanked out; correctAnswer = the missing term
  5. type "trap"               — asks "what is the common mistake?"; correctAnswer = the misconception + correction
For each: question (clear exam-style), options (MC only, null for others), correctAnswer, explanation (1–2 sentences).
Return null if the page has fewer than 3 instructional sentences.

─── PRE-READ RECALL — BEFORE-READING DIAGNOSTIC ─────────────────────────────
preReadRecallItems: Generate 3–5 questions a student should attempt BEFORE reading the page.
Goal: activate prior knowledge and surface gaps — NOT test comprehension.
These are PREDICTION questions based on the topic, not comprehension questions about what the page says.
  • "multiple-choice"    — 4 options; tests what a student with prior coursework might already know
  • "short-answer"       — prediction: "What do you think X means/causes?"
  • "fill-in-the-blank"  — fill in a foundational term from prior courses
  • "trap"               — "Which common belief about X is actually wrong?"
  • "application"        — "How would you expect X to behave given Y?"
correctAnswer: what a student who already knows this topic would say.
Return null if the page is too introductory to have meaningful prior-knowledge questions.

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
  const { domain, pageObjective, pageThesis, pageSummary, pageNumber, pageText, rankedConcepts } = input;

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

  const rawTextSection = pageText
    ? `\n─── RAW PAGE TEXT (first 1200 chars — use this to select VERBATIM highlight spans) ───\n${pageText.slice(0, 1200)}`
    : "";

  return `DOMAIN: ${domain}

─── PAGE CONTEXT (primary anchor — what this page is actually teaching) ───
${pageContext}
${rawTextSection}

─── EXTRACTED CONCEPTS (WARNING: may contain figure captions or OCR fragments — you must INTERPRET these, not copy them) ───
${conceptList}

─── PROFESSOR 2-MINUTE TEST ───────────────────────────────────────────────
${domainQuestion[domain] ?? domainQuestion.general}

Ask yourself: "If a world-class professor had 2 minutes to teach this page, what would they say?"
The answer must be about UNDERSTANDING, not about what appears in a figure or what sentences exist.

─── TASK ──────────────────────────────────────────────────────────────────
Produce a structured educational interpretation for this page.

For page level: coreIdea, mechanism, rule, trap, application, teachingObjective, examCriticalIdea, reasoningFlow, misconceptionAlert, memoryAnchor, externalStudyLinks, highlightAnchors (2–4 sharp anchors answering "What is this page teaching?"), miniTestItems (4–5 questions: MCQ + short-answer + application + fill-in-blank + trap), relatedVideoQueries.
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
  coreIdea:             z.string(),
  highlightAnchors:     z.array(SynthHighlightAnchorSchema).nullable(),
  miniTestItems:        z.array(MiniTestItemSchema).nullable(),
  preReadRecallItems:   z.array(MiniTestItemSchema).nullable(),
});
export type Stage1Synthesis = z.infer<typeof Stage1SynthesisSchema>;

export function buildStage1SystemPrompt(domain: PageDomain): string {
  return `You are a world-class ${domain} educator. Extract exactly 4 things from the page content provided:

1. coreIdea — The governing principle in ONE precise, complete sentence (≤20 words). What a professor would write on the board first.

2. highlightAnchors — COGNITIVE RECONSTRUCTION ANCHORS (not annotations). Read the full page
   first, understand the thesis + mechanism + application + trap holistically, THEN select the
   minimum 2–4 verbatim spans that together allow a student to mentally rebuild the whole page.
   INTERNAL TEST: "If the student only saw these tomorrow, could they reconstruct the page?"
   TARGET: thesis (required) + definition + mechanism + trap/application if present.
   Copy text EXACTLY from source (≤30 words each, complete sentences, prefer period-ending).
   REJECT: figure captions, filler, isolated fragments, narrow details that miss the page picture.
   Return null only if < 3 real instructional sentences.

3. miniTestItems — 3 after-reading comprehension questions:
   • Question 1: multiple-choice — 4 options (A=correct, B/C/D=wrong), tests main concept.
   • Question 2: short-answer — model answer 1–2 sentences, tests mechanism.
   • Question 3: fill-in-the-blank or trap — fill-blank: phrase with key term blanked; trap: "what is the common mistake?" with correction.
   Include a 1-sentence explanation for each.

4. preReadRecallItems — 2–3 BEFORE-reading prediction questions (activate prior knowledge, not test comprehension):
   • Question 1: multiple-choice — what might a student with prior coursework already know about this topic?
   • Question 2: short-answer prediction — "What do you think X means/causes?"
   • Question 3 (optional): fill-in-the-blank or trap from prior courses.
   correctAnswer: what a student who already knows this topic would say.
   Return null if the page is too introductory to have meaningful prior-knowledge questions.

Be fast and precise. Do NOT elaborate beyond the schema fields.`;
}

export function buildStage1UserPrompt(input: SynthesisInput): string {
  const { domain, pageThesis, pageObjective, pageText, rankedConcepts } = input;
  const context = [pageThesis, pageObjective].filter(Boolean).slice(0, 2).join("\n");
  const concepts = rankedConcepts.slice(0, 3).map((c, i) =>
    `${i + 1}. [${c.role.toUpperCase()}] "${c.title}"\n   "${c.text.slice(0, 220)}"`
  ).join("\n\n");
  const rawSection = pageText
    ? `\nRAW PAGE TEXT (use for verbatim highlight spans):\n${pageText.slice(0, 800)}\n`
    : "";
  return `DOMAIN: ${domain}\n\nPAGE CONTEXT:\n${context || "(derive from concepts below)"}${rawSection}\n\nKEY CONCEPTS:\n${concepts}\n\nExtract: coreIdea, highlightAnchors (2–4 sharp verbatim spans — thesis + mechanism + trap/examSignal), miniTestItems (1 MC + 1 short-answer + 1 fill-blank or trap), preReadRecallItems (2–3 before-reading prediction questions, null if too introductory).`;
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
    miniTests:           null,
    miniTestItems:       stage1.miniTestItems,
    preReadRecallItems:  stage1.preReadRecallItems,
    highlightAnchors:    stage1.highlightAnchors,
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
  pageText?: string,
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

  return { domain, pageObjective, pageThesis, pageSummary, pageNumber, pageText, rankedConcepts: chunkedConcepts };
}
