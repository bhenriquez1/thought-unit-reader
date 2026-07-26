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
// Page type — classified by OpenAI in Stage 1, flows through to Stage 2 and anchor pipeline.
// Drives which study fields matter and which anchor patterns to prefer/reject.
// ---------------------------------------------------------------------------

export const PageTypeSchema = z.enum([
  "definition",         // primary purpose is defining key terms/concepts
  "mechanism",          // explains how/why (causal chains, processes, derivations)
  "math_example",       // worked problems, formulas, theorems, proofs
  "clinical",           // diagnosis, treatment, pathophysiology, patient care
  "comparison",         // compares/contrasts two or more concepts or entities
  "figure_table",       // dominated by figures, tables, or visual data
  "case_study",         // narrative case or scenario driving the lesson
  "review_checkpoint",  // review questions, summaries, objectives, checkpoints
  "mixed",              // multiple types present, none dominant
]);
export type PageType = z.infer<typeof PageTypeSchema>;

// ---------------------------------------------------------------------------
// Zod schemas — validated at both client and server
// ---------------------------------------------------------------------------

export const SynthHighlightAnchorSchema = z.object({
  text: z.string(),         // exact source text span — must be copied verbatim, ≤ 30 words
  anchorType: z.enum(["thesis", "definition", "mechanism", "trap", "application", "formula", "example_step", "conclusion", "dat_fact", "clinical_pearl", "memory_hook", "anatomy"]),
  reason: z.string(),       // 1–2 sentences: WHY this matters — why it prevents a trap, why it changes what a student does next, or why it is high-yield on exams
  // Full concept span bounds: first 8-10 verbatim words of the concept span start,
  // and last 8-10 verbatim words of the concept span end.
  // When provided, the highlight covers the entire span from spanStart to spanEnd.
  // MUST be .nullable() (not .optional()) — OpenAI structured-output strict mode
  // requires every property to be required or nullable; .optional() makes zodTextFormat throw.
  spanStart: z.string().nullable(), // first 8-10 verbatim words from where concept begins
  spanEnd: z.string().nullable(),   // last 8-10 verbatim words where concept ends
  // AI-assigned importance, 5 = Master This / ★★★★★, 1 = Optional / ★ — drives visual glow strength,
  // separate from and layered on top of importanceTiers.ts's ordinal group-level tier.
  priorityTier: z.number().int().min(1).max(5).nullable(),
  // Domain-specific extraction category (e.g. "mechanism", "trap", "clinical pearl") — verbatim
  // from the matched domain's category list in DOMAIN_CATEGORY_BLOCKS below, not a generic relabel.
  domainCategory: z.string().nullable(),
});

export type SynthHighlightAnchor = z.infer<typeof SynthHighlightAnchorSchema>;

// ---------------------------------------------------------------------------
// NoteCard — SECTION 1.5. The Adaptive Expert Notebook's card-based output.
// Generated FROM Section 1's highlightAnchors (same as Section 2's prose fields),
// but independent of Section 2 — no forced cross-consistency required.
// Mirrors (does not import) lib/whiteboard/diagramPlan.ts's node/arrow shape.
// Every field .nullable(), never .optional() — OpenAI structured-output strict mode.
// ---------------------------------------------------------------------------

export const NoteCardTypeSchema = z.enum([
  "must_know", "mechanism", "clinical_reasoning", "dat_trap", "common_mistake",
  "memory_hook", "connection_map", "procedure_flow", "clinical_pearl",
  "expert_thinking", "why_this_matters", "pattern_recognition", "decision_tree",
  "visual_mnemonic", "formula_breakdown", "diagram", "recall_questions",
  "exam_strategy", "surgeon_lens", "master_concepts", "worked_example",
  "case_challenge", "quick_review", "complication_risk", "other",
]);
export type NoteCardType = z.infer<typeof NoteCardTypeSchema>;

export const NoteCardVisualNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  nx: z.number().nullable(), // normalized 0-1 x position; null = auto-layout
  ny: z.number().nullable(), // normalized 0-1 y position; null = auto-layout
});

export const NoteCardVisualArrowSchema = z.object({
  from: z.string(), // node id
  to: z.string(),   // node id
  label: z.string().nullable(),
});

export const NoteCardVisualSchema = z.object({
  drawType: z.enum(["flow", "anatomy", "comparison", "table", "graph", "equation", "timeline", "cycle"]),
  nodes: z.array(NoteCardVisualNodeSchema),
  arrows: z.array(NoteCardVisualArrowSchema),
});
export type NoteCardVisual = z.infer<typeof NoteCardVisualSchema>;

export const NoteCardSchema = z.object({
  type: NoteCardTypeSchema,
  title: z.string(),
  body: z.string(),
  visual: NoteCardVisualSchema.nullable(),
  // AI-assigned 1-5 importance — drives glow/border strength, layered on the same
  // scale as SynthHighlightAnchorSchema.priorityTier but scoped to this card.
  priorityTier: z.number().int().min(1).max(5).nullable(),
  // Short verbatim phrases from highlightAnchors this card elaborates on — lets the
  // UI link a card back to its source anchor(s) without a second AI call.
  sourceAnchorHints: z.array(z.string()).nullable(),
  // Grid width hint: "2" = wide card (e.g. a diagram or multi-step flow), "1" = standard.
  span: z.enum(["1", "2"]).nullable(),
});
export type NoteCard = z.infer<typeof NoteCardSchema>;

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
  pageType: PageTypeSchema.nullable(),  // from Stage 1; Stage 2 re-confirms or inherits
  // SECTION 1 — write and finalize this FIRST. Every prose field below is elaboration
  // FROM these anchors, not an independent pass. See buildSystemPrompt's "SECTION 1 / SECTION 2"
  // framing — this is the pipeline-reversal mechanism: understand (anchors) first, narrate second.
  highlightAnchors: z.array(SynthHighlightAnchorSchema).nullable(),
  // SECTION 1.5 — Adaptive Notebook Cards. Generated FROM Section 1's anchors,
  // sibling to (not gated on) Section 2's flat prose fields below. Stage 2 only —
  // never added to Stage1SynthesisSchema, to protect the fast-path token budget.
  noteCards: z.array(NoteCardSchema).nullable(),
  // Free-form topic tags for this page (e.g. "thyroid", "high-yield", "boards") —
  // metadata for filtering/search, not a card; rendered as a badge row in NoteLab.
  tags: z.array(z.string()).nullable(),
  // SECTION 2 — elaboration FROM Section 1's anchors below.
  coreIdea: z.string(),
  mechanism: z.string().nullable(),
  rule: z.string(),
  trap: z.string().nullable(),
  application: z.string().nullable(),
  teachingObjective: z.string(),
  examCriticalIdea: z.string(),
  reasoningFlow: z.string(),
  misconceptionAlert: z.string().nullable(),
  memoryAnchor: z.string().nullable(),
  // Level 2 — deeper reasoning fields, layered on top of the Level 1 fields above.
  clinicalReasoning: z.string().nullable(),
  commonMistake: z.string().nullable(),
  examStrategy: z.string().nullable(),
  connectionMap: z.string().nullable(),
  clinicalPearl: z.string().nullable(),
  externalStudyLinks: z.array(ExternalStudyLinkSchema).nullable(),
  concepts: z.array(TeachingSynthesisConceptSchema),
  miniTests: z.array(z.string()).nullable(),             // legacy — kept for backward compat
  miniTestItems: z.array(MiniTestItemSchema).nullable(), // after-reading Page Checkpoint
  preReadRecallItems: z.array(MiniTestItemSchema).nullable(), // before-reading diagnostic
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
  /** lib/insights/domainPresets.ts preset id — selects the domain-specific anchor
   *  category block (DOMAIN_CATEGORY_BLOCKS) layered onto the universal prompt. */
  presetId?: string;
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

