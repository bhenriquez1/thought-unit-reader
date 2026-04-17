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
  TRAP_RE,
  REASON_RE,
  RULE_RE,
  dedupeSections,
  type SectionCandidate,
  type SectionKind,
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

  // REASON: prefer causal/explanatory signals (logicChain.because flows here via supportSentences)
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
  const candidates: SectionCandidate[] = [];
  let seq = 0;

  for (const c of concepts) {
    const anchor = cleanSentence(c.anchorSentence);
    if (anchor) {
      candidates.push({
        id: `comp-${c.id}-anchor-${seq++}`,
        text: anchor,
        kind: "compression",
        score: RULE_RE.test(anchor) ? 8 : 4,
      });
    }
    c.supportSentences.forEach((s) => {
      const t = cleanSentence(s);
      if (t) {
        candidates.push({
          id: `comp-${c.id}-sup-${seq++}`,
          text: t,
          kind: "compression",
          score: RULE_RE.test(t) ? 7 : 3,
        });
      }
    });
  }

  const result = dedupeSections(candidates, coreIdea);
  return result.compression.map((c, i) => `Rule ${i + 1}: ${c.text}`);
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
