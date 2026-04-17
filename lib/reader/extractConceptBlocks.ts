// lib/reader/extractConceptBlocks.ts
// Concept extraction engine: PageInsightModel → ReaderPageView.
// One shared model drives both LEFT (highlight tiers) and RIGHT (concept blocks).

import type { PageInsightModel, ParagraphInsight, LogicChain } from "@/lib/insights/types";
import type { ConceptBlock, ConceptImportance, HighlightTier, ReaderPageView } from "./types";

// ---------------------------------------------------------------------------
// Tier + importance from paragraph signals
// ---------------------------------------------------------------------------

function tierFor(p: ParagraphInsight): HighlightTier {
  const hasTrap = Boolean(p.traps?.length || p.logicChains.some((lc) => lc.trap));
  if (hasTrap) return "trap";
  if (p.priorityScore >= 2.0) return "important";
  if (p.priorityScore >= 1.0) return "support";
  return "additional";
}

function importanceFor(score: number): ConceptImportance {
  if (score >= 2.5) return "critical";
  if (score >= 1.8) return "high";
  if (score >= 1.0) return "medium";
  return "low";
}

// ---------------------------------------------------------------------------
// Field extractors
// ---------------------------------------------------------------------------

function extractTitle(p: ParagraphInsight): string {
  const source = p.coreSignals[0] ?? p.summary ?? p.cleanedText;
  return source
    .split(/\s+/)
    .slice(0, 7)
    .join(" ")
    .replace(/[.:,;!?]+$/, "");
}

function extractPattern(p: ParagraphInsight): string {
  return p.summary || p.coreSignals[0] || p.cleanedText.slice(0, 220);
}

function extractReason(p: ParagraphInsight): string {
  if (p.logicChains.length > 0) {
    const lc: LogicChain = p.logicChains[0];
    if (lc.because) return lc.because;
    if (lc.if && lc.then) return `${lc.if} → ${lc.then}`;
  }
  return p.coreSignals[1] ?? p.coreSignals[0] ?? p.summary ?? "";
}

function extractTrap(p: ParagraphInsight): string {
  if (p.traps?.[0]) return p.traps[0];
  for (const lc of p.logicChains) {
    if (lc.trap) return lc.trap;
  }
  return "";
}

function extractRule(p: ParagraphInsight): string {
  return p.takeaways[0] ?? p.coreSignals.at(-1) ?? p.summary ?? "";
}

// ---------------------------------------------------------------------------
// Mini test: one question per concept, rooted in actual content
// ---------------------------------------------------------------------------

function buildMiniTest(concepts: ConceptBlock[]): string[] {
  return concepts.slice(0, 3).map((c) => {
    if (c.trap) return `What is the common mistake with "${c.title.toLowerCase()}"?`;
    if (c.rule) return `State the key rule for: "${c.title.toLowerCase()}."`;
    return `Explain in one sentence: "${c.title.toLowerCase()}."`;
  });
}

// ---------------------------------------------------------------------------
// Compression: tightest synthesis of top rules
// ---------------------------------------------------------------------------

function buildCompression(coreIdea: string, concepts: ConceptBlock[]): string {
  const rules = concepts
    .filter((c) => c.rule)
    .slice(0, 2)
    .map((c) => c.rule.split(/[.!?]/)[0].trim())
    .filter(Boolean)
    .join(". ");
  return rules || coreIdea;
}

// ---------------------------------------------------------------------------
// Main extractor
// ---------------------------------------------------------------------------

export function extractConceptBlocks(pageModel: PageInsightModel): ReaderPageView {
  const { pageSummary, topTakeaways, paragraphInsights } = pageModel;

  const scored = (paragraphInsights ?? []).filter(
    (p) => p.paragraphType !== "noise" && p.priorityScore > 0 && (p.summary || p.cleanedText)
  );
  const hasSignal = Boolean(pageSummary || topTakeaways?.length || scored.length >= 2);

  if (!hasSignal) {
    return { coreIdea: "", concepts: [], miniTest: [], compression: "", isWeak: true };
  }

  const coreIdea = topTakeaways?.[0] || pageSummary || "";

  const selected = [...scored]
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 5);

  const concepts: ConceptBlock[] = selected.map((p, i) => ({
    id: `concept-${p.id || i}`,
    title: extractTitle(p),
    pattern: extractPattern(p),
    reason: extractReason(p),
    trap: extractTrap(p),
    rule: extractRule(p),
    importance: importanceFor(p.priorityScore),
    tier: tierFor(p),
    anchorText: (p.cleanedText || p.rawText || "").slice(0, 160).trim(),
  }));

  return {
    coreIdea,
    concepts,
    miniTest: buildMiniTest(concepts),
    compression: buildCompression(coreIdea, concepts),
    isWeak: false,
  };
}
