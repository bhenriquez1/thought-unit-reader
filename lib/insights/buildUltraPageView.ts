// lib/insights/buildUltraPageView.ts
// Converts a PageInsightModel into the ULTRA structured right-panel view.
// All fields are complete sentences — no fragments.
//
// Architecture: buildPageStepModel is the shared step model that drives
// mini test and STR compression so they are page-native, not template-like.

import type { PageInsightModel, ParagraphInsight } from "@/lib/insights/types";
import { cleanSentence, polishExtraction, isFieldRenderable, stabilizeOutput, compressToOneLine, compressToNote } from "./sentenceCleanup";
import { isRenderableSentence } from "./isRenderableSentence";
import { BOILERPLATE_RE, PUBLISHER_DEBRIS_RE, isWeakFragment } from "./renderQualityGate";
import {
  extractConceptBlocks,
  ROLE_PRIORITY,
  type ConceptBlockInput,
  type PageModelForConcepts,
  type SourceSentence,
  type SourceParagraph,
  type SourceHeading,
} from "./extractConceptBlocks";
import {
  TRAP_RE,
  REASON_RE,
  RULE_RE,
  dedupeSections,
  type SectionCandidate,
  type SectionKind,
} from "./dedupeSectionCandidates";
import { buildCompressionRules, compressToRule, type BuildCompressionRulesInput } from "./buildCompressionRules";
import { buildPageStepModel } from "@/lib/reading-graph/buildPageStepModel";
import {
  selectMiniTestQuestions,
  type MiniTestQuestionCandidate,
  type MiniTestRole,
} from "./selectMiniTestQuestions";
import { normalizeClinicalText, type ClinicalNormalizationResult } from "@/lib/normalization/normalizeClinicalText";
import { detectPageDomain, detectSymbolicDensity, type PageDomain } from "./detectPageDomain";
import { findMainTeachingZone } from "./findMainTeachingZone";
import { scoreDomainPriority, type DomainPriorityScore } from "./scoreDomainPriority";
import type { ClinicalPriorityCandidate } from "./scoreClinicalPriority";
import { inferPageObjective, isExampleOrFiller } from "./inferPageObjective";
import type { TeachingSynthesis } from "./synthesizeTeachingOutput";
import { buildCrossLinkHints, type CrossLinkInput } from "./buildCrossLinkHints";
import { buildSRIModel, type SRIModel } from "./buildSRIModel";
import { normalizeMathTitle, extractMathFields, extractMathTransformation, extractMathGiven, extractMathDecision, extractProcedureSteps, buildMathCoreIdea } from "./math/extractMathConcepts";
import { normalizeScienceTitle, extractScienceMemoryHook, extractScienceExample } from "./science/normalizeScienceTitle";
import { isFillerSentence } from "./signalClassifier";

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface UltraConceptBlock {
  conceptId: string;
  ordinal: number;
  title: string;
  pattern: string;
  surgicalReason: string;
  trap: string;
  rule: string;
  importance: string;
  conceptRole?: string;
  anchorText?: string;       // raw source sentence — used for left-panel scroll sync
  misconception?: string;    // "Students often confuse X with Y"
  examHook?: string;         // "On DAT/boards this appears as..."
  procedureSteps?: string[]; // math/clinical ordered steps
  transformation?: string;   // math: symbolic step "aₙ = 1/n → 0 as n → ∞"
  given?: string;            // math: input formula/state "aₙ = 1/n"
  decision?: string;         // math: convergence/divergence verdict
  example?: string;          // science: concrete instance sentence
  memoryHook?: string;       // science: analogy/mnemonic sentence
}

export interface UltraPageViewStep {
  conceptId: string;
  role: string;
  roleLabel: string;
}

export interface UltraPageViewDebug {
  pageKind: string;
  domain: PageDomain;
  shouldRenderFullPanel: boolean;
  pageSummaryLength: number;
  coreIdeaSource: "pageSummary" | "definitionRole" | "chiefSignal" | "supportSentence" | "anchorFallback" | "hardFallback";
  conceptCandidates: Array<{ id: string; title: string; score: number; anchorLen: number; role: string }>;
}

export interface UltraPageView {
  title: string;
  subtitle: string;
  coreIdea: string;
  /** Top-down teaching statement from heading + canonical statements — more reliable than coreIdea for synthesis */
  teachingStatement?: string;
  /** Deepest understanding target — operator-rewritten single sentence (≤ ~20 words) */
  pageThesis?: string;
  /** ≤ 12-word high-yield compression for dyslexia / rapid review */
  oneLineSummary?: string;
  blocks: UltraConceptBlock[];
  miniTest: string[];
  compression: string[];
  steps: UltraPageViewStep[];
  domain?: string;             // drives domain-adaptive field labels in right panel
  crossLinkHints?: string[];  // ["limit → convergence", "compound → emergent property"]
  sriModel?: SRIModel;        // paragraph-level reading depth map
  _debug?: UltraPageViewDebug;
}

// ---------------------------------------------------------------------------
// Hard content filter — runs before scoring; blocks non-instructional content
// ---------------------------------------------------------------------------

function looksLikeMathFormula(text: string): boolean {
  return /[=∫∂∑]|lim\b|d[a-z]\/d[a-z]|\\frac|\\int|\\sum|\bderivative\b|\bintegral\b|\bchain rule\b|\brelated rates\b/i.test(text);
}

function looksLikeMathExplanation(text: string): boolean {
  return /\b(function|sequence|represent|depends on|limit|approach|graph|rate|value)\b/i.test(text);
}

export function isValidCoreParagraph(p: ParagraphInsight): boolean {
  const text = (p.cleanedText || p.rawText || "").trim();
  if (!text || p.paragraphType === "noise") return false;
  // Reject publisher/copyright boilerplate before any other check
  if (BOILERPLATE_RE.test(text)) return false;
  if (PUBLISHER_DEBRIS_RE.test(text)) return false;
  // Formula paragraphs (by type or by content): bypass length and explanation-signal checks
  if (p.paragraphType === "formula" || looksLikeMathFormula(text)) return text.length >= 12;
  // Short math explanation context should survive near formulas.
  if (looksLikeMathExplanation(text)) return text.length >= 35;
  // Short definition sentences ("X is a ...", "X is defined as ...", "X refers to ...") must
  // survive the length gate so a one-sentence definition isn't silently dropped before concept
  // extraction sees it. 40 chars is enough to hold a real definition and exclude stub labels.
  if (/\b(?:is\s+(?:a|an|the|defined|classified|known|considered)|defined\s+as|refers?\s+to|consists?\s+of|is\s+known\s+as)\b/i.test(text)) return text.length >= 40;
  if (text.length < 80) return false;
  // Reject figure captions, table headers, diagram labels — including letter-indexed ones (Fig. A, Table S1)
  if (/^(figure|fig\.|table|diagram|image|plate|chart|exhibit)\s*[\dA-Za-z]/i.test(text)) return false;
  // Reject structural / TOC content
  if (/^(chapter\s+\d|section\s+\d|\d+\.\d+\s|key\s+concepts?|learning\s+objectives?|table\s+of\s+contents)/i.test(text)) return false;
  // Must carry at least one explanation signal
  return /\b(is|are|was|were|causes?|leads?\s+to|results?\s+in|depends?|occurs?|because|means?|defined\s+as|refers?\s+to|consists?\s+of|involves?)\b/i.test(text);
}

// ---------------------------------------------------------------------------
// Adapter: PageInsightModel → PageModelForConcepts
// ---------------------------------------------------------------------------

/**
 * Returns a score bonus for a paragraph based on its position in page reading order.
 * Intro paragraphs (before the first section heading) get the largest bonus so their
 * sentences win the anchor competition over higher-density example sections further down.
 *
 * Detection: a "section heading" is a short line (< 90 chars) without terminal punctuation
 * that starts with a capital letter and appears after the first paragraph.
 */