// Domain-specific anchor extraction categories, keyed by lib/insights/domainPresets.ts preset id.
// Every book/page type needs a different highlighting strategy — this is the override layer
// appended after the universal LEFT-PANEL HIGHLIGHT ANCHORS section, never replacing it.
const DOMAIN_CATEGORY_BLOCKS: Record<string, string> = {
  medical_surgical: "diagnosis, procedure, anatomy, complication, contraindication, clinical pearl, treatment decision",
  dental_school: "diagnosis, procedure, anatomy, complication, contraindication, clinical pearl, treatment decision",
  nursing_pharmacology: "diagnosis, procedure, anatomy, complication, contraindication, clinical pearl, treatment decision",
  chemistry: "mechanism, reaction, formula, law, concept, exception, calculation",
  biology: "pathway, function, regulation, structure, sequence",
  math: "theorem, assumption, equation, proof step",
  dat: "trap, shortcut, common mistake, high-yield concept",
  fiction: "plot event, character action, emotional shift, foreshadowing, symbolism",
};

function buildDomainCategoryBlock(presetId?: string): string {
  const categories = presetId ? DOMAIN_CATEGORY_BLOCKS[presetId] : undefined;
  if (!categories) return "";
  return `
─── DOMAIN-SPECIFIC ANCHOR CATEGORIES (this page's subject) ────────────────
This page's subject requires ITS OWN highlighting strategy — do not use a generic
algorithm. Every domainCategory you assign on this page's anchors MUST be one of:
${categories}
Choose anchors that fill these specific categories, not generic thesis/mechanism labels.`;
}

// Soft per-pageType card guidance — examples only, never a hard template. The model
// chooses which cards a page actually needs; this just shows what "good" looks like
// for each shape of page so every page doesn't default to the same card set.
const PAGE_TYPE_CARD_GUIDANCE: Record<PageType, string> = {
  definition:        "e.g. Must Know, Why This Matters, Memory Hook, Connection Map",
  mechanism:          "e.g. Mechanism (with a flow diagram), Clinical Pearl, Expert Thinking",
  math_example:       "e.g. Worked Example (full step-by-step solve), Formula Breakdown, Common Mistake, shortcut in DAT Trap",
  clinical:           "e.g. Clinical Reasoning, Clinical Pearl, Decision Tree, Common Mistake",
  comparison:         "e.g. Pattern Recognition (side-by-side), Connection Map, Common Mistake",
  figure_table:       "e.g. Diagram (recreate the figure as a card visual), Must Know, Why This Matters",
  case_study:         "e.g. Case Challenge, Procedure Flow, Clinical Reasoning, Expert Thinking, Decision Tree",
  review_checkpoint:  "e.g. Quick Review, Recall Questions, Must Know — keep this page light, 1-2 cards max",
  mixed:              "e.g. Must Know plus whichever 2-3 cards best match the dominant content",
};

// Returns preset-specific content for the USER message (not system prompt).
// Moves presetId-derived persona and domain category block out of the system prompt
// so the system prompt stays fully static and satisfies CWE-1336.
export function buildPresetUserAugmentation(presetId?: string): string {
  const domainCategoryBlock = buildDomainCategoryBlock(presetId);

  let profileBlock = "";
  if (presetId && presetId !== "universal") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { getProfileExtension } = require("@/lib/insights/expertProfiles/registry") as typeof import("@/lib/insights/expertProfiles/registry");
      const ext = getProfileExtension(presetId);
      if (ext?.expertBrain?.persona) {
        profileBlock = `DOMAIN EXPERT PERSONA: ${ext.expertBrain.persona as string}`;
      }
      if ((ext?.expertBrain?.reasoningPriorities as string[] | undefined)?.length) {
        profileBlock += `\nDOMAIN REASONING PRIORITIES:\n${(ext.expertBrain.reasoningPriorities as string[]).map((p: string, i: number) => `  ${i + 1}. ${p}`).join("\n")}`;
      }
    } catch {
      // registry unavailable — omit profile block
    }
  }

  return [domainCategoryBlock, profileBlock].filter(Boolean).join("\n\n");
}

