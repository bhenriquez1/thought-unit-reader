// lib/insights/buildUltraPageView.ts
// Converts a PageInsightModel into the ULTRA structured right-panel view.
// All fields are complete sentences — no fragments.

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
  selectDistinctForRole,
  isTooSimilar,
  TRAP_RE,
} from "./dedupeSectionCandidates";

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface UltraConceptBlock {
  ordinal: number;
  title: string;
  pattern: string;
  surgicalReason: string;
  trap: string;
  rule: string;
  importance: string;
}

export interface UltraPageView {
  title: string;
  subtitle: string;
  coreIdea: string;
  blocks: UltraConceptBlock[];
  miniTest: string[];
  compression: string[];
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

function renderable(s: string): boolean {
  return isRenderableSentence(cleanSentence(s ?? ""));
}

interface BuiltFields {
  pattern: string;
  surgicalReason: string;
  trap: string;
  rule: string;
}

function buildConceptFields(concept: ConceptBlockInput, coreIdea: string): BuiltFields {
  const pool = [
    concept.anchorSentence,
    ...concept.supportSentences,
    ...concept.trapCandidates,
  ].map((s) => cleanSentence(s)).filter(renderable);

  const used: string[] = [coreIdea];

  // PATTERN — concept-recognition sentence (what the reader should notice)
  const patternCandidates = [concept.anchorSentence, ...concept.supportSentences];
  const pattern = normalizeLine(
    selectDistinctForRole(patternCandidates.map((s) => cleanSentence(s)), used, "pattern", renderable,
      concept.anchorSentence || "This concept introduces a central idea on the page."),
    "This concept introduces a central idea on the page."
  );
  used.push(pattern);

  // SURGICAL REASON — mechanism / justification (why it matters)
  const reasonCandidates = [...concept.supportSentences, concept.anchorSentence];
  const surgicalReason = normalizeLine(
    selectDistinctForRole(reasonCandidates.map((s) => cleanSentence(s)), used, "reason", renderable,
      "This concept matters because it explains how the page's main idea works."),
    "This concept matters because it explains how the page's main idea works."
  );
  used.push(surgicalReason);

  // TRAP — contrast / exception / confusion point (functionally different from above)
  const trapCandidates = [
    ...concept.trapCandidates,
    // also check support sentences for trap signals
    ...concept.supportSentences.filter((s) => TRAP_RE.test(s)),
    ...pool.filter((s) => TRAP_RE.test(s)),
  ];
  const trapFallback = `Do not confuse ${concept.title.toLowerCase()} with nearby supporting details on the page.`;
  const trap = normalizeLine(
    trapCandidates.length
      ? selectDistinctForRole(trapCandidates.map((s) => cleanSentence(s)), used, "trap", renderable, trapFallback)
      : trapFallback,
    trapFallback
  );
  used.push(trap);

  // RULE — operational takeaway (must differ from pattern, reason, trap)
  const ruleCandidates = [
    ...concept.supportSentences,
    concept.anchorSentence,
  ];
  const rule = normalizeLine(
    selectDistinctForRole(ruleCandidates.map((s) => cleanSentence(s)), used, "rule", renderable,
      "Use this as the key rule from the page."),
    "Use this as the key rule from the page."
  );

  return { pattern, surgicalReason, trap, rule };
}

function importanceLabel(level: ConceptBlockInput["importance"]): string {
  return { very_high: "VERY HIGH", high: "HIGH", medium: "MEDIUM", low: "LOW" }[level] ?? "MEDIUM";
}

function buildMiniTest(concepts: ConceptBlockInput[]): string[] {
  return concepts.slice(0, 4).map((c) =>
    c.trapCandidates[0]
      ? `What is the common mistake when working with ${c.title.toLowerCase()}?`
      : `What is the key idea behind ${c.title.toLowerCase()}?`
  );
}

function buildCompression(concepts: ConceptBlockInput[], coreIdea: string): string[] {
  // Collect rule-quality candidates from all concepts, deduped
  const allCandidates: string[] = [];
  for (const c of concepts) {
    allCandidates.push(
      cleanSentence(c.anchorSentence),
      ...c.supportSentences.map((s) => cleanSentence(s)),
    );
  }

  const rules: string[] = [];
  const usedRules: string[] = [coreIdea];

  for (const candidate of allCandidates) {
    if (rules.length >= 3) break;
    if (!renderable(candidate)) continue;
    if (isTooSimilar(candidate, usedRules)) continue;
    rules.push(candidate);
    usedRules.push(candidate);
  }

  // Pad to at least 3 with distinct anchor sentences from concepts
  for (let i = 0; i < concepts.length && rules.length < 3; i++) {
    const s = cleanSentence(concepts[i].anchorSentence);
    if (renderable(s) && !isTooSimilar(s, usedRules)) {
      rules.push(s);
      usedRules.push(s);
    }
  }

  return rules.slice(0, 3).map((r, i) => `Rule ${i + 1}: ${r}`);
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
  const page = adaptPageInsightModel(pageModel);
  const concepts = extractConceptBlocks(page);

  if (!concepts.length) return null;

  const coreIdea = normalizeLine(
    page.pageSummary ?? concepts[0]?.anchorSentence ?? "",
    "This page develops one core idea through a small set of connected concepts."
  );

  const blocks: UltraConceptBlock[] = concepts.map((c, i) => {
    const fields = buildConceptFields(c, coreIdea);
    return {
      ordinal: i + 1,
      title: c.title,
      ...fields,
      importance: importanceLabel(c.importance),
    };
  });

  return {
    title: `ULTRA – ${inferPageTitle(page, concepts)}`,
    subtitle: "STR + PDRM + Surgical Comprehension Engine",
    coreIdea,
    blocks,
    miniTest: buildMiniTest(concepts),
    compression: buildCompression(concepts, coreIdea),
  };
}