function computeStructuralPositionBonus(
  allParagraphs: ParagraphInsight[],
  p: ParagraphInsight
): number {
  if (allParagraphs.length === 0) return 0;

  // Use original page-order index (set by processPage), not array position in the
  // filtered list. After isValidCoreParagraph drops short intro paragraphs, array
  // index 0 may point to a mid-page paragraph — paragraphIndex always reflects
  // the actual position on the page as split by processPage.
  const pageIdx = p.paragraphIndex;

  // Sort by original page order to detect first section heading reliably
  const byPageOrder = [...allParagraphs].sort((a, b) => a.paragraphIndex - b.paragraphIndex);
  let firstSectionParagraphIdx = -1;
  for (let i = 1; i < byPageOrder.length; i++) {
    const t = (byPageOrder[i].cleanedText || byPageOrder[i].rawText || "").trim();
    if (t.length > 0 && t.length < 90 && !/[.!?]$/.test(t) && /^[A-Z]/.test(t)) {
      firstSectionParagraphIdx = byPageOrder[i].paragraphIndex;
      break;
    }
  }

  // Intro zone: everything before the first section heading, or the first 2 paragraphs
  // when no heading is detected.
  const introEnd = firstSectionParagraphIdx > 0 ? firstSectionParagraphIdx : 2;

  if (pageIdx < introEnd) {
    // +0.50 for the very first paragraph, +0.38 for the second, etc.
    return 0.50 - pageIdx * 0.12;
  }
  if (firstSectionParagraphIdx > 0 && pageIdx === firstSectionParagraphIdx + 1) {
    return 0.18; // First content paragraph of the first named section
  }
  return 0;
}

function splitRawSentences(text: string): string[] {
  if (!text) return [];
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z"'])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8);
}

export function adaptPageInsightModel(pageModel: PageInsightModel): PageModelForConcepts {
  const allSentences: SourceSentence[] = [];
  const sourceParagraphs: SourceParagraph[] = [];
  const headingsOut: SourceHeading[] = [];

  const paragraphs = pageModel.paragraphInsights ?? [];

  // Detect heading-like paragraphs: short (< 70 chars), no terminal punctuation, ≥ 2 words.
  // These are section titles that PDF.js extracted as separate blocks. We link each heading
  // to the following content paragraph so inferConceptTitle can use it as the concept label
  // instead of falling back to the first-N-words of the anchor sentence.
  const sortedByPageOrder = [...paragraphs].sort((a, b) => a.paragraphIndex - b.paragraphIndex);
  const headingIdByParaIdx = new Map<number, string>();
  const headingParaIdxSet = new Set<number>();

  for (let i = 0; i < sortedByPageOrder.length - 1; i++) {
    const p = sortedByPageOrder[i];
    const t = (p.cleanedText || p.rawText || "").trim();
    const wc = t.split(/\s+/).length;
    if (t.length >= 4 && t.length < 70 && !/[.!?]$/.test(t) && /^[A-Z]/.test(t) && wc >= 2 && wc <= 8) {
      const hid = `heading-${p.paragraphIndex}`;
      headingsOut.push({ id: hid, text: t, level: 1 });
      headingParaIdxSet.add(p.paragraphIndex);
      // Link to the immediately following paragraph
      const next = sortedByPageOrder[i + 1];
      if (next && !headingParaIdxSet.has(next.paragraphIndex)) {
        headingIdByParaIdx.set(next.paragraphIndex, hid);
      }
    }
  }

  // Pre-compute first raw sentence per paragraph index for cross-paragraph support context.
  // Single-sentence paragraphs (e.g. isolated definitions) get the next paragraph's opening
  // sentence as a low-score support candidate so they can produce non-empty supportSentences.
  const firstRawByIdx = paragraphs.map((p) =>
    splitRawSentences(p.cleanedText || p.rawText || "")[0] ?? null
  );

  for (const [idx, p] of paragraphs.entries()) {
    // Heading paragraphs only contribute to headingsOut — they are not concept blocks.
    if (headingParaIdxSet.has(p.paragraphIndex)) continue;

    const sentenceIds: string[] = [];
    // Structural position bonus: intro-zone paragraphs get elevated scores so their
    // sentences win the anchor competition over denser example sections further down.
    const structBonus = computeStructuralPositionBonus(paragraphs, p);

    type ScoredText = { text: string; score: number };
    const rawSentences = splitRawSentences(p.cleanedText || p.rawText || "");
    const inputs: ScoredText[] = [
      // Raw verbatim PDF sentences are the primary anchor pool — they match PDF spans directly.
      // Scored above AI-enriched fields so the anchor is always findable text, not a rewrite.
      // EXCEPTION: math/prose filler openers ("We indicate this by...", "Notice that...", etc.)
      // are capped at 0.10 regardless of paragraph position, so the -8 penalty in sentenceScore
      // can fully suppress them without fighting a high position-derived base score.
      ...rawSentences.map((t, i) => {
        const isFiller = /^(we (indicate|say|note|see|observe|call|denote|write|have seen|recall that|now turn|now consider)\b|in other words,?|notice that\b|observe that\b|here we\b|it (is|can be) (shown|seen)\b|this (gives|shows|yields)\b|recall (that\b|from\b))/i.test(t.trimStart());
        return {
          text: t,
          score: isFiller
            ? 0.10
            : Math.max(0.55, p.priorityScore * 2.0 - i * 0.15 + structBonus),
        };
      }),
      // AI-enriched fields demoted to support context — verbatim but type-selected, not top-ranked.
      p.summary           ? { text: p.summary,  score: p.priorityScore * 1.0 } : null,
      ...(p.traps       ?? []).map((t)    => ({ text: t, score: p.priorityScore * 1.0 })),
      ...(p.takeaways   ?? []).map((t)    => ({ text: t, score: p.priorityScore * 0.85 })),
      ...(p.logicChains ?? []).flatMap((lc) => [
        lc.because ? { text: lc.because, score: p.priorityScore * 0.9 } : null,
        lc.trap    ? { text: lc.trap,    score: p.priorityScore * 0.8 } : null,
        // Synthetic if+then concatenations never appear verbatim in the PDF — kept at near-zero
        // so they fill the pool but never win anchor or primary support selection.
        (lc.if && lc.then) ? { text: `${lc.if}, therefore ${lc.then}`, score: p.priorityScore * 0.2 } : null,
      ]),
      // coreSignals contain a mix of full sentences and regex fragments; scored low so verbatim
      // raw sentences always win over fragments that fail token-window matching.
      ...(p.coreSignals ?? []).map((t, i) => ({ text: t, score: Math.max(0.3, p.priorityScore * 0.45 - i * 0.05) })),
      // Cross-paragraph context: for single-sentence paragraphs, add the first sentence
      // of the next paragraph as a low-score support candidate.
      ...(rawSentences.length <= 1 && firstRawByIdx[idx + 1]
        ? [{ text: firstRawByIdx[idx + 1]!, score: Math.max(0.3, p.priorityScore * 0.4) }]
        : []),
    ].filter((x): x is ScoredText => Boolean(x));

    const seen = new Set<string>();
    for (const { text, score } of inputs) {
      const key = text.toLowerCase().trim().slice(0, 80);
      if (!text.trim() || seen.has(key)) continue;
      seen.add(key);
      const id = `${p.id}-s${sentenceIds.length}`;
      allSentences.push({ id, text, paragraphId: p.id, score });
      sentenceIds.push(id);
    }

    if (sentenceIds.length) {
      sourceParagraphs.push({
        id: p.id,
        text: p.cleanedText || p.rawText || "",
        sentenceIds,
        headingId: headingIdByParaIdx.get(p.paragraphIndex),
        score: p.priorityScore + structBonus,
      });
    }
  }

  return {
    documentId: pageModel.documentId ?? "",
    pageNumber: pageModel.pageNumber ?? 0,
    pageTitle: undefined,
    pageSummary: pageModel.topTakeaways?.[0] ?? pageModel.pageSummary ?? undefined,
    headings: headingsOut,
    paragraphs: sourceParagraphs,
    sentences: allSentences,
  };
}

// ---------------------------------------------------------------------------
// Field builders — each must occupy a distinct semantic role
// ---------------------------------------------------------------------------

function normalizeLine(text: string, fallback: string): string {
  const cleaned = cleanSentence(text ?? "");
  const polished = polishExtraction(cleaned);
  return isRenderableSentence(polished) ? polished : fallback;
}