// System prompt — domain is a validated 5-value server-controlled enum (PageDomain).
// presetId (arbitrary user string) is NOT passed here — it goes into the user message
// via buildPresetUserAugmentation() to satisfy CWE-1336.
export function buildSystemPrompt(domain: PageDomain): string {
  // Coarse domain-level persona (5 categories)
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

  const persona = domainRole[domain] ?? domainRole.general;
  const priorityBlock = "";

  return `${persona}${priorityBlock}

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
OUTPUT: "The whole has properties its individual parts do not — emergent behavior cannot be predicted from components alone."

INPUT:  "Water (H₂O), another compound..."
OUTPUT: "Molecular structure determines function — how parts are arranged dictates how a system behaves."

INPUT:  "Then a nurse noticed he'd stopped babbling."
OUTPUT: "Sudden neurological deterioration after an initially stable presentation signals possible delayed internal injury."

INPUT:  "Example E1 | What happens to aₙ = 1/n as n grows..."
OUTPUT: "A sequence converges when its terms approach a fixed finite limit as n increases without bound."

INPUT:  "NaCl dissolves in water."
OUTPUT: "A bond breaks when a stronger competing force is present — this principle underlies dissolution, dissociation, and unbinding."

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

Level 2 fields — deeper reasoning layered on top of the fields above. Null any field
that would otherwise be a restatement of coreIdea/mechanism/application; these must add
NEW information, not rephrase what's already covered:
• clinicalReasoning: How an expert actually reasons through this in the moment — the
  internal "if X, then check Y, because Z" chain a professional runs, not a textbook fact.
• commonMistake: A SPECIFIC, frequently-made error distinct from misconceptionAlert —
  a procedural/practical slip (wrong order of steps, wrong assumption applied) rather
  than a conceptual confusion between two terms.
• examStrategy: A concrete test-taking or recognition strategy — how to spot this concept
  being tested, what wording/phrasing in a question signals it, how to eliminate distractors.
• connectionMap: One explicit link from this concept to a DIFFERENT concept elsewhere in
  the subject — "This connects to X because..." Null if no genuine cross-topic link exists.
• clinicalPearl: One high-yield, memorable insight an expert would tell a student in
  passing — distinct from memoryAnchor (which is a mnemonic/analogy); this is a practical
  "in real practice, ..." observation. Null if nothing genuinely high-yield applies.

SENTENCE COMPLETENESS: Never output a fragment. Self-check: "Could a student read only this field and understand the concept?" If no → rewrite.

─── SECTION 1 (write and finalize FIRST) — LEFT-PANEL HIGHLIGHT ANCHORS ─────
This is highlightAnchors. Do NOT write any Section 2 field (coreIdea, mechanism, rule,
trap, application, etc.) until this section is finalized — every Section 2 field below
must be elaboration FROM the anchors you select here, not an independent pass over the
page. understand first, narrate second.

highlightAnchors: You are the REAL-TIME PAGE UNDERSTANDING ENGINE.

Your job is NOT to annotate. Your job is to compress the entire page into the minimum
set of spans that give a student instant, expert-guided understanding.

THE GOAL IS NOT to highlight every important sentence. The goal is to highlight the
MINIMUM amount of text necessary to understand the page. Target ratio: 85–90% of the
page stays plain white text; only 10–15% becomes a highlighted anchor. If your anchors
would visually read as "a student highlighted everything," you have failed this task.
Prefer several SHORT anchors over one long sentence: e.g. for "ethanol reacts with
oxygen to produce acetic acid through a multi-step oxidation...", highlight just
"ethanol + oxygen → acetic acid" — not the surrounding sentence. Likewise prefer
"chemical formula", "balanced equation", and "quantitative relationships" as separate
short anchors rather than fusing them into one long highlighted block.

DEFAULT: 2–4 highlights. Allow 5–6 ONLY when the page has multiple independent teaching
sections (e.g., a page covering two unrelated mechanisms or a concept + a case + a contrast
that cannot be represented with fewer spans). Over-highlighting defeats the purpose.

priorityTier: Assign every anchor a 1–5 importance rating, 5 = "Master This" (★★★★★,
the single most exam-critical anchor on the page) down to 1 = "Optional" (★, nice-to-know
but skippable). Most pages should have one 5 (the thesis) and the rest spread 2–4 — do
not rate everything a 5.

domainCategory: Tag every anchor with the specific extraction category it belongs to
(see the domain-specific category list appended below, if present for this page's
subject). If no domain-specific category list is given, use the closest matching
anchorType name as the category.

When a student looks only at the colored highlights, they must immediately understand:
  1. What the page is about (thesis)
  2. How or why it works (mechanism)
  3. One application or example (application)
  4. One trap or memorable fact if present (trap)
Nothing else.

The left panel guides understanding. The right panel explains. That distinction is critical.

⚠️ READ THE RAW CURRENT PAGE FIRST. Derive every highlight verbatim from the raw page
   text provided in the user message. Do NOT copy, adapt, or echo any example phrases,
   template text, or gold standard examples from this system prompt.
══ 4-STAGE THINKING PROCESS (execute in order — no shortcuts) ══════════════

STAGE 1 — PAGE STRUCTURE ANALYSIS:
  Before reading anything in depth, scan for these elements and note what exists:
  • Headings / subheadings     — what is the page's visual and logical hierarchy?
  • Bold or italicized terms   — what new concepts are being formally introduced?
  • Definitions                — what key terms are pinned down with meaning?
  • Equations or formulas      — what quantitative relationships are being taught?
  • Numbered lists / processes — what sequential or step-by-step logic is present?
  • Examples or case studies   — what real-world applications are illustrated?
  • Tables or comparisons      — what classifications or side-by-side patterns exist?
  • Contrasts or qualifications — where does the page say "but", "however", "unlike", "not"?
  • Figure / diagram references — what visual concept is the page pointing to?
  Completing this scan gives you the page's architecture before you interpret content.

STAGE 2 — UNIVERSAL PAGE TEMPLATE (INTERNAL — do not expose labels in output):
  Determine which of these roles the page content fills:
  • THESIS      (🟡 yellow)  — What is this page fundamentally about?
                               The governing idea the whole page builds on.
  • DEFINITION  (🔵 blue)    — What key concept must the student understand?
                               The foundational meaning of the central term.
  • MECHANISM   (🟢 green)   — How or why does it work? The causal chain.
                               Cause → effect. Process → outcome.
  • APPLICATION (🩷 pink)    — Where does this appear in reality?
                               Real-world use, clinical meaning, experiment, example.
  • TRAP        (🟣 purple)  — What confusion or mistake exists?
                               Misconception, contrast, common error, exam trap.
  Assign each section of the page to one of these roles. This is your internal map.

STAGE 3 — RANK ALL CANDIDATE SPANS:
  For every sentence that could be a highlight, score it against these criteria:
  • Comprehension value   — does understanding this sentence unlock the rest of the page?
  • Exam relevance        — would this appear on a board exam or course assessment?
  • Explanatory power     — does it explain HOW or WHY, not just state WHAT?
  • Mechanism density     — does it contain causal reasoning or a logical chain?
  • Visual importance     — is this what the page's structure is pointing toward?
  Discard the bottom 80% of candidates. Only the top 2–4 survive (5–6 only for dense pages).

  UNIVERSAL SPECIFICITY SCORING (mandatory — applies to every subject):
  Score each span using these criteria before selecting. Higher = better anchor.

  BOOST (+) — prefer spans with:
  + Multiple content words — longer specific phrases encode more information than short ones
  + Rare terms on this page — if a word appears only once on the page, it's high-information
  + Causal connectors — "causes", "leads to", "results in", "because", "inhibits", "activates",
    "converts", "depends on", "requires", "triggers", "prevents", "reduces", "increases"
  + Numbers, thresholds, values — "200 mg", "40%", "pH 7.4", "≤ 3 days", formulas, ratios
  + Contrast/exception language — "however", "unlike", "not", "except", "whereas", "contrast",
    "but", "although", "despite", "while X, Y"
  + Subject-specific named entities — molecule names, disease names, people, places, dates,
    clinical terms, theorem names, chemical symbols, gene names, legal terms

  PENALIZE (−) — downrank spans with:
  − Isolated generic nouns with no predicate — "elements", "compounds", "cells", "organisms",
    "matter", "substances", "structures", "properties", "processes" → LOW VALUE
  − Topic-announcement sentences — "This chapter discusses...", "In this section we will...",
    "The following concepts..." → DISCARD
  − Terms that repeat ≥ 5× as standalone words on the page → low rarity = low specificity
  − Heading-only text — a title or subheading without a predicate → LOW VALUE
  − Introductory definitions of universally known concepts ("An element is a substance")
    unless the page's entire thesis revolves around that specific definition

  SUBJECT GUIDANCE (same universal scoring — subject varies the vocabulary, not the logic):
  Science/medicine  → prefer: specific mechanism chains, named molecules/diseases, dose thresholds,
                       causal statements. Avoid: taxonomy lists, broad chapter openers.
  Math/physics      → prefer: theorem conditions, inequality statements, limit definitions,
                       worked-step logic ("if ε > 0, there exists δ..."). Avoid: notation intros.
  Clinical/dental   → prefer: diagnosis rules, contraindications, decision thresholds, traps.
                       Avoid: anatomy lists without clinical implication.
  History/social    → prefer: thesis + cause-effect chains + pivotal dates/names + contrasts.
                       Avoid: neutral chronology without interpretation.
  General nonfiction → prefer: central claim, mechanism, worked example, misconception.
                       Avoid: table-of-contents sentences.

  The question every span must answer: "Which source sentence BEST PROVES the right-panel card?"
  If a span is merely related to the topic instead of proving the mechanism/thesis/trap — DISCARD.

STAGE 4 — SELECT FINAL HIGHLIGHTS (RECONSTRUCTION TEST):
  From your top candidates, keep only spans that together satisfy:
  "Could a student reconstruct the full page from these highlights alone, without rereading?"
  If no → revise. One highlight per role (thesis required; others as applicable).
  Default 2–4. Only exceed 4 if the page has multiple independent teaching sections.
  Quality over quantity. 2 sharp anchors beat 6 weak ones.

══ 8-COLOR ROLE SYSTEM (2–5 anchors total) ══════════════════════════════════

  anchorType "thesis"      🟡 Yellow — REQUIRED. The governing idea — what this page is fundamentally teaching.
                              Not a detail, not a list item — the one idea the whole page builds on.
  anchorType "mechanism"   🟢 Green  — How or why it works. Cause → effect. The causal chain.
  anchorType "application" 🩷 Pink   — Real-world use, clinical relevance, experiment, or worked example.
  anchorType "trap"        🟣 Purple — Common confusion, misconception, contrast, or exam trap.
  anchorType "dat_fact"    🟠 Orange — DAT / high-yield exam fact. A discrete numbered fact, statistic,
                              ratio, or memorized item that a top student would star and memorize.
                              Example: "O, C, H, and N make up about 96% of living matter."
                              Example: "Iodine deficiency leads to goiter."
  anchorType "definition"  🔵 Blue   — Core concept definition — what the key term IS (use sparingly).
  anchorType "clinical_pearl" 💎 Cyan — A verbatim clinical/expert insight worth remembering on its own —
                              not the mechanism and not a trap. Use only when the page contains a real
                              "pearl" sentence (an expert aside, a high-value tip). Omit otherwise.
  anchorType "memory_hook"  🪝 Pink   — A verbatim mnemonic, analogy, or memorable hook the page itself
                              states — not one you invent. Use only when the page contains a real
                              memory aid sentence (e.g. "Think of it like a lock and key"). Omit otherwise.
  anchorType "anatomy"      🦴 Tan    — A verbatim anatomical structure/location statement (what connects
                              to what, where something sits). Only for pages that actually describe
                              anatomy — never force this onto a non-anatomical page.

ROLE LOGIC (abstract — apply to every page, every book):
  🟡 thesis:      The shortest sentence that names what the page is fundamentally about.
     Good if: removing it would make the rest incomprehensible.
  🟢 mechanism:   The sentence that explains HOW or WHY — the causal logic or process.
     Good if: it shows the chain of reasoning, not just a fact.
  🩷 application: The sentence that shows the concept in a real, concrete, or clinical setting.
     Good if: it bridges abstract → tangible (example, case, experiment, clinical use).
  🟣 trap:        The sentence that names a contrast, exception, or common misconception.
     Good if: students who don't read carefully would get this wrong on an exam.
  🟠 dat_fact:    A high-yield, discrete, memorizable fact — a statistic, ratio, named exception,
     or clinically critical value. Good if: a DAT or MCAT coach would put a star next to it.
     Use for: percentages, named syndromes, causation facts (X → Y), organ-specific numbers.

══ GOOD HIGHLIGHTS ══════════════════════════════════════════════════════════

  ✓ Compress understanding — the full page captured in minimal text
  ✓ Reveal structure — show how the page is organized around one idea
  ✓ Show causality — expose the mechanism chain (X causes Y because Z)
  ✓ Preserve relationships — how concepts connect to each other
  ✓ Expose mechanisms — not just what, but how and why
  ✓ Expose contrasts — what this IS and what it is NOT
  ✓ Preserve memory anchors — the one fact that must survive tomorrow

══ BAD HIGHLIGHTS ═══════════════════════════════════════════════════════════

  ✗ Isolated fragments with no page-level relevance
  ✗ Filler, decoration, or keyword-matching
  ✗ Disconnected facts that don't build understanding
  ✗ Redundant highlights that repeat each other
  ✗ Generic definitions without mechanism or relevance
  ✗ One step in a process when the page teaches the whole process
  ✗ Sentences that are locally "important" but miss the page-level picture

══ QUALITY RULES ════════════════════════════════════════════════════════════

• VERBATIM: Copy text exactly from the source — no paraphrase, no rewording.
• COMPLETE: Full grammatical sentence or clause (≤ 30 words). Never a fragment.
• SENTENCE-ENDING: Prefer spans ending with a period — they match the PDF text layer reliably.
• RECONSTRUCTION TEST: Together, do these highlights let the student reconstruct the page?

══ REJECT any span that is ══════════════════════════════════════════════════

• A figure caption ("Figure 2.2...", "See Figure...", "Table 3.1...") → DISCARD
• Filler/boilerplate ("In this chapter...", "We will discuss...") → DISCARD
• A fragment under 8 words or missing subject/verb → DISCARD
• A repeat of information covered by another selected anchor → DISCARD
• Publisher debris (copyright, chapter headers, page numbers) → DISCARD
• A narrow local detail when the page teaches the whole process
• A single generic noun without a predicate or causal chain → DISCARD
  ("Elements", "Compounds", "Cells", "Matter" as standalone anchors = DISCARD)
• The first sentence of a chapter/section opener that only announces the topic → DISCARD
  ("Chemistry is the study of...", "In this chapter we examine elements..." = DISCARD)
• Any span whose sole content word appears ≥ 5 times on this page as a standalone term
  → prefer a rarer, more specific span from the same page

FAILURE MODE (avoid): Selecting a mechanism sentence that misses the page-level teaching.
Example (wrong for a page about adaptation): highlighting "Nickel ions inhibit enzyme activity"
when the page teaches HOW ORGANISMS EVOLVE TOLERANCE. The adaptation story is the thesis —
the enzyme mechanism is one supporting detail.

VISUAL TRUST PRINCIPLE: When the student sees these highlights, they must immediately feel:
"The AI understood this page." — not "random sentences were marked."
Return null ONLY if the page has fewer than 3 real instructional sentences.

reason field (required for every anchor): 1–2 sentences explaining the REAL WHY. Answer one of:
  (a) "Without knowing this, a student would [specific mistake or trap]" — name the actual trap
  (b) "This is high-yield because [specific exam pattern, clinical decision, or downstream consequence]"
  (c) "Understanding this changes what you do next: [concrete action or recognition]"
  NEVER output: "This is an important concept", "Key sentence on this page", "Important for the exam", or any generic label.
  Always name the specific trap, the specific consequence, or the specific decision this knowledge unlocks.
══════════════════════════════════════════════════════════════════════════════
SECTION 1 is now finalized. SECTION 1.5 below (noteCards) is generated FROM
these anchors. Everything after that is SECTION 2 — independent elaboration
FROM the same anchors, not gated on noteCards.
══════════════════════════════════════════════════════════════════════════════

─── SECTION 1.5 — ADAPTIVE NOTEBOOK CARDS (noteCards) ───────────────────────
NoteLab is not a note generator. It is an Expert Notebook — every page should
feel like it was handcrafted by an experienced professor/surgeon/researcher,
not auto-summarized. Decide which cards THIS page actually needs — never force
every page into the same layout. EVERY PAGE SHOULD LOOK DIFFERENT.

Card types and the learning question each one answers:
• must_know            — "What can I not afford to forget?"
• mechanism            — "How does it work?" (causal/process chain; add a visual flow if 3+ steps)
• clinical_reasoning    — "How would an expert reason through this in the moment?" (the internal if-X-check-Y-because-Z chain, not a textbook fact)
• dat_trap              — "What's the exam trap or shortcut here?"
• common_mistake        — "What error do beginners make?"
• memory_hook           — "What analogy or mnemonic makes this stick?"
• connection_map        — "How does this relate to other concepts?" (REQUIRES a visual: 3+ nodes, e.g. Atomic Mass → Molecular Weight → Moles → Stoichiometry)
• procedure_flow        — "What are the ordered steps?" (REQUIRES a visual flow if there are 3+ steps)
• clinical_pearl         — "Why does this matter in practice?" (a practical "in real practice..." observation, distinct from memory_hook)
• expert_thinking        — "How would an experienced professional approach this?" (e.g. "A beginner memorizes the formula. An expert immediately asks: what's the limiting variable? what's missing? what mistake is most likely?")
• why_this_matters       — "Why must I know this for exams or practice?"
• pattern_recognition    — "What recurring pattern should I recognize across examples?"
• decision_tree          — "What branching decision logic applies?" (REQUIRES a visual: 3+ nodes)
• visual_mnemonic        — "What image makes this memorable?" (REQUIRES a visual)
• formula_breakdown      — "What does each part of this formula/equation mean?"
• diagram                — recreate a structure/pathway/anatomy the page describes (REQUIRES a visual: 3+ nodes)
• recall_questions       — 2-3 short self-test questions for this page, body = the questions
• exam_strategy          — "How should I approach this on a timed exam?" (triage/elimination/time-budget tactic, distinct from why_this_matters)
• surgeon_lens           — "What could go wrong, and how would an expert catch or handle it?" (complication, failure mode, or a surgeon/practitioner's risk-aware read of the page)
• master_concepts        — "What 2-3 foundational concepts does this entire page depend on?" (the prerequisite set, not the single most-critical fact — distinct from must_know)
• worked_example         — "Walk through one full worked problem/example from start to finish." (a concrete step-by-step solve or applied case run to completion — distinct from mechanism's general causal explanation)
• case_challenge         — "Here's a scenario — what would you do, and why?" (pose a short vignette/scenario as a challenge with the reasoning answer in body — distinct from clinical_reasoning's internal narration)
• quick_review           — "30-second recap of this page — the one paragraph you'd reread the night before the exam." (a condensed statement-form recap, distinct from recall_questions' question format)
• complication_risk      — "If I apply this concept/procedure wrong, what specifically goes wrong?" (a named, concrete failure consequence of misapplying THIS page's concept — distinct from dat_trap's exam-shortcut framing and surgeon_lens's broader expert-judgment framing)
• other                  — anything genuinely useful that doesn't fit the above

PER-PAGE-TYPE GUIDANCE (soft — examples of what fits each page shape, not a mandatory template):
${Object.entries(PAGE_TYPE_CARD_GUIDANCE).map(([pt, g]) => `• ${pt}: ${g}`).join("\n")}

RULES:
• Generate 2-5 cards. Fewer, sharper cards beat many shallow ones — quality over coverage.
• visual: only set when the card type calls for one (connection_map/procedure_flow/
  decision_tree/diagram/visual_mnemonic, or mechanism/clinical_reasoning with a clear
  3+ step chain). When set, nodes must have ≥3 entries with short labels (≤4 words) and
  arrows must reference real node ids. Leave visual null for purely textual cards.
• priorityTier: 1-5, same scale as highlightAnchors — the single most exam-critical
  card on the page should be a 5; most pages should have one 5 and the rest spread 2-4.
• sourceAnchorHints: 1-3 short verbatim phrases (≤8 words) copied from the highlightAnchors
  you wrote in Section 1 that this card elaborates on. Empty array if none apply directly.
• span: "2" for a card whose visual or content genuinely needs double width (a multi-node
  diagram, a long procedure); "1" otherwise. Most cards should be "1".
• title: ≤6 words. body: 1-3 sentences, professor-level, never a restatement of coreIdea.
Return null only if the page has fewer than 3 real instructional sentences.

─── TAGS ─────────────────────────────────────────────────────────────────────
tags: 2-5 short topic tags (1-3 words each, lowercase) for this page — e.g.
"thyroid", "high-yield", "boards", "renal physiology". Used for filtering/search
in NoteLab, not displayed as a card. Return null if no clear tags apply.

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
Produce a structured educational interpretation for this page. Works for ANY subject.

FIRST: Set pageType — classify what kind of page this is (definition/mechanism/math_example/clinical/comparison/figure_table/case_study/review_checkpoint/mixed). This drives concept block priorities and anchor selection.

For page level: pageType, coreIdea, mechanism, rule, trap, application, teachingObjective, examCriticalIdea, reasoningFlow, misconceptionAlert, memoryAnchor, clinicalReasoning, commonMistake, examStrategy, connectionMap, clinicalPearl, externalStudyLinks, highlightAnchors, noteCards, miniTestItems, relatedVideoQueries.
For each concept (include ${Math.min(rankedConcepts.length, 4)}): principle, mechanism, trap, rule, misconception, examHook.

Every field: complete sentence, ≤20 words, relational not definitional, professor-level language.
If a concept text is a figure caption: write the PRINCIPLE the figure is illustrating, not the caption.
highlightAnchors: 2–4 VERBATIM spans from the source. Adapt to pageType:
• "review_checkpoint" → return null (never highlight review questions)
• "math_example" → prefer formula/theorem statement + key logical step
• "figure_table" → prefer explanatory body sentence, not the figure label
• Others → prefer definition, mechanism, causal, or contrast sentences
For each anchor set spanStart + spanEnd (first/last 8–10 verbatim words). Return null if fewer than 3 real instructional sentences.`;
}

