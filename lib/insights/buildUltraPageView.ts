// lib/insights/buildUltraPageView.ts
// Converts a PageInsightModel into the ULTRA structured right-panel view.
// All fields are complete sentences — no fragments.
//
// Architecture: buildPageStepModel is the shared step model that drives
// mini test and STR compression so they are page-native, not template-like.

import type { PageInsightModel } from "@/lib/insights/types";
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

export interface UltraPageView {
  title: string;
  subtitle: string;
  coreIdea: string;
  blocks: UltraConceptBlock[];
  miniTest: string[];
  compression: string[];
  steps: UltraPageViewStep[];
}

// ---------------------------------------------------------------------------
// Adapter: PageInsightModel → PageModelForConcepts
// ---------------------------------------------------------------------------

export function adaptPageInsightModel(pageModel: PageInsightModel): PageModelForConcepts {
  const allSentences: SourceSentence[] = [];
  const sourceParagraphs: SourceParagraph[] = [];

  for (const p of (pageModel.paragraphInsights ?? [])) {
    const sentenceIds: string[] = [];

    type ScoredText = { text: string; score: number };
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

function buildConceptFields(concept: ConceptBlockInput, coreIdea: string): BuiltFields {
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

  const result = dedupeSections(candidates, coreIdea);

  const fallbackPattern = cleanSentence(concept.anchorSentence) || "This concept introduces a central idea on the page.";
  const fallbackReason = "This concept matters because it explains how the page's main idea works.";
  const fallbackTrap = `Do not confuse ${concept.title.toLowerCase()} with nearby supporting details on the page.`;
  const fallbackRule = "Use this as the key rule from the page.";

  return {
    pattern:        normalizeLine(result.selected.pattern?.text       ?? fallbackPattern, fallbackPattern),
    surgicalReason: normalizeLine(result.selected.reason?.text        ?? fallbackReason,  fallbackReason),
    trap:           normalizeLine(result.selected.trap?.text          ?? fallbackTrap,    fallbackTrap),
    rule:           normalizeLine(result.selected.rule?.text          ?? fallbackRule,    fallbackRule),
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

  const page = adaptPageInsightModel(pageModel);
  const concepts = extractConceptBlocks(page);

  if (!concepts.length) return null;

  // Use the normalization engine's coreIdea when it's sharper than the model summary.
  const normalizedSummary = normResult.coreIdea ?? page.pageSummary;

  const coreIdea = normalizeLine(
    normalizedSummary ?? concepts[0]?.anchorSentence ?? "",
    "This page develops one core idea through a small set of connected concepts."
  );

  // Concept blocks use buildConceptFields + dedupeSections for field quality.
  const blocks: UltraConceptBlock[] = concepts.map((c, i) => {
    const fields = buildConceptFields(c, coreIdea);
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

  return {
    title: `ULTRA – ${inferPageTitle(page, concepts)}`,
    subtitle: "STR + PDRM + Surgical Comprehension Engine",
    coreIdea,
    blocks,
    miniTest,
    compression,
    steps,
  };
}
