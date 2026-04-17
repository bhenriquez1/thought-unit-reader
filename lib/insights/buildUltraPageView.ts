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
// Field builders — all return complete sentences
// ---------------------------------------------------------------------------

function normalizeLine(text: string, fallback: string): string {
  const cleaned = cleanSentence(text ?? "");
  return isRenderableSentence(cleaned) ? cleaned : fallback;
}

function buildPattern(concept: ConceptBlockInput): string {
  return normalizeLine(
    concept.anchorSentence,
    "This concept introduces a central idea on the page."
  );
}

function buildReason(concept: ConceptBlockInput): string {
  return normalizeLine(
    concept.supportSentences[0] ?? concept.anchorSentence,
    "This concept matters because it explains how the page's main idea works."
  );
}

function buildTrap(concept: ConceptBlockInput): string {
  if (concept.trapCandidates[0]) {
    return normalizeLine(
      concept.trapCandidates[0],
      `Do not confuse ${concept.title.toLowerCase()} with a similar idea on the page.`
    );
  }
  return `Do not confuse ${concept.title.toLowerCase()} with nearby supporting details on the page.`;
}

function buildRule(concept: ConceptBlockInput): string {
  const cleaned = cleanSentence(concept.anchorSentence ?? "");
  if (/ is | are | means | defined | consists /i.test(cleaned)) {
    return normalizeLine(cleaned, "Use this as the key rule from the page.");
  }
  const takeaway = concept.supportSentences.find((s) =>
    /therefore|thus|remember|key|important|rule/i.test(s)
  );
  return normalizeLine(takeaway ?? cleaned, "Use this as the key rule from the page.");
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

function buildCompression(concepts: ConceptBlockInput[]): string[] {
  return concepts.slice(0, 3).map((c, i) =>
    `Rule ${i + 1}: ${buildRule(c)}`
  );
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

  const blocks: UltraConceptBlock[] = concepts.map((c, i) => ({
    ordinal: i + 1,
    title: c.title,
    pattern: buildPattern(c),
    surgicalReason: buildReason(c),
    trap: buildTrap(c),
    rule: buildRule(c),
    importance: importanceLabel(c.importance),
  }));

  return {
    title: `ULTRA – ${inferPageTitle(page, concepts)}`,
    subtitle: "STR + PDRM + Surgical Comprehension Engine",
    coreIdea,
    blocks,
    miniTest: buildMiniTest(concepts),
    compression: buildCompression(concepts),
  };
}