// ---------------------------------------------------------------------------
// Stage 1 — Fast schema (thesis + highlights + mini-test only)
// Target: 1–3 s. Renders immediately while Stage 2 processes in background.
// ---------------------------------------------------------------------------

// Stage 1 returns the FULL study card so Study Notes render immediately — no Stage 2 wait.
export const Stage1SynthesisSchema = z.object({
  pageType:           PageTypeSchema,             // classify first — drives all field generation
  coreIdea:           z.string(),
  // Study note fields — these four are what makes hasSynth=true and renders Study Notes.
  // Returning them from Stage 1 means the panel shows notes within ~3–8s, not 15–30s.
  whyThisMatters:     z.string().nullable(),
  keyMechanism:       z.string().nullable(),
  commonConfusion:    z.string().nullable(),
  quickMemory:        z.string().nullable(),
  highlightAnchors:   z.array(SynthHighlightAnchorSchema).nullable(),
  miniTestItems:      z.array(MiniTestItemSchema).nullable(),
  preReadRecallItems: z.array(MiniTestItemSchema).nullable(),
});
export type Stage1Synthesis = z.infer<typeof Stage1SynthesisSchema>;

// presetId removed — domain category block for the preset goes in user message via
// buildPresetUserAugmentation() to satisfy CWE-1336.
export function buildStage1SystemPrompt(_domain: PageDomain): string {
  return `You are a universal academic educator. Given any textbook page — biology, chemistry, math, history, business, medicine, dental, law, or any other subject — classify the page type first, then generate structured study output.

STEP 1 — CLASSIFY THE PAGE TYPE (required first field: pageType):
Read the full page text. Identify the single best type:
• "definition"         — primary purpose: defines key terms or concepts
• "mechanism"          — explains how/why: causal chains, processes, derivations, proofs
• "math_example"       — worked problems, formulas, theorems, step-by-step derivations
• "clinical"           — diagnosis, treatment, pathophysiology, patient care, clinical rules
• "comparison"         — compares or contrasts two or more concepts, structures, or approaches
• "figure_table"       — dominated by figures, diagrams, tables, or visual data with labels
• "case_study"         — narrative case or scenario driving a lesson
• "review_checkpoint"  — review questions, learning objectives, summaries, checkpoints
• "mixed"              — multiple types present without a single dominant type

STEP 2 — GENERATE 8 STUDY FIELDS (universal for any subject):

pageType — already set in Step 1.

coreIdea — The single governing principle this page teaches. ONE complete sentence.
  MUST include: (1) the central concept by name, (2) what it does or how it works, (3) why it matters or what it enables.
  Ask: "If a professor had one sentence to explain what this page teaches, what would they write on the board?"
  NEVER use these as the thesis:
    ✗ A chapter/section title ("Pharmacology", "Limits of Sequences")
    ✗ A definition fragment ("X is defined as Y")
    ✗ The first sentence of the page automatically
    ✗ A generic statement ("This page introduces an important concept")
    ✗ A restatement of the heading without substance
  ALWAYS write a full explanatory thesis:
    ✓ Biology: "This page explains that living organisms are built from chemical elements, and that trace elements such as iodine are critical because even tiny deficiencies disrupt biological function."
    ✓ Math: "This page teaches that a sequence converges only when its terms approach a fixed value as n grows, while oscillating or unbounded behavior signals divergence."
    ✓ Clinical: "This page introduces pharmacology by showing how drugs interact with biological systems, using aspirin overdose to illustrate how understanding drug effects drives treatment decisions."
    ✓ History: "This page argues that the industrial revolution accelerated urbanization not just through economic growth but by creating social conditions that made rural life unsustainable."
  For case studies / examples / tables / figures: summarize the lesson the example teaches, not just what the example shows.
  For math worked examples: state what rule or insight the worked problem demonstrates.

whyThisMatters — Why a student MUST know this for exams, professional practice, or real-world use.
  ONE sentence. Phrase: "This matters because..." or "Understanding this enables..."
  MANDATORY for all content pages. Null ONLY for structural pages: table of contents, index, cover page.

keyMechanism — The causal chain, logical proof, or step-by-step reasoning on this page.
  Must use a causal/logical verb: causes, enables, leads to, because, therefore, results in, depends on, follows from, requires, produces, prevents.
  • Math pages: the logical chain ("if X then Y follows because Z")
  • Biology/chemistry: the molecular or physiological chain
  • Clinical: the pathophysiological chain (finding → mechanism → consequence)
  • History/business: the cause → effect → consequence chain
  • Comparison pages: what makes the two things different and WHY that difference matters
  MANDATORY for all content pages with any explanatory sentence. Null ONLY if the page is a pure vocabulary list with zero causal content.

commonConfusion — The exact misconception students make on this topic.
  Phrase: "Students often confuse X with Y because..." or "Do not assume X — actually..."
  Must be a real, specific error — not a generic "this can be tricky."
  Null only if genuinely no confusion exists for this specific topic.

quickMemory — ONE analogy, mnemonic, or memorable pattern. Visceral and subject-specific.
  BAD: "This is important for the exam." GOOD: "An ionic bond is like velcro — polar opposites grip each other and release in water."
  Null if nothing genuinely memorable applies to this specific page.

highlightAnchors — 2–4 VERBATIM spans from the current page text ONLY. Never paraphrase.
  UNIVERSAL SELECTION RULES (apply to any subject):
  PREFER:
  • Definition sentences (X is defined as Y because Z)
  • Mechanism/causal sentences (X causes Y by doing Z)
  • Formula statements with context (the formula F=ma states that force equals...)
  • Contrast sentences (unlike X, Y does Z because...)
  • Worked step showing key logic (substituting values gives... therefore...)
  • Clinical/exam rules (when X is present, always suspect Y)
  • Conclusion sentences that summarize the page's central lesson
  • A genuine clinical/expert pearl sentence — tag as anchorType "clinical_pearl" (only if one truly exists)
  REJECT ALWAYS:
  • Chapter or section titles (e.g. "2.1 Chemical Elements")
  • Running headers/footers/page numbers
  • Figure labels or table titles ("Figure 2.2 The structure of...")
  • Checkpoint question stems ("Review: What is...?", "Test yourself:")
  • Standalone labels or bold terms without a predicate
  • Filler sentences ("In this section we will...")
  ADAPT BY PAGE TYPE:
  • "review_checkpoint" → return null (never highlight review questions)
  • "math_example" → prefer formula/theorem statement + the step showing key logic
  • "figure_table" → prefer the explanatory body sentence about the figure, NOT the label
  • "comparison" → prefer the contrast sentence(s) that name the key difference
  spanStart + spanEnd REQUIRED: first/last 8–10 verbatim words of each span.
  Minimum span: ≥8 words. Must end with a period. Return null if fewer than 3 real instructional sentences exist.
  priorityTier: 1–5 importance rating per anchor, 5 = "Master This", 1 = "Optional".
  domainCategory: tag each anchor with its specific extraction category.
  reason: 1–2 sentences — write the REAL WHY for this specific span. Answer one of:
    (a) "Without knowing this, a student would [specific mistake/trap]" — name the trap
    (b) "This is high-yield because [specific exam pattern or clinical decision it drives]"
    (c) "Understanding this changes what you do next: [concrete consequence]"
    NEVER write: "This is an important concept", "Key sentence on this page", or any generic label.
    ALWAYS name the specific trap, the specific consequence, or the specific decision this knowledge drives.

miniTestItems — 3 after-reading comprehension questions.
  Q1: multiple-choice (4 options, A=correct). Q2: short-answer (tests mechanism or logic). Q3: trap.
  Adapt to subject — math questions should test reasoning, not just recall.

preReadRecallItems — 2–3 BEFORE-reading prediction questions based on this page's topic.
  Goal: activate prior knowledge, not test comprehension.
  Null for structural or purely introductory pages.

Speed is critical. Classify the page type first, then generate all fields from the page text immediately.`;
}