interface BuiltFields {
  pattern: string;
  surgicalReason: string;
  trap: string;
  rule: string;
}

// ---------------------------------------------------------------------------
// Post-extraction quality gate
// ---------------------------------------------------------------------------

function enforceEducationalHierarchy(concepts: ConceptBlockInput[]): ConceptBlockInput[] {
  return [...concepts].sort((a, b) => {
    const pa = ROLE_PRIORITY[a.conceptRole ?? "detail"] ?? 0;
    const pb = ROLE_PRIORITY[b.conceptRole ?? "detail"] ?? 0;
    if (pa !== pb) return pb - pa;
    return (b.score ?? 0) - (a.score ?? 0);
  });
}

// Stopwords excluded from semantic density calculation
const DENSITY_STOPWORDS = /^(about|which|these|those|their|where|there|would|could|should|might|being|having|after|before|during|through|within|without|between|among|against|while|since|until|below|above|other|every|often|found|later|again|given|under|large|small|right|great|taken|still|quite|rather|really|simply|mainly|mostly|partly|nearly|almost|though|little|shall|perhaps|beyond|behind|always|never|either|across|along|around|toward|except|toward|finally|already|whether)$/i;

function passesConceptQualityGate(
  concept: ConceptBlockInput,
  pageObjective: ReturnType<typeof inferPageObjective>,
  domain: PageDomain,
): boolean {
  void domain;
  const anchor = concept.anchorSentence;
  const wordCount = anchor.split(/\s+/).length;

  // 1. Must be a real teachable concept — not filler/narration/OCR fragment
  if (isExampleOrFiller(anchor)) return false;
  if (isFillerSentence(anchor)) return false;
  if (wordCount < 5) return false;
  if (/^(we |this |here |in this |notice |observe )/i.test(anchor.trimStart())) return false;
  // OCR-style example labels, figure/table captions, section headers
  if (/^(example\s+[A-Z]?\d|figure\s+\d|table\s+\d|section\s+\d|box\s+\d)/i.test(anchor.trimStart())) return false;
  // Narrative/story fragments — prose transitions, not teachable concepts
  if (/^(then\s+|suddenly\s+|next,?\s+|later,?\s+|meanwhile\s+)/i.test(anchor.trimStart())) return false;
  // Pure pronoun openers with no subject establishment
  if (/^(he |she |they |it |his |her |their )/i.test(anchor.trimStart())) return false;

  // ── Concept Purity Filter ─────────────────────────────────────────────────
  // Structural noise patterns that produce visually prominent but cognitively
  // empty concept blocks in the right panel.

  // Author names from major pharmacology/medical/biology textbooks — never a concept
  if (/\b(katzung|stahl|robbins|goodman|gilman|lehninger|stryer|moore|guyton|harrisons|schwartz|sabiston|tierney|cotran|kumar|fauci|kasper|braunwald|loscalzo|rang|dale|boron|boulpaep)\b/i.test(anchor)) return false;
  // Academic credentials in short fragments → metadata, not concepts
  if (/\b(MD|PhD|DO|RN|PharmD|DVM|MPH|MPharm|MBBS|FRCPC)\b/.test(anchor) && wordCount < 12) return false;
  // "That was where they found..." — narrative transition fragment, not a concept
  if (/^(that was (where|when|how|what)\b|it was (then|there|at this point)\b|this is (where|when|how|why)\b)/i.test(anchor.trimStart())) return false;
  // Case report structural labels: "Case 1: Patient presents..."
  if (/^case\s+\d+\s*[:\s]/i.test(anchor.trimStart()) && wordCount < 15) return false;
  // Chapter/introduction metadata fragments
  if (/^(chapter\s+\d|introduction\s+to\b|learning\s+objective|key\s+concept|table\s+of\s+content)/i.test(anchor.trimStart())) return false;

  // Semantic density: at least 3 non-stopword content words (≥5 chars)
  // Prevents "Example 1 | What Happens" (0 content words) from passing
  const contentWordCount = (anchor.match(/\b[a-z]{5,}\b/gi) ?? [])
    .filter((w) => !DENSITY_STOPWORDS.test(w)).length;
  if (contentWordCount < 3) return false;

  // Explanation signal: must carry at least one educational signal verb.
  // Rejects narrative fragments ("They had time, they determined"),
  // OCR garble ("Certain patients may art and science"), and story prose
  // that slipped past the pronoun gate.
  const hasExplanationSignal = /\b(is|are|was|were|causes?|leads?\s+to|results?\s+in|means?|requires?|indicates?|suggests?|defines?|consists?\s+of|involves?|occurs?|produces?|allows?|prevents?|decreases?|increases?|converges?|diverges?|approaches?|depends?\s+on|determines?|generates?|mediates?|regulates?|describes?|characterizes?|refers?\s+to|known\s+as|called|defined\s+as)\b/i.test(anchor);
  const isImperative = /^(if|when|use|apply|remember|do not|never|always|key:|note:)\b/i.test(anchor.trimStart());
  if (!hasExplanationSignal && !isImperative) return false;

  // 2. Topic connection — when a clear page topic exists (≥2 key tokens), at least one
  // token must appear in the anchor or its support sentences.
  if (pageObjective?.topic) {
    const topicTokens = pageObjective.topic.toLowerCase().split(/\s+/).filter((t) => t.length > 3);
    if (topicTokens.length >= 2) {
      const anchorLower = anchor.toLowerCase();
      const hasTopicConnection =
        topicTokens.some((t) => anchorLower.includes(t)) ||
        concept.supportSentences.some((s) => topicTokens.some((t) => s.toLowerCase().includes(t)));
      if (!hasTopicConnection) return false;
    }
  }

  // 3. Reject overly long narrative sentences beginning with weak determiners
  if (wordCount > 45 && /^(the |a |an |this |these |those )/i.test(anchor.trimStart())) return false;

  return true;
}

// ---------------------------------------------------------------------------
// Domain-adaptive STR synthesis helpers
// ---------------------------------------------------------------------------

function extractConditionResult(anchor: string, supports: string[]): { condition: string; result: string } | null {
  for (const text of [anchor, ...supports]) {
    const m = text.match(/\b(when|if)\s+(.{10,80}?),\s+(.{10,})/i);
    if (m) return { condition: `${m[1]} ${m[2]}`, result: m[3].trim() };
    const m2 = text.match(/(.{5,40}?)\s+(converges?\s+to|approaches?|equals?)\s+(.{5,})/i);
    if (m2) return { condition: m2[1].trim(), result: `${m2[2]} ${m2[3]}`.trim() };
  }
  return null;
}

function extractMechConsequence(anchor: string, supports: string[]): { mechanism: string; consequence: string } | null {
  for (const text of [anchor, ...supports]) {
    const m = text.match(/(.{10,80}?)\s+(leads?\s+to|causes?|results?\s+in)\s+(.{10,})/i);
    if (m) return { mechanism: m[1].trim(), consequence: `${m[2]} ${m[3]}`.trim() };
    const m2 = text.match(/because\s+(.{10,80}?),\s+(.{10,})/i);
    if (m2) return { mechanism: `because ${m2[1]}`, consequence: m2[2].trim() };
  }
  return null;
}

function extractFindingAction(anchor: string, supports: string[]): { finding: string; action: string } | null {
  for (const text of [anchor, ...supports]) {
    const m = text.match(/(.{10,80}?)\s+(indicates?|suggests?|means?|requires?)\s+(.{10,})/i);
    if (m) return { finding: m[1].trim(), action: `${m[2]} ${m[3]}`.trim() };
  }
  return null;
}

// Strip OCR labels and figure references from heuristic output before display.
// Synthesis will fully rewrite these — this ensures the fallback is still readable.
function sanitizeHeuristicText(text: string): string {
  return text
    .replace(/^Example\s+[A-Z0-9]+\s*[|:]\s*/i, "")
    .replace(/^Figure\s+\d+[.\d]*\s*[—–\-:]\s*/i, "")
    .replace(/^Table\s+\d+[.\d]*\s*[—–\-:]\s*/i, "")
    .replace(/^Section\s+[\d.]+\s*[—–\-:]\s*/i, "")
    .replace(/^Box\s+\d+[.\d]*\s*[—–\-:]\s*/i, "")
    .trim();
}

