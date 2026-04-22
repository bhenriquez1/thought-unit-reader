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
import { normalizeClinicalText } from "@/lib/normalization/normalizeClinicalText";
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
  return /[=∫∂∑]|lim\b|d\/d[xt]|\\frac|\\int|\\sum|\bderivative\b|\bintegral\b/i.test(text);
}

function hasMathExplanationSignal(text: string): boolean {
  return (
    looksLikeMathFormula(text) ||
    /\bfunction\b|\bsequence\b|\bdepends on\b|\brepresented\b|\bgraph\b|\bmodel\b|\bquantity\b|\brate\b|\bvalue\b/i.test(text)
  );
}

export function isValidCoreParagraph(p: ParagraphInsight): boolean {
  const text = (p.cleanedText || p.rawText || "").trim();
  if (!text || p.paragraphType === "noise") return false;
  // Formula paragraphs (by type or by content): bypass length and explanation-signal checks
  if (p.paragraphType === "formula" || looksLikeMathFormula(text)) return text.length >= 12;
  // Math explanation paragraphs: lower threshold — a 40-char definition is still valid
  if (hasMathExplanationSignal(text)) {
    if (text.length < 40) return false;
    if (/^(figure\s*\d|fig\.\s*\d|table\s*\d|diagram\s*\d|image\s*\d)/i.test(text)) return false;
    if (/^(chapter\s+\d|section\s+\d|table\s+of\s+contents)/i.test(text)) return false;
    return true;
  }
  if (text.length < 80) return false;
  // Reject figure captions, table headers, diagram labels
  if (/^(figure\s*\d|fig\.\s*\d|table\s*\d|diagram\s*\d|image\s*\d)/i.test(text)) return false;
  // Reject structural / TOC content
  if (/^(chapter\s+\d|section\s+\d|key\s+concepts?|learning\s+objectives?|table\s+of\s+contents)/i.test(text)) return false;
  // Must carry at least one explanation signal
  return /\b(is|are|was|were|causes?|leads?\s+to|results?\s+in|depends?|occurs?|because|means?|defined\s+as|refers?\s+to|consists?\s+of|involves?)\b/i.test(text);
}

// ---------------------------------------------------------------------------
// Adapter: PageInsightModel → PageModelForConcepts
// ---------------------------------------------------------------------------

function splitRawSentences(text: string): string[] {
  if (!text) return [];
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z"'])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20);
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

    type ScoredText = { text: string; score: number };
    const rawSentences = splitRawSentences(p.cleanedText || p.rawText || "");
    const inputs: ScoredText[] = [
      p.summary           ? { text: p.summary,  score: p.priorityScore * 3 } : null,
      ...(p.coreSignals ?? []).map((t, i) => ({ text: t, score: p.priorityScore * (2 - i * 0.25) })),
      ...(p.takeaways   ?? []).map((t)    => ({ text: t, score: p.priorityScore })),
      ...(p.traps       ?? []).map((t)    => ({ text: t, score: p.priorityScore * 1.5 })),
      ...(p.logicChains ?? []).flatMap((lc) => [
        lc.because ? { text: lc.because, score: p.priorityScore * 2.5 } : null,
        lc.trap    ? { text: lc.trap,    score: p.priorityScore * 1.8 } : null,
        (lc.if && lc.then) ? { text: `${lc.if}, therefore ${lc.then}`, score: p.priorityScore * 1.5 } : null,
      ]),
      // Raw sentences from cleanedText — ensures all paragraph content is available
      // even when derived fields (coreSignals, logicChains) are sparse.
      // Score is lower than derived fields so enriched signals still win anchor selection.
      ...rawSentences.map((t, i) => ({
        text: t,
        score: Math.max(0.5, p.priorityScore * 0.75 - i * 0.1),
      })),
      // Cross-paragraph context: for single-sentence paragraphs, add the first sentence
      // of the next paragraph as a low-score support candidate. This prevents isolated
      // definition sentences from always producing empty supportSentences.
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
        score: p.priorityScore,
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

export function buildUltraPageView(pageModel: PageInsightModel): UltraPageView | null {
  // --- Normalization gate: suppress non-instructional pages ---
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

  const normResult = normalizeClinicalText({
    pageText: rawPageText,
    pageTitle: pageModel.pageSummary ?? undefined,
    pageNumber: pageModel.pageNumber ?? undefined,
    headingLines,
  });

  if (!normResult.shouldRenderFullPanel) return null;

  // Detect domain once — drives scoring and coreIdea selection downstream
  const domain = detectPageDomain(rawPageText);

  // Apply hard filter + teaching zone before concept extraction
  const validInsights = (pageModel.paragraphInsights ?? []).filter(isValidCoreParagraph);
  const zoneInsights = findMainTeachingZone(validInsights);
  const page = adaptPageInsightModel({ ...pageModel, paragraphInsights: zoneInsights });
  let concepts = extractConceptBlocks(page);

  // Fallback: if zone filtering was too aggressive, retry with all valid insights
  if (!concepts.length && zoneInsights.length < validInsights.length) {
    const fallbackPage = adaptPageInsightModel({ ...pageModel, paragraphInsights: validInsights });
    concepts = extractConceptBlocks(fallbackPage);
  }

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