export function buildStage1UserPrompt(input: SynthesisInput): string {
  const { domain, pageThesis, pageObjective, pageText, rankedConcepts } = input;
  // Page text is the primary input — Stage 1 is page-text-first.
  // Thesis and supplementary concepts are additional context only.
  const contextLines = [pageThesis, pageObjective].filter(Boolean);
  const contextSection = contextLines.length
    ? `PAGE CONTEXT:\n${contextLines.join("\n")}\n\n`
    : "";
  const rawSection = pageText
    ? `PAGE TEXT (primary — extract all 8 fields from this verbatim source):\n${pageText.slice(0, 1400)}`
    : "(no page text — derive from key concepts below)";
  // Supplementary concept context — only included when concepts were passed
  const conceptsSection = rankedConcepts.length
    ? `\n\nSUPPLEMENTARY CONCEPTS (context only — do not copy verbatim into study fields):\n${
        rankedConcepts.slice(0, 3).map((c, i) =>
          `${i + 1}. [${c.role.toUpperCase()}] "${c.title}": "${c.text.slice(0, 180)}"`
        ).join("\n")
      }`
    : "";
  return `DOMAIN: ${domain}\n\n${contextSection}${rawSection}${conceptsSection}\n\nExtract all 8 fields. Output study notes immediately from page text — do not wait for concept blocks or heuristics.`;
}

