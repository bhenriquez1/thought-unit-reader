// lib/insights/buildUltraPageView.ts
// Converts a PageInsightModel into the ULTRA structured right-panel view.
// All fields are complete sentences — no fragments.
//
// Architecture: buildPageStepModel is the shared step model that drives
// mini test and STR compression so they are page-native, not template-like.

import type { PageInsightModel, ParagraphInsight } from "@/lib/insights/types";
import { cleanSentence } from "./sentenceCleanup";
import { isRenderableSentence } from "./isRenderableSentence";
import {
  extractConceptBlocks,
  type ConceptBlockInput,
  type PageModelForConcepts,
  type SourceSentence,
  type SourceParagraph,
} from "./extractConceptBlocks";
import {
  TRAP_RE,
  REASON_RE,
  RULE_RE,
  dedupeSections,
  type SectionCandidate,
  type SectionKind,
} from "./dedupeSectionCandidates";
import { buildCompressionRules, type BuildCompressionRulesInput } from "./buildCompressionRules";
import { buildPageStepModel } from "@/lib/reading-graph/buildPageStepModel";
import {
  selectMiniTestQuestions,
  type MiniTestQuestionCandidate,
  type MiniTestRole,
} from "./selectMiniTestQuestions";
import { normalizeClinicalText, type ClinicalNormalizationResult } from "@/lib/normalization/normalizeClinicalText";
import { detectPageDomain, type PageDomain } from "./detectPageDomain";
import { findMainTeachingZone } from "./findMainTeachingZone";
import { scoreDomainPriority, type DomainPriorityScore } from "./scoreDomainPriority";
import type { ClinicalPriorityCandidate } from "./scoreClinicalPriority";

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
  blocks: UltraConceptBlock[];
  miniTest: string[];
  compression: string[];
  steps: UltraPageViewStep[];
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

  const paragraphs = pageModel.paragraphInsights ?? [];
  // Pre-compute first raw sentence per paragraph index for cross-paragraph support context.
  // Single-sentence paragraphs (e.g. isolated definitions) get the next paragraph's opening
  // sentence as a low-score support candidate so they can produce non-empty supportSentences.
  const firstRawByIdx = paragraphs.map((p) =>
    splitRawSentences(p.cleanedText || p.rawText || "")[0] ?? null
  );

  for (const [idx, p] of paragraphs.entries()) {
    const sentenceIds: string[] = [];
    // Structural position bonus: intro-zone paragraphs get elevated scores so their
    // sentences win the anchor competition over denser example sections further down.
    const structBonus = computeStructuralPositionBonus(paragraphs, p);

    type ScoredText = { text: string; score: number };
    const rawSentences = splitRawSentences(p.cleanedText || p.rawText || "");
    const inputs: ScoredText[] = [
      // Raw verbatim PDF sentences are the primary anchor pool — they match PDF spans directly.
      // Scored above AI-enriched fields so the anchor is always findable text, not a rewrite.
      ...rawSentences.map((t, i) => ({
        text: t,
        score: Math.max(0.55, p.priorityScore * 2.0 - i * 0.15 + structBonus),
      })),
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
        score: p.priorityScore + structBonus,
      });
    }
  }

  return {
    documentId: pageModel.documentId ?? "",
    pageNumber: pageModel.pageNumber ?? 0,
    pageTitle: undefined,
    pageSummary: pageModel.topTakeaways?.[0] ?? pageModel.pageSummary ?? undefined,
    headings: [],
    paragraphs: sourceParagraphs,
    sentences: allSentences,
  };
}

// ---------------------------------------------------------------------------
// Field builders — each must occupy a distinct semantic role
// ---------------------------------------------------------------------------

function normalizeLine(text: string, fallback: string): string {
  const cleaned = cleanSentence(text ?? "");
  return isRenderableSentence(cleaned) ? cleaned : fallback;
}

interface BuiltFields {
  pattern: string;
  surgicalReason: string;
  trap: string;
  rule: string;
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

  const anchorClean = cleanSentence(concept.anchorSentence) || "";
  const firstSupport = cleanSentence(concept.supportSentences[0] ?? "") || "";

  // Page-native fallbacks: use actual page text, never generic template strings.
  // Reason/rule must NOT fall back to anchor — an empty field is better than repeating pattern.
  const fallbackPattern = anchorClean || "This concept introduces a central idea on the page.";
  const pageNativeReason = firstSupport;
  const pageNativeRule = firstSupport;