function buildConceptFields(concept: ConceptBlockInput, coreIdea: string, domain: PageDomain): BuiltFields {
  const candidates: SectionCandidate[] = [];
  let seq = 0;

  const add = (text: string, kind: SectionKind, score: number) => {
    const t = cleanSentence(text);
    if (t) candidates.push({ id: `${concept.id}-${kind}-${seq++}`, text: t, kind, score });
  };

  // PATTERN: anchor is the primary definition/descriptor
  add(concept.anchorSentence, "pattern", 10);
  concept.supportSentences.forEach((s, i) => add(s, "pattern", 5 - i * 0.5));

  // REASON: prefer causal/explanatory signals
  concept.supportSentences.forEach((s, i) => {
    add(s, "reason", (REASON_RE.test(s) ? 9 : 4) - i * 0.5);
  });
  add(concept.anchorSentence, "reason", 2);

  // TRAP: contrast/exception sentences
  concept.trapCandidates.forEach((s, i) => add(s, "trap", 10 - i));
  concept.supportSentences.forEach((s) => { if (TRAP_RE.test(s)) add(s, "trap", 6); });

  // RULE: operational takeaway, prefer RULE_RE signals
  concept.supportSentences.forEach((s, i) => {
    add(s, "rule", (RULE_RE.test(s) ? 9 : 3) - i * 0.5);
  });
  add(concept.anchorSentence, "rule", 1);

  // Domain-aware priority boost: re-score candidates using domain-specific roles
  const domainInputs: ClinicalPriorityCandidate[] = [
    { id: "anchor", text: concept.anchorSentence },
    ...concept.supportSentences.map((s, i) => ({ id: `sup${i}`, text: s })),
    ...concept.trapCandidates.map((s, i) => ({ id: `trap${i}`, text: s })),
  ];
  const domainScores: DomainPriorityScore[] = scoreDomainPriority(domainInputs, domain);
  const domainByKey = new Map(domainScores.map((ds) => [ds.text.toLowerCase().slice(0, 60), ds]));
  for (const c of candidates) {
    const ds = domainByKey.get(c.text.toLowerCase().slice(0, 60));
    if (!ds || ds.slot === "support") continue;
    if (c.kind === ds.slot) c.score += ds.slot === "trap" ? 4 : 3;
  }

  const result = dedupeSections(candidates, coreIdea);

  const anchorClean = sanitizeHeuristicText(cleanSentence(concept.anchorSentence) || "");

  const fallbackPattern = anchorClean || "This concept introduces a central idea on the page.";

  // Domain-adaptive synthesis: produce distinct surgicalReason and rule fields.
  // Pure copy (firstSupport for both) creates duplication in the right panel.
  const { surgicalReason: synthesizedReason, rule: synthesizedRule } = (() => {
    const role = concept.conceptRole;
    if (domain === "math" || role === "theorem" || role === "formula") {
      const condResult = extractConditionResult(concept.anchorSentence, concept.supportSentences);
      if (condResult) return { surgicalReason: condResult.condition, rule: condResult.result };
    }
    if (domain === "science") {
      const mechConseq = extractMechConsequence(concept.anchorSentence, concept.supportSentences);
      if (mechConseq) return { surgicalReason: mechConseq.mechanism, rule: mechConseq.consequence };
    }
    if (domain === "clinical") {
      const findAction = extractFindingAction(concept.anchorSentence, concept.supportSentences);
      if (findAction) return { surgicalReason: findAction.finding, rule: findAction.action };
    }
    // Fallback: use distinct support sentences for each field to prevent duplication.
    const distinct = concept.supportSentences
      .map((s) => cleanSentence(s))
      .filter((s): s is string => Boolean(s) && s.toLowerCase().slice(0, 60) !== anchorClean.toLowerCase().slice(0, 60));
    return {
      surgicalReason: distinct[0] ?? "",
      rule: distinct[1] ?? distinct[0] ?? "",
    };
  })();

  const rawPattern = result.selected.pattern?.text ?? fallbackPattern;
  const rawReason  = result.selected.reason?.text  ?? synthesizedReason;
  const rawRule    = result.selected.rule?.text    ?? synthesizedRule;

  const compressedPattern = compressToRule(rawPattern, "recognition") ?? rawPattern;
  const compressedReason  = compressToRule(rawReason,  "mechanism")   ?? rawReason;
  const compressedRule    = compressToRule(rawRule,     "application") ?? rawRule;

  return {
    pattern:        normalizeLine(compressedPattern, fallbackPattern),
    surgicalReason: normalizeLine(compressedReason,  synthesizedReason),
    trap:           result.selected.trap?.text ? normalizeLine(result.selected.trap.text, "") : "",
    rule:           normalizeLine(compressedRule,    synthesizedRule),
  };
}

function roleLabelForPageStepRole(role: string): string {
  switch (role) {
    case "main_signal":  return "Core";
    case "explanation":  return "Why";
    case "support":      return "How";
    case "deepening":    return "More";
    case "trap":         return "!";
    default:             return "";
  }
}

function importanceLabel(level: ConceptBlockInput["importance"]): string {
  return { very_high: "VERY HIGH", high: "HIGH", medium: "MEDIUM", low: "LOW" }[level] ?? "MEDIUM";
}

// ---------------------------------------------------------------------------
// Cross-concept semantic deduplication
// ---------------------------------------------------------------------------

function jaccardWords(a: string, b: string): number {
  const stopwords = /^(the|a|an|is|are|was|were|of|to|in|and|or|but|for|with|from|that|this|it|its|by|at|on|as|be|not)$/i;
  const wa = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length > 3 && !stopwords.test(w)));
  const wb = new Set(b.toLowerCase().split(/\s+/).filter((w) => w.length > 3 && !stopwords.test(w)));
  if (wa.size === 0 && wb.size === 0) return 0;
  const inter = [...wa].filter((w) => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size;
  return union === 0 ? 0 : inter / union;
}

function deduplicateConceptBlocks(blocks: UltraConceptBlock[]): UltraConceptBlock[] {
  const kept: UltraConceptBlock[] = [];
  for (const block of blocks) {
    const isDuplicate = kept.some((k) => {
      const titleSim = jaccardWords(k.title, block.title);
      const patternSim = jaccardWords(k.pattern, block.pattern);
      return titleSim > 0.65 || patternSim > 0.72;
    });
    if (!isDuplicate) kept.push(block);
  }
  return kept;
}

function inferPageTitle(page: PageModelForConcepts, concepts: ConceptBlockInput[]): string {
  if (page.pageTitle?.trim()) return page.pageTitle.trim();

  // Use section heading from the page (strip leading "N.N " section numbers)
  const headingText = page.headings?.[0]?.text?.trim();
  if (headingText && headingText.length >= 4) {
    const stripped = headingText.replace(/^\d+(\.\d+)*\s+/, "").trim();
    const isGeneric = /^(key concepts?|learning objectives?|summary|review|study tips?|introduction|overview)\b/i.test(stripped);
    if (!isGeneric && stripped.length >= 4) return stripped;
  }

  // Prefer high-value concept title (theorem > formula > definition > mechanism) over example/detail
  const nonExampleConcept = concepts.find(
    (c) => c.conceptRole === "theorem" || c.conceptRole === "formula" ||
           c.conceptRole === "definition" || c.conceptRole === "mechanism"
  );
  if (nonExampleConcept?.title) return nonExampleConcept.title;
  if (concepts[0]?.title) return concepts[0].title;
  return `Page ${page.pageNumber}`;
}

// ---------------------------------------------------------------------------
// Concept centrality scoring
// ---------------------------------------------------------------------------