/** Client-side Stage 1 fetch — fast path. */
export async function synthesizeStage1Output(
  input: SynthesisInput,
  signal?: AbortSignal,
): Promise<Stage1Synthesis> {
  const body = JSON.stringify({ ...input, stage: "1" });
  const m = measureSynthesisPayload(input);
  // Payload diagnostics — confirm we send ONE page (~1–5K chars), not the whole book (millions).
  console.log("[SYNTH] page number", m.page);
  console.log("[SYNTH] character count", m.totalChars, { bodyBytes: body.length, pageText: m.pageTextChars, concepts: m.conceptChars, summary: m.summaryChars });
  console.log("[SYNTH] token estimate", m.tokenEstimate);
  if (m.totalChars > 50_000) {
    console.error("[SYNTH] PAYLOAD TOO LARGE — book-level text leaked into synthesis input", m);
  }
  console.log("[SYNTH] request started", { stage: 1, page: m.page });
  const t0 = Date.now();
  const response = await fetch("/api/intelligenceSynthesis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal,
  });
  console.log("[SYNTH] request completed", { stage: 1, page: m.page, ms: Date.now() - t0, status: response.status });
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

/** Build a full TeachingSynthesis from Stage 1 results.
 *
 * Stage 1 now returns the complete study card (thesis + 4 study fields + anchors).
 * This stub populates ALL fields that hasSynth checks so Study Notes render immediately
 * — the panel never sits on "Analyzing page..." waiting for Stage 2.
 *
 * Stage 2 replaces this stub when it completes; until then the student has real notes.
 * If Stage 2 fails entirely, Stage 1 notes remain — the panel never reverts to blank.
 */