  return {
    pattern:        normalizeLine(result.selected.pattern?.text ?? fallbackPattern, fallbackPattern),
    surgicalReason: normalizeLine(result.selected.reason?.text  ?? pageNativeReason, pageNativeReason),
    trap:           result.selected.trap?.text ? normalizeLine(result.selected.trap.text, "") : "",
    rule:           normalizeLine(result.selected.rule?.text    ?? pageNativeRule,   pageNativeRule),
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

function inferPageTitle(page: PageModelForConcepts, concepts: ConceptBlockInput[]): string {
  if (page.pageTitle?.trim()) return page.pageTitle.trim();
  if (concepts[0]?.title) return concepts[0].title;
  return `Page ${page.pageNumber}`;
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildUltraPageView(
  pageModel: PageInsightModel,
  options?: { existingNormResult?: ClinicalNormalizationResult }
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
  let concepts = extractConceptBlocks(page);

  // Fallback: if zone filtering was too aggressive, retry with all valid insights
  if (!concepts.length && zoneInsights.length < validInsights.length) {
    const fallbackPage = adaptPageInsightModel({ ...pageModel, paragraphInsights: validInsights });
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

  console.log("[TRACE buildUltraPageView:concepts]", { conceptCount: concepts.length, returnNull: concepts.length === 0 });
  if (!concepts.length) return null;

  // Core idea: pageSummary → domain chief_signal → support sentence → bare anchor
  const normalizedSummary = page.pageSummary;

  const chiefSignalText = (() => {
    const allCandidates: ClinicalPriorityCandidate[] = concepts.flatMap((c, ci) => [
      { id: `${ci}:anchor`, text: c.anchorSentence },
      ...c.supportSentences.map((s, si) => ({ id: `${ci}:sup${si}`, text: s })),
    ]);
    const ranked = scoreDomainPriority(allCandidates, domain);
    // For math: prefer formula + interpretation; for others: prefer "pattern" slot
    if (domain === "math") {
      const formula = ranked.find((s) => s.slot === "pattern" && s.text.length >= 10);
      const interp  = ranked.find((s) => s.slot === "reason"  && s.text.length >= 20 && s.text !== formula?.text);
      if (formula && interp) return `${formula.text}: ${interp.text.toLowerCase().replace(/[.!?]+$/, "")}`;
      return formula?.text ?? null;
    }
    return ranked.find((s) => s.slot === "pattern" && s.text.length >= 40)?.text ?? null;
  })();

  const summaryFallback = (() => {
    if (normalizedSummary && normalizedSummary.length >= 30) return normalizedSummary;
    // Prefer the definition-role concept anchor as the core idea source
    const definitionConcept = concepts.find((c) => c.conceptRole === "definition");
    if (definitionConcept) return definitionConcept.anchorSentence;
    if (chiefSignalText) return chiefSignalText;
    const top = concepts[0];
    if (!top) return "";
    return top.supportSentences.find((s) => s.length >= 40) ?? top.anchorSentence ?? "";
  })();

  const coreIdea = normalizeLine(
    summaryFallback,
    "This page develops one core idea through a small set of connected concepts."
  );

  // Concept blocks — pass domain so field scoring is domain-aware
  const blocks: UltraConceptBlock[] = concepts.map((c, i) => {
    const fields = buildConceptFields(c, coreIdea, domain);
    return {
      conceptId: c.id,
      ordinal: i + 1,
      title: c.title,
      ...fields,
      importance: importanceLabel(c.importance),
    };
  });

  // Shared step model: drives mini test and enriches compression candidates.
  // Synthetic neighborhoods are built from concept data so both sides stay in sync.
  const pageStepResult = buildPageStepModel({
    pageKey: `${page.documentId}:${page.pageNumber}`,
    pageTitle: inferPageTitle(page, concepts),
    pageSummary: page.pageSummary ?? undefined,
    conceptBlocks: blocks.map((b, i) => ({
      id: concepts[i].id,
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
    (["coreMeaning", "mechanism", "distinction", "application", "skimTrap"] as MiniTestRole[]).map((role) => ({
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
    conceptBlocks: blocks.map((b, i) => ({
      id: concepts[i].id,
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

  return {
    title: `ULTRA – ${inferPageTitle(page, concepts)}`,
    subtitle: "STR + PDRM + Surgical Comprehension Engine",
    coreIdea,
    blocks,
    miniTest,
    compression,
    steps,
    _debug,
  };
}