function extractKeyTerms(text: string): string[] {
  return text
    .replace(/[^a-zA-Z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 5)
    .map((w) => w.toLowerCase());
}

function computeConceptCentrality(
  anchorText: string,
  allParagraphTexts: string[],
): number {
  const keyTerms = extractKeyTerms(anchorText);
  if (!keyTerms.length) return 0;
  return allParagraphTexts.filter((p) =>
    keyTerms.some((t) => p.toLowerCase().includes(t))
  ).length;
}

// ---------------------------------------------------------------------------
// Chapter intro view builder
// ---------------------------------------------------------------------------

function buildChapterIntroView(
  pageModel: PageInsightModel,
  normResult: ClinicalNormalizationResult,
  domain: PageDomain,
  headingLines: string[],
): UltraPageView {
  // Extract chapter title: find "Chapter N" heading, strip the number prefix
  const chapterHeading = headingLines.find((l) => /^chapter\s+\d+\b/i.test(l.trim())) ?? headingLines[0] ?? "";
  const chapterTitle = chapterHeading.replace(/^chapter\s+\d+[:\s]*/i, "").trim() || chapterHeading;

  // Build coreIdea from canonical statements
  const stmts = normResult.canonicalStatements;
  const topStmt = stmts.find((s) => s.confidence >= 0.45 && !isExampleOrFiller(s.normalizedText));
  const coreIdea = topStmt
    ? `This chapter introduces ${chapterTitle.toLowerCase() || "key concepts"} — ${topStmt.normalizedText.charAt(0).toLowerCase()}${topStmt.normalizedText.slice(1)}`
    : `This chapter introduces ${chapterTitle.toLowerCase() || "concepts"} through foundational ideas explored in the pages ahead.`;

  // Build 2–3 roadmap blocks from canonical statements
  const roadmapStmts = stmts
    .filter((s) => !isExampleOrFiller(s.normalizedText) && s.normalizedText.length >= 20)
    .slice(0, 3);

  const blockTitles = ["Chapter Purpose", "Key Concept Preview", "Real-World Connection"];
  const blocks: UltraConceptBlock[] = roadmapStmts.map((s, i) => ({
    conceptId: `chapter-intro-${i}`,
    ordinal: i + 1,
    title: blockTitles[i] ?? `Preview ${i + 1}`,
    pattern: cleanSentence(s.normalizedText) || s.normalizedText,
    surgicalReason: "",
    trap: "",
    rule: "",
    importance: i === 0 ? "VERY HIGH" : "HIGH",
  }));

  // Forward-looking mini-test questions
  const topicPhrase = chapterTitle || "this topic";
  const miniTest = [
    `What central idea will ${topicPhrase} explain?`,
    roadmapStmts[0]
      ? `Why does understanding "${roadmapStmts[0].normalizedText.slice(0, 60).replace(/\.$/, "")}…" matter?`
      : `How will the concepts in this chapter connect to each other?`,
  ];

  // Compression: 2 roadmap bullets
  const compression = roadmapStmts.slice(0, 2).map((s, i) => `Rule ${i + 1}: ${s.normalizedText}`);

  void domain;
  return {
    title: `ULTRA – ${chapterTitle || "Chapter Introduction"}`,
    subtitle: "Chapter Introduction",
    coreIdea,
    blocks,
    miniTest,
    compression,
    steps: blocks.map((b) => ({ conceptId: b.conceptId, role: "main_signal", roleLabel: "Core" })),
    _debug: {
      pageKind: normResult.pageKind,
      domain,
      shouldRenderFullPanel: true,
      pageSummaryLength: (pageModel.pageSummary ?? "").length,
      coreIdeaSource: "pageSummary",
      conceptCandidates: [],
    },
  };
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildUltraPageView(
  pageModel: PageInsightModel,
  options?: {
    existingNormResult?: ClinicalNormalizationResult;
    teachingSynthesis?: TeachingSynthesis;
  }
): UltraPageView | null {
  // Reconstruct text from paragraphInsights for domain detection and any
  // fallback normalization. NOTE: when existingNormResult is provided we skip
  // re-classifying — the caller already ran normalizeClinicalText on the full
  // page text. Re-running on the filtered paragraphInsights text would
  // downgrade math pages (fewer signals in mainBody-only text) and break the
  // math bypass that relies on pageKind === "mathematical_exposition".
  const rawPageText = (pageModel.paragraphInsights ?? [])
    .map((p) => p.cleanedText || p.rawText || "")
    .filter(Boolean)
    .join(" ");

  const headingLines = (pageModel.paragraphInsights ?? [])
    .filter((p) => {
      const t = (p.cleanedText || p.rawText || "").trim();
      return t.length > 0 && t.length < 90 && !/[.!?]$/.test(t);
    })
    .slice(0, 6)
    .map((p) => p.cleanedText || p.rawText || "");

  const normResult = options?.existingNormResult ?? normalizeClinicalText({
    pageText: rawPageText,
    pageTitle: pageModel.pageSummary ?? undefined,
    pageNumber: pageModel.pageNumber ?? undefined,
    headingLines,
  });

  // Detect domain once — drives scoring and coreIdea selection downstream
  const domain = detectPageDomain(rawPageText);
  const symbolicDensity = domain === "math" ? detectSymbolicDensity(rawPageText) : "low";

  // Infer page teaching objective BEFORE concept extraction.
  // This is the top-down constraint: what is this page TRULY TEACHING?
  // Priority in summaryFallback: pageObjective > normResult.coreIdea > pageSummary > concepts.
  const pageObjective = inferPageObjective(
    headingLines,
    normResult.canonicalStatements ?? [],
    // ClinicalNormalizationResult includes coreIdea; cast defensively
    (normResult as unknown as { coreIdea?: string | null }).coreIdea ?? null,
    domain,
  );

  // Chapter intro pages: render a roadmap view instead of the full concept extraction panel.
  // chapter_title pages (no real prose) continue to return null below.
  if (normResult.pageKind === "chapter_intro") {
    return buildChapterIntroView(pageModel, normResult, domain, headingLines);
  }

  if (!normResult.shouldRenderFullPanel) {
    // Math pages where formula notation was stripped by PDF extraction may produce
    // few canonical statements yet still contain rich paragraph text. Allow render
    // when the domain is clearly math or there are explicit formula signals in the
    // processed paragraph text.
    const hasMathDomain = domain === "math";
    const hasFormulaInText = looksLikeMathFormula(rawPageText) || /\bderivative\b|\bintegral\b|\btheorem\b|\bcalculus\b/i.test(rawPageText);
    if (!hasMathDomain && !hasFormulaInText) return null;
  }

  console.log("[TRACE mathPipeline]", {
    pageNumber: pageModel.pageNumber,
    usedExistingNormResult: Boolean(options?.existingNormResult),
    pageKind: normResult.pageKind,
    domain,
    shouldRenderFullPanel: normResult.shouldRenderFullPanel,
    rawPageTextLength: rawPageText.length,
    paragraphInsightsCount: (pageModel.paragraphInsights ?? []).length,
  });
  console.log("[TRACE buildUltraPageView:entry]", { pageKind: normResult.pageKind, domain, shouldRenderFullPanel: normResult.shouldRenderFullPanel, mathOverride: !normResult.shouldRenderFullPanel });

  // Apply hard filter + teaching zone before concept extraction
  const validInsights = (pageModel.paragraphInsights ?? []).filter((p, arrayIdx) => {
    if (isValidCoreParagraph(p)) return true;
    // Always include the first 2 page-order paragraphs when they have ≥25 chars.
    // Same guard as the left-panel path — short intro paragraphs must survive into
    // findMainTeachingZone so structural position bonuses can apply to them.
    return arrayIdx <= 1 && (p.cleanedText || p.rawText || "").trim().length >= 25;
  });
  const zoneInsights = findMainTeachingZone(validInsights, { pageKind: normResult.pageKind });
  console.log("[TRACE buildUltraPageView:zone]", { validParagraphs: validInsights.length, teachingZoneSize: zoneInsights.length, zoneIsSubset: zoneInsights.length < validInsights.length });
  const page = adaptPageInsightModel({ ...pageModel, paragraphInsights: zoneInsights });
  page.domain = domain;
  let concepts = extractConceptBlocks(page);

  // Fallback: if zone filtering was too aggressive, retry with all valid insights
  if (!concepts.length && zoneInsights.length < validInsights.length) {
    const fallbackPage = adaptPageInsightModel({ ...pageModel, paragraphInsights: validInsights });
    fallbackPage.domain = domain;
    concepts = extractConceptBlocks(fallbackPage);
  }

  // Math fallback: when concept extraction returns empty on a math-classified page,
  // synthesize a minimal concept from canonicalStatements rather than returning null.
  // This fires when paragraphs are too short/noisy after splitting (e.g. limit notation
  // pages) but normalizeClinicalText already captured usable mathematical statements.
  if (!concepts.length &&
      (normResult.pageKind === "mathematical_exposition" || domain === "math") &&
      normResult.canonicalStatements.length > 0) {
    const mathFallbackPage: PageModelForConcepts = {
      documentId: pageModel.documentId ?? "",
      pageNumber: pageModel.pageNumber ?? 0,
      domain,
      sentences: normResult.canonicalStatements.map((s, i) => ({
        id: `math-stmt-${i}`,
        text: s.normalizedText,
        score: s.confidence,
      })),
      paragraphs: [{
        id: "math-fallback",
        text: normResult.canonicalStatements.map((s) => s.normalizedText).join(" "),
        sentenceIds: normResult.canonicalStatements.map((_, i) => `math-stmt-${i}`),
        score: 0.8,
      }],
    };
    concepts = extractConceptBlocks(mathFallbackPage);
  }

  // Post-extraction quality gate: filter out filler, narration, and non-teachable concepts
  // before they enter the right panel. Applied after all fallback paths complete.
  concepts = concepts.filter((c) => passesConceptQualityGate(c, pageObjective, domain));

  // Enforce educational hierarchy: sort by ROLE_PRIORITY descending so that
  // theorem/definition/mechanism always lead, and example/detail never anchor the list.
  concepts = enforceEducationalHierarchy(concepts);

  console.log("[TRACE buildUltraPageView:concepts]", { conceptCount: concepts.length, returnNull: concepts.length === 0 });
  if (!concepts.length) return null;

  // Core idea: pageSummary → domain chief_signal → support sentence → bare anchor
  const normalizedSummary = page.pageSummary;

  // Collect all paragraph texts for centrality scoring
  const allParagraphTexts = (page.paragraphs ?? []).map((p) => p.text ?? "").filter(Boolean);

  const chiefSignalText = (() => {
    const allCandidates: ClinicalPriorityCandidate[] = concepts.flatMap((c, ci) => [
      { id: `${ci}:anchor`, text: c.anchorSentence },
      ...c.supportSentences.map((s, si) => ({ id: `${ci}:sup${si}`, text: s })),
    ]);
    const ranked = scoreDomainPriority(allCandidates, domain);

    // Apply centrality re-ranking: concepts that recur across paragraphs rank higher.
    // This prevents a single-paragraph concept from winning over a page-spanning idea.
    const conceptsWithCentrality = concepts.map((c) => ({
      ...c,
      centralityScore: computeConceptCentrality(c.anchorSentence, allParagraphTexts),
    }));
    const rolePriorityMap = ROLE_PRIORITY as Record<string, number>;
    const centralityRanked = [...conceptsWithCentrality].sort((a, b) => {
      const rolePriorityA = rolePriorityMap[a.conceptRole ?? "detail"] ?? 1;
      const rolePriorityB = rolePriorityMap[b.conceptRole ?? "detail"] ?? 1;
      const blendA = rolePriorityA * 2 + a.centralityScore * 0.5 + a.score;
      const blendB = rolePriorityB * 2 + b.centralityScore * 0.5 + b.score;
      return blendB - blendA;
    });
    const topCentralConcept = centralityRanked[0];
    // For math: prefer formula + interpretation; for others: prefer "pattern" slot
    if (domain === "math") {
      // Prefer a definition-role sentence (convergence/limit language) as the primary signal.
      // Only fall back to a bare formula if no definition sentence exists.
      const defn = ranked.find((s) => s.role === "definition" && s.text.length >= 20);
      const formula = ranked.find((s) => s.role === "formula" && s.text.length >= 10);
      const interp  = ranked.find((s) => s.slot === "reason" && s.text.length >= 20 && s.text !== defn?.text && s.text !== formula?.text);
      if (defn) {
        // Optionally blend with a complementary formula for richness
        if (formula && !defn.text.includes(formula.text.slice(0, 10)) && defn.text.length + formula.text.length <= 220) {
          return `${defn.text} (${formula.text})`;
        }
        return defn.text;
      }
      if (formula && interp) return `${formula.text}: ${interp.text.toLowerCase().replace(/[.!?]+$/, "")}`;
      return formula?.text ?? topCentralConcept?.anchorSentence ?? null;
    }
    return (
      ranked.find((s) => s.slot === "pattern" && s.text.length >= 40)?.text ??
      (topCentralConcept?.centralityScore >= 2 ? topCentralConcept.anchorSentence : null) ??
      null
    );
  })();

  const summaryFallback = (() => {
    // Shared example/filler guard — used to reject all priority sources uniformly.
    // isExampleOrFiller from inferPageObjective covers named substances, filler openers,
    // and worked-example labels. isExampleAnchor extends it for inline example signals.
    const isExampleAnchor = (text: string): boolean => {
      if (isExampleOrFiller(text)) return true;
      const trimmed = text.trim();
      // Figure/table/box captions — these are NEVER educational principles
      if (/^(figure|fig\.|table|tab\.|box|plate|chart)\s+[\d.]+/i.test(trimmed)) return true;
      if (/\b(for example|for instance|such as|e\.g\.)\b/i.test(trimmed)) return true;
      if (/^(for example,?|for instance,?|to illustrate,?|consider )/i.test(text.trimStart())) return true;
      if (/^(example|solution|problem|exercise)\s*[\d.:)]*\s*$/i.test(trimmed)) return true;
      // Narrative/story fragments — not educational signals
      if (/^(then |suddenly |next,? |later,? |meanwhile )/i.test(text.trimStart())) return true;
      if (/^(he |she |they |it )\w/i.test(text.trimStart())) return true;
      return false;
    };

    // PRIORITY 0: Inferred page teaching objective.
    // This is the "what is this page REALLY TEACHING?" answer built top-down from
    // the heading topic + highest-confidence canonical statement from normalization.
    // It is the most trustworthy source because it bypasses sentence ranking entirely.
    const pageObjText = pageObjective?.teachingStatement;
    if (pageObjText && pageObjText.length >= 25 && !isExampleAnchor(pageObjText)) return pageObjText;

    // PRIORITY 0.5: normResult.coreIdea from canonical-statement scoring.
    // normalizeClinicalText independently scores and ranks statements; its coreIdea
    // reflects the highest-confidence definition/rule on the page.
    const normCoreIdea =
      (normResult as unknown as { coreIdea?: string | null }).coreIdea ?? null;
    if (normCoreIdea && normCoreIdea.length >= 30 && !isExampleAnchor(normCoreIdea)) return normCoreIdea;

    // PRIORITY 1: page.pageSummary (AI-generated)
    if (normalizedSummary && normalizedSummary.length >= 30 && !isExampleAnchor(normalizedSummary)) {
      return normalizedSummary;
    }

    // PRIORITY 2+: concept anchors — definition → mechanism → chiefSignal → top non-example.

    const definitionConcept = concepts.find(
      (c) => (c.conceptRole === "theorem" || c.conceptRole === "definition") && !isExampleAnchor(c.anchorSentence)
    );
    if (definitionConcept) {
      // Synthesize: if there's also a mechanism, blend definition + mechanism for richer core idea
      const mechConcept = concepts.find(
        (c) => c.conceptRole === "mechanism" && !isExampleAnchor(c.anchorSentence) && c.id !== definitionConcept.id
      );
      if (mechConcept && definitionConcept.anchorSentence.length + mechConcept.anchorSentence.length <= 300) {
        return `${definitionConcept.anchorSentence} ${mechConcept.anchorSentence}`;
      }
      return definitionConcept.anchorSentence;
    }

    // 2. Mechanism (if no definition)
    const mechConcept = concepts.find(
      (c) => c.conceptRole === "mechanism" && !isExampleAnchor(c.anchorSentence)
    );
    if (mechConcept) return mechConcept.anchorSentence;

    if (chiefSignalText) return chiefSignalText;

    // 3. Last resort — top concept (skip example/detail anchors if alternatives exist)
    const top = concepts[0];
    if (!top) return "";
    const nonExampleTop = concepts.find((c) => c.conceptRole !== "example" && c.conceptRole !== "detail" && c.conceptRole !== "worked_example" && c.conceptRole !== "analogy");
    const candidate = nonExampleTop ?? top;
    return candidate.supportSentences.find((s) => s.length >= 40) ?? candidate.anchorSentence ?? "";
  })();

  // Build a meaningful fallback from heading + strongest non-example concept.
  // Never emit generic filler — "This page develops one core idea…" tells the student nothing.
  const headingFallbackText = (() => {
    const h = page.headings?.[0]?.text?.trim().replace(/^\d+(\.\d+)*\s+/, "") || "";
    const topTeachable = concepts.find(
      (c) => c.conceptRole !== "example" && c.conceptRole !== "detail" &&
             c.conceptRole !== "worked_example" && c.conceptRole !== "analogy"
    );
    if (h && topTeachable) {
      const anchor = topTeachable.anchorSentence.slice(0, 140).replace(/\.$/, "");
      return `${anchor}.`;
    }
    if (h) return `This page introduces ${h.charAt(0).toLowerCase()}${h.slice(1)}.`;
    if (topTeachable) return topTeachable.anchorSentence;
    return concepts[0]?.anchorSentence ?? "";
  })();
  const coreIdea = normalizeLine(summaryFallback, headingFallbackText);
  // Math override applied after block construction via mathCoreIdeaOverride below

  // Math enhancement — normalize titles, extract condition/result fields, detect procedures
  const isMathPage = domain === "math";
  const mathProcedureSteps = isMathPage
    ? extractProcedureSteps(pageModel.paragraphInsights ?? [])
    : [];
  const mathCoreIdeaOverride = isMathPage
    ? buildMathCoreIdea(pageModel.paragraphInsights ?? [], concepts)
    : null;

  // Concept blocks — pass domain so field scoring is domain-aware
  const blocks: UltraConceptBlock[] = concepts.map((c, i) => {
    const fields = buildConceptFields(c, coreIdea, domain);

    // Title normalization (math and science)
    const isSciencePage = domain === "science";
    const title = isMathPage
      ? normalizeMathTitle(c.title, c.anchorSentence)
      : isSciencePage
        ? normalizeScienceTitle(c.title, c.anchorSentence)
        : c.title;

    // Math field override: extract condition/result from anchor
    let surgicalReason = fields.surgicalReason;
    let rule = fields.rule;
    if (isMathPage && c.anchorSentence) {
      const mathFields = extractMathFields(c.anchorSentence);
      if (mathFields.condition && mathFields.condition.length >= 6) surgicalReason = mathFields.condition;
      if (mathFields.result && mathFields.result.length >= 6)    rule = mathFields.result;
    }

    // Science field dedup: ensure Mechanism (surgicalReason) ≠ Definition (pattern).
    // If both fields resolve to the same sentence, find the next distinct support sentence.
    if (isSciencePage) {
      const patNorm = fields.pattern.toLowerCase().slice(0, 70);
      const reasonNorm = surgicalReason.toLowerCase().slice(0, 70);
      if (patNorm === reasonNorm || (patNorm.length > 20 && reasonNorm.startsWith(patNorm.slice(0, 40)))) {
        const distinct = (c.supportSentences ?? [])
          .map((s) => cleanSentence(s) ?? "")
          .filter((s) => s.length >= 15 && s.toLowerCase().slice(0, 70) !== patNorm);
        if (distinct[0]) surgicalReason = distinct[0];
      }
    }

    // Attach procedure steps to the first concept block on math pages
    const procedureSteps = (isMathPage && i === 0 && mathProcedureSteps.length >= 2)
      ? mathProcedureSteps
      : undefined;

    // Math given field (input formula/state) — extracted first so transformation can avoid repeating it
    const given = isMathPage
      ? extractMathGiven(c.anchorSentence, c.supportSentences ?? []) ?? undefined
      : undefined;

    // Math transformation field (symbolic step between condition and result).
    // Strip the Given prefix if present — transformation should explain the *why*, not restate the input.
    const rawTransformation = isMathPage
      ? extractMathTransformation(c.anchorSentence, c.supportSentences ?? []) ?? undefined
      : undefined;
    const transformation = (() => {
      if (!rawTransformation) return undefined;
      if (given) {
        const givenNorm = given.replace(/\s+/g, "").toLowerCase();
        const transNorm = rawTransformation.replace(/\s+/g, "").toLowerCase();
        // If transformation starts with the same formula as given (e.g. "aₙ=1/n → 0"), trim the lhs
        if (transNorm.startsWith(givenNorm.slice(0, Math.min(givenNorm.length, 12)))) {
          const arrowIdx = rawTransformation.indexOf("→");
          if (arrowIdx > 0) return rawTransformation.slice(arrowIdx).trim();
        }
      }
      return rawTransformation;
    })();

    // Math decision field (convergence/divergence verdict)
    const decision = isMathPage
      ? extractMathDecision(c.anchorSentence, c.supportSentences ?? []) ?? undefined
      : undefined;

    // Science example field (concrete instance sentence)
    const example = isSciencePage
      ? extractScienceExample(c.anchorSentence, c.supportSentences ?? []) ?? undefined
      : undefined;

    // Science memory hook (analogy/mnemonic sentence)
    const memoryHook = isSciencePage
      ? extractScienceMemoryHook(c.anchorSentence, c.supportSentences ?? []) ?? undefined
      : undefined;

    // Stabilize all prose fields before returning — enforces readability constraints
    const stab = (text: string | undefined | null) =>
      text ? (stabilizeOutput(text, domain) || text) : text;

    return {
      conceptId: c.id,
      ordinal: i + 1,
      title,
      ...fields,
      pattern:        stab(fields.pattern) || fields.pattern,
      surgicalReason: stab(surgicalReason) || surgicalReason,
      trap:           stab(fields.trap)    || fields.trap,
      rule:           stab(rule)           || rule,
      importance: importanceLabel(c.importance),
      conceptRole: c.conceptRole,
      anchorText: c.anchorSentence ?? undefined,
      procedureSteps,
      transformation,
      given,
      decision,
      example,
      memoryHook,
    };
  });

  // Cross-concept deduplication: drop blocks that are near-duplicates of an earlier block
  const dedupedBlocks = deduplicateConceptBlocks(blocks);

  // Shared step model: drives mini test and enriches compression candidates.
  // Synthetic neighborhoods are built from concept data so both sides stay in sync.
  const pageStepResult = buildPageStepModel({
    pageKey: `${page.documentId}:${page.pageNumber}`,
    pageTitle: inferPageTitle(page, concepts),
    pageSummary: page.pageSummary ?? undefined,
    domain: domain as import("@/lib/reading-graph/buildPageStepModel").StepModelPageDomain,
    symbolicDensity,
    conceptBlocks: dedupedBlocks.map((b, i) => ({
      id: concepts[i]?.id ?? b.conceptId,
      title: b.title,
      pattern: b.pattern,
      surgicalReason: b.surgicalReason,
      trap: b.trap,
      rule: b.rule,
      importance: b.importance,
    })),
    highlightNeighborhoods: concepts.map((c) => ({
      id: c.id,
      title: c.title,
      anchor: { id: `${c.id}:a`, text: c.anchorSentence },
      support: c.supportSentences.map((s, i) => ({ id: `${c.id}:s${i}`, text: s })),
      additional: [],
      trap: c.trapCandidates[0] ? { id: `${c.id}:t`, text: c.trapCandidates[0] } : null,
    })),
    supportNeighborhoods: concepts.map((c) => ({
      id: c.id,
      title: c.title,
      anchor: c.anchorSentence,
      support: c.supportSentences,
      additional: [],
      trap: c.trapCandidates[0] ?? null,
    })),
  });

  // Mini test: role-balanced selection in step order from shared step model
  const miniTestCandidates: MiniTestQuestionCandidate[] = pageStepResult.steps.flatMap((step) =>
    (["coreMeaning", "mechanism", "distinction", "application", "skimTrap", "whatHappensIf", "nextStep", "compareContrast"] as MiniTestRole[]).map((role) => ({
      id: `${step.id}:${role}`,
      stepId: step.id,
      stepOrder: step.order,
      role,
      text: step.miniTest[role] ?? "",
    }))
  ).filter((c) => Boolean(c.text));
  const miniTestResult = selectMiniTestQuestions({ candidates: miniTestCandidates, maxQuestions: 5 });
  const miniTest = miniTestResult.questions.map((q) => q.text);

  // STR Compression: keep sophisticated anti-dup + synthesis, enrich with step hooks
  const compressionInput: BuildCompressionRulesInput = {
    pageKey: `${page.documentId}:${page.pageNumber}`,
    pageTitle: inferPageTitle(page, concepts),
    pageSummary: page.pageSummary ?? undefined,
    conceptBlocks: dedupedBlocks.map((b, i) => ({
      id: concepts[i]?.id ?? b.conceptId,
      title: b.title,
      pattern: b.pattern,
      reason: b.surgicalReason,
      trap: b.trap,
      rule: b.rule,
      importance: b.importance,
    })),
    supportNeighborhoods: [
      // Primary: concept-level neighborhoods
      ...concepts.map((c) => ({
        id: c.id,
        title: c.title,
        anchor: c.anchorSentence,
        support: c.supportSentences,
        trap: c.trapCandidates[0] ?? null,
      })),
      // Supplemental: step model compression hooks as additional synthesized candidates
      ...pageStepResult.steps.map((step, i) => ({
        id: `step-synth-${i}`,
        title: step.right.title,
        anchor: step.compression.recognitionHook ?? null,
        support: [
          step.compression.mechanismHook,
          step.compression.applicationHook,
        ].filter((s): s is string => Boolean(s)),
        trap: step.compression.boundaryHook ?? null,
      })),
    ],
  };

  const compressionResult = buildCompressionRules(compressionInput);
  const sourceRank = (src: string) =>
    src === "synthesized" ? 4 : src.startsWith("neighborhood") ? 3 : src.startsWith("block") ? 2 : 1;
  const sortedRules = [...compressionResult.rules].sort(
    (a, b) => sourceRank(b.source) - sourceRank(a.source) || b.score - a.score
  );
  const compression = sortedRules.slice(0, 3).map((r, i) => `Rule ${i + 1}: ${r.text}`);

  const steps: UltraPageViewStep[] = pageStepResult.steps.map((step) => ({
    conceptId: step.left.neighborhoodId ?? "",
    role: step.role,
    roleLabel: roleLabelForPageStepRole(step.role),
  }));

  const coreIdeaSource: UltraPageViewDebug["coreIdeaSource"] =
    normalizedSummary && normalizedSummary.length >= 30
      ? "pageSummary"
      : concepts.find((c) => c.conceptRole === "definition")
      ? "definitionRole"
      : chiefSignalText
      ? "chiefSignal"
      : concepts[0]?.supportSentences.find((s) => s.length >= 40)
      ? "supportSentence"
      : concepts[0]?.anchorSentence
      ? "anchorFallback"
      : "hardFallback";

  const _debug: UltraPageViewDebug = {
    pageKind: normResult.pageKind,
    domain,
    shouldRenderFullPanel: normResult.shouldRenderFullPanel,
    pageSummaryLength: (pageModel.pageSummary ?? "").length,
    coreIdeaSource,
    conceptCandidates: concepts.map((c) => ({
      id: c.id,
      title: c.title,
      score: c.score,
      anchorLen: c.anchorSentence.length,
      role: c.conceptRole,
    })),
  };

  console.log("[ULTRA DEBUG]", {
    pageKey: `${page.documentId}:${page.pageNumber}`,
    ..._debug,
    coreIdea,
    blocks: blocks.map((b) => ({ id: b.conceptId, title: b.title })),
    miniTestCount: miniTest.length,
    compressionCount: compression.length,
  });

  // Apply teaching synthesis when available.
  // Synthesis is the LLM-reasoned professor layer — it supersedes heuristic outputs.
  // Page-level fields (coreIdea, mechanism, trap, application) replace heuristic equivalents.
  // Per-concept fields overlay matching blocks by index, preserving structure.
  const synthesis = options?.teachingSynthesis;

  const finalCoreIdea = synthesis?.coreIdea && synthesis.coreIdea.length >= 20
    ? synthesis.coreIdea
    : coreIdea;

  // Page-level synthesis fields fed into compression rules
  const synthesisMechanism = synthesis?.mechanism?.trim() || null;
  const synthesisRule      = synthesis?.rule?.trim()      || null;
  const synthesisTrap      = synthesis?.trap?.trim()      || null;
  const synthesisApp       = synthesis?.application?.trim() || null;
  const synthesisReasoningFlow = synthesis?.reasoningFlow?.trim() || null;

  const finalCompression = (() => {
    const raw = (() => {
      if (!synthesis) return compression;
      const extras: string[] = [];
      if (synthesisMechanism) extras.push(`How: ${synthesisMechanism}`);
      if (synthesisRule)      extras.push(`Rule: ${synthesisRule}`);
      if (synthesisTrap)      extras.push(`Trap: ${synthesisTrap}`);
      if (synthesisApp)       extras.push(`Apply: ${synthesisApp}`);
      if (synthesisReasoningFlow) extras.push(`Flow: ${synthesisReasoningFlow}`);
      return [...extras, ...compression];
    })();
    // Demote weak fragments and verbatim-long sentences — keep only strong signals
    return raw.filter((line) => !isWeakFragment(line)).slice(0, 5);
  })();

  const finalMiniTest = (() => {
    const raw = synthesis?.miniTests?.length
      ? synthesis.miniTests.slice(0, 5)
      : miniTest;
    return raw.filter((q) => !isWeakFragment(q));
  })();

  const finalBlocks = synthesis?.concepts?.length
    ? dedupedBlocks.map((b, i) => {
        const sc = synthesis.concepts[i];
        if (!sc) return b;
        return {
          ...b,
          pattern:        sc.principle?.trim()  || b.pattern,
          surgicalReason: sc.mechanism?.trim()  || b.surgicalReason,
          trap:           sc.trap?.trim()       ?? b.trap,
          rule:           sc.rule?.trim()       || b.rule,
          misconception:  sc.misconception?.trim() || undefined,
          examHook:       sc.examHook?.trim()      || undefined,
        };
      })
    : dedupedBlocks;

  // Page Thesis: operator-rewritten deepest understanding target
  const rawThesisSrc = page.pageSummary || finalCoreIdea;
  const pageThesis = (() => {
    const compressed = compressToNote(rawThesisSrc, "signal");
    const stabilized = stabilizeOutput(compressed || rawThesisSrc, domain);
    return stabilized || finalCoreIdea;
  })();
  const oneLineSummary = compressToOneLine(pageThesis, domain);

  return {
    title: `ULTRA – ${inferPageTitle(page, concepts)}`,
    subtitle: "STR + PDRM + Surgical Comprehension Engine",
    coreIdea: (isMathPage && mathCoreIdeaOverride) ? mathCoreIdeaOverride : finalCoreIdea,
    teachingStatement: pageObjective?.teachingStatement || undefined,
    pageThesis,
    oneLineSummary,
    blocks: finalBlocks,
    miniTest: finalMiniTest,
    compression: finalCompression,
    steps,
    domain,
    crossLinkHints: (() => {
      if (synthesis?.crossLinkHints?.length) return synthesis.crossLinkHints;
      const crossLinkInputs: CrossLinkInput[] = concepts.map((c) => ({ title: c.title, anchorSentence: c.anchorSentence }));
      return buildCrossLinkHints(crossLinkInputs, domain);
    })(),
    sriModel: (() => {
      const insights = (pageModel.paragraphInsights ?? []).filter((p) => p.paragraphType !== "noise" && (p.cleanedText || p.rawText || "").trim().length > 30);
      if (insights.length === 0) return undefined;
      return buildSRIModel(insights, domain);
    })(),
    _debug,
  };
}