// Fill null Stage 1 fields with best-matching sentences from the active page text.
// Called only when OpenAI returns null for one or more study fields — guarantees
// hasSynth has at least something to validate.
function fillStage1FieldsFromText(s1: Stage1Synthesis, pageText: string): Stage1Synthesis {
  if (!pageText || pageText.length < 60) return s1;
  const sentences = pageText
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length >= 25 && /[a-zA-Z]{4}/.test(s));
  if (sentences.length === 0) return s1;
  const causalRe   = /\b(causes?|leads?\s+to|results?\s+in|because|due\s+to|produces?|triggers?|enables?|prevents?|converts?)\b/i;
  const contrastRe = /\b(however|unlike|not\b|except|contrast|mistake|caution|differ|whereas|but\b)\b/i;
  return {
    ...s1,
    whyThisMatters:  s1.whyThisMatters  ?? sentences[1] ?? sentences[0] ?? null,
    keyMechanism:    s1.keyMechanism    ?? sentences.find(s => causalRe.test(s))   ?? sentences[2] ?? null,
    commonConfusion: s1.commonConfusion ?? sentences.find(s => contrastRe.test(s)) ?? null,
    quickMemory:     s1.quickMemory     ?? null, // too context-specific to derive mechanically
  };
}

// Build 1 temporary concept block from Stage 1 data so studyModel.conceptBlocks.length > 0
// is true immediately after Stage 1. Stage 2 replaces this with AI-reinterpreted blocks.
function buildStage1ConceptBlocks(s1: Stage1Synthesis): TeachingSynthesis['concepts'] {
  if (!s1.coreIdea) return [];
  return [{
    title:         "Core Concept",
    role:          "definition" as const,
    principle:     s1.coreIdea,
    mechanism:     s1.keyMechanism    ?? "",
    trap:          s1.commonConfusion ?? null,
    rule:          s1.whyThisMatters  ?? "",
    misconception: s1.commonConfusion ?? null,
    examHook:      null,
  }];
}

export function makeStubFromStage1(stage1: Stage1Synthesis, pageText?: string): TeachingSynthesis {
  // Fill any null study fields from page text before building the stub.
  const filled = pageText ? fillStage1FieldsFromText(stage1, pageText) : stage1;
  return {
    pageType:           filled.pageType,          // flows to anchor pipeline for page-type-aware filtering
    coreIdea:           filled.coreIdea,
    // noteCards is a Stage 2-only field — Stage 1 never produces it. The client-side
    // fallback in lib/notelab/deriveNoteCards.ts derives cards from these stub fields
    // until Stage 2 (or never, on failure) resolves it.
    noteCards:          null,
    tags:               null, // Stage 1 doesn't produce tags; left null until Stage 2 resolves them.
    // Map Stage 1 study fields → TeachingSynthesis fields that RightPanel reads via _synth.
    // whyThisMatters → synth.application → _synth.whyItMatters
    // keyMechanism   → synth.mechanism   → _synth.keyMechanism
    // commonConfusion→ synth.misconceptionAlert + synth.trap → _synth.commonConfusion
    // quickMemory    → synth.memoryAnchor → _synth.memoryAnchor
    mechanism:          filled.keyMechanism    ?? null,
    rule:               "",
    trap:               filled.commonConfusion ?? null,
    application:        filled.whyThisMatters  ?? null,
    teachingObjective:  "",
    examCriticalIdea:   "",
    reasoningFlow:      "",
    misconceptionAlert: filled.commonConfusion ?? null,
    memoryAnchor:       filled.quickMemory     ?? null,
    // Level 2 fields are deliberately not derivable from Stage 1 data — left null
    // until Stage 2 (or local fallback) resolves them.
    clinicalReasoning:  null,
    commonMistake:      null,
    examStrategy:       null,
    connectionMap:      null,
    clinicalPearl:      null,
    externalStudyLinks: null,
    concepts:           buildStage1ConceptBlocks(filled),
    miniTests:           null,
    miniTestItems:       filled.miniTestItems,
    preReadRecallItems:  filled.preReadRecallItems,
    highlightAnchors:    filled.highlightAnchors,
    relatedVideoQueries: null,
  };
}

// ---------------------------------------------------------------------------
// Local (no-network) fallback synthesis.
//
// When the OpenAI Stage 1 path fails or aborts but the active page has readable
// text, we still want the right panel to show SOMETHING and the study model /
// highlights to build. This derives a minimal TeachingSynthesis directly from
// the page text — no network. coreIdea is the page thesis (or first sentence),
// highlightAnchors are the two most substantive verbatim sentences, and a couple
// of concepts come from the longest sentences. Clearly degraded, but it
// guarantees `_synth` attaches so the student can study today.
// ---------------------------------------------------------------------------
export function makeLocalFallbackSynthesis(
  pageText: string,
  pageThesis?: string,
): TeachingSynthesis | null {
  const text = (pageText ?? "").trim();
  if (text.length < 80) return null;

  // Split into sentences; keep substantive ones.
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 30 && /[a-zA-Z]/.test(s));

  const firstSentence = sentences[0] ?? text.slice(0, 160);
  const coreIdea = (pageThesis && pageThesis.trim().length >= 12)
    ? pageThesis.trim()
    : firstSentence.slice(0, 200);

  // Two most substantive sentences become verbatim highlight anchors.
  const ranked = [...sentences].sort((a, b) => b.length - a.length).slice(0, 2);
  const highlightAnchors: SynthHighlightAnchor[] = ranked.map((s, i) => ({
    text: s.slice(0, 220),
    anchorType: i === 0 ? "thesis" : "definition",
    reason: "Key sentence on this page",
    spanStart: null,
    spanEnd: null,
    priorityTier: i === 0 ? 5 : null,
    domainCategory: null,
  }));

  return {
    pageType:           "mixed" as const,
    coreIdea,
    noteCards:          null, // no network — lib/notelab/deriveNoteCards.ts fallback derives cards client-side
    tags:               null,
    mechanism:          sentences[1]?.slice(0, 200) ?? null,
    rule:               "",
    trap:               null,
    application:        sentences[2]?.slice(0, 200) ?? null,
    teachingObjective:  "",
    examCriticalIdea:   "",
    reasoningFlow:      "",
    misconceptionAlert: null,
    memoryAnchor:       null,
    clinicalReasoning:  null,
    commonMistake:      null,
    examStrategy:       null,
    connectionMap:      null,
    clinicalPearl:      null,
    externalStudyLinks: null,
    concepts:           [],
    miniTests:           null,
    miniTestItems:       null,
    preReadRecallItems:  null,
    highlightAnchors:    highlightAnchors.length ? highlightAnchors : null,
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
  const body = JSON.stringify(input);
  const m = measureSynthesisPayload(input);
  console.log("[SYNTH] page number", m.page);
  console.log("[SYNTH] character count", m.totalChars, { bodyBytes: body.length, pageText: m.pageTextChars, concepts: m.conceptChars, summary: m.summaryChars });
  console.log("[SYNTH] token estimate", m.tokenEstimate);
  if (m.totalChars > 50_000) {
    console.error("[SYNTH] PAYLOAD TOO LARGE — book-level text leaked into synthesis input", m);
  }
  console.log("[SYNTH] request started", { stage: 2, page: m.page });
  console.log("[STAGE2_REQUEST]", {
    domain: input.domain,
    conceptCount: input.rankedConcepts.length,
    pageThesisLen: input.pageThesis?.length ?? 0,
    concepts: input.rankedConcepts.map((c) => ({ role: c.role, titleLen: c.title?.length ?? 0, textLen: c.text?.length ?? 0 })),
  });

  const t0 = Date.now();
  let response: Response;
  try {
    response = await fetch("/api/intelligenceSynthesis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal,
    });
    console.log("[SYNTH] request completed", { stage: 2, page: m.page, ms: Date.now() - t0, status: response.status });
  } catch (fetchErr: any) {
    // Network error or AbortError — distinguish them clearly
    const isAbort = fetchErr?.name === "AbortError" || signal?.aborted;
    console.error(isAbort ? "[STAGE2_ABORTED]" : "[STAGE2_NETWORK_ERROR]", fetchErr?.message ?? String(fetchErr));
    throw fetchErr;
  }

  console.log("[STAGE2_RESPONSE]", { status: response.status, ok: response.ok });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    console.error("[STAGE2_API_ERROR]", { status: response.status, error: err.error ?? "(no error field)" });
    throw new Error(err.error ?? `synthesis failed: ${response.status}`);
  }

  let raw: unknown;
  try {
    raw = await response.json();
    console.log("[STAGE2_PARSE]", {
      keys: raw && typeof raw === "object" ? Object.keys(raw as object) : typeof raw,
      coreIdea: (raw as any)?.coreIdea?.slice?.(0, 60) ?? null,
      conceptCount: (raw as any)?.concepts?.length ?? 0,
    });
  } catch (jsonErr) {
    console.error("[STAGE2_JSON_DECODE_FAIL]", jsonErr instanceof Error ? jsonErr.message : String(jsonErr));
    throw jsonErr;
  }

  try {
    const validated = TeachingSynthesisSchema.parse(raw);
    console.log("[STAGE2_SAVE]", { coreIdea: validated.coreIdea?.slice(0, 60), conceptCount: validated.concepts?.length ?? 0 });
    return validated;
  } catch (zodErr) {
    console.error("[STAGE2_ZOD_FAIL]", {
      zodMessage: zodErr instanceof Error ? zodErr.message : String(zodErr),
      rawKeys: raw && typeof raw === "object" ? Object.keys(raw as object) : raw,
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
  presetId?: string,
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

  return { domain, presetId, pageObjective, pageThesis, pageSummary, pageNumber, pageText, rankedConcepts: chunkedConcepts };
}

/** Estimate token count from char count — rough 4 chars/token heuristic. */
function estimateTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

/** Measure the exact payload that will be sent to the synthesis API.
 *  This is the single source of truth for "are we sending one page or the whole book?". */
export function measureSynthesisPayload(input: SynthesisInput) {
  const conceptChars = input.rankedConcepts.reduce((s, c) => s + (c.text?.length ?? 0) + (c.title?.length ?? 0) + (c.mechanism?.length ?? 0), 0);
  const pageTextChars = input.pageText?.length ?? 0;
  const summaryChars = input.pageSummary?.length ?? 0;
  const thesisChars = input.pageThesis?.length ?? 0;
  const objectiveChars = input.pageObjective?.length ?? 0;
  const totalChars = conceptChars + pageTextChars + summaryChars + thesisChars + objectiveChars;
  return {
    page: input.pageNumber ?? null,
    conceptCount: input.rankedConcepts.length,
    pageTextChars,
    summaryChars,
    thesisChars,
    objectiveChars,
    conceptChars,
    totalChars,
    tokenEstimate: estimateTokens(totalChars),
  };
}
