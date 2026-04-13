/**
 * buildNarrativeBlocks.ts
 *
 * Converts page intelligence into 3 structured narrative blocks:
 *   1. core        — What this page is about (dominant signal)
 *   2. logic       — How it works (mechanism + causal chain)
 *   3. application — Why it matters (rule + caveat)
 *
 * V3 story blocks are preferred (paragraph-native, source-diverse after Fix A).
 * Falls back to PageInsightModel fields when V3 is unavailable.
 */

import type { PageInsightModel, ParagraphInsight } from "./types";
import type { PageStoryV3 } from "./buildPageStoryV3";
import { cleanSentence } from "./sentenceCleanup";
import { isRenderableSentence } from "./isRenderableSentence";

export type NarrativeBlockType = "core" | "logic" | "application";

export type NarrativeBlock = {
  id: string;
  type: NarrativeBlockType;
  title: string;
  content: string;
  evidence: string[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clean(text?: string | null): string {
  if (!text) return "";
  return cleanSentence(String(text).replace(/\s+/g, " ").trim());
}

function valid(text?: string | null): boolean {
  const c = clean(text);
  return Boolean(c) && isRenderableSentence(c);
}

function first(...candidates: Array<string | null | undefined>): string {
  for (const c of candidates) {
    const v = clean(c);
    if (valid(v)) return v;
  }
  return "";
}

function dedupe(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = clean(raw);
    if (!valid(v)) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

// ---------------------------------------------------------------------------
// V3-based builders (preferred — paragraph-native, source-diverse)
// ---------------------------------------------------------------------------

function coreFromV3(v3: PageStoryV3): NarrativeBlock | null {
  const content = first(
    v3.brief.pageBottomLine,
    v3.signalBlock?.text,
    v3.bottomLineBlock?.text,
  );
  if (!content) return null;

  const evidence = dedupe([
    v3.signalBlock?.support[0],
    v3.signalBlock?.evidence[0]?.sentence,
  ]).filter((e) => e !== content).slice(0, 2);

  return { id: "narrative-core", type: "core", title: "What this page is about", content, evidence };
}

function logicFromV3(v3: PageStoryV3): NarrativeBlock | null {
  const content = first(
    v3.mechanismBlock?.text,
    v3.ruleBlock?.text,
  );
  if (!content) return null;

  const evidence = dedupe([
    v3.mechanismBlock?.support[0],
    v3.mechanismBlock?.evidence[0]?.sentence,
    v3.ruleBlock?.support[0],
  ]).filter((e) => e !== content).slice(0, 2);

  return { id: "narrative-logic", type: "logic", title: "How it works", content, evidence };
}

function applicationFromV3(v3: PageStoryV3): NarrativeBlock | null {
  const content = first(
    v3.actionBlock?.text,
    v3.ruleBlock?.text,
    v3.trapBlock?.text,
  );
  if (!content) return null;

  // Include trap as evidence if it's different from the main content
  const evidence = dedupe([
    v3.trapBlock?.text,
    v3.actionBlock?.support[0],
  ]).filter((e) => e !== content).slice(0, 2);

  return { id: "narrative-application", type: "application", title: "Why it matters", content, evidence };
}

// ---------------------------------------------------------------------------
// Model-based builders (fallback)
// ---------------------------------------------------------------------------

function sortedParagraphs(model: PageInsightModel): ParagraphInsight[] {
  return [...(model.paragraphInsights || [])].sort((a, b) => b.priorityScore - a.priorityScore);
}

function coreFromModel(model: PageInsightModel): NarrativeBlock | null {
  const sorted = sortedParagraphs(model);
  const content = first(
    model.pageSummary,
    sorted[0]?.summary,
    model.topTakeaways[0],
  );
  if (!content) return null;

  const evidence = dedupe([
    sorted[0]?.coreSignals[0],
    sorted[1]?.summary,
  ]).filter((e) => e !== content).slice(0, 2);

  return { id: "narrative-core", type: "core", title: "What this page is about", content, evidence };
}

function logicFromModel(model: PageInsightModel): NarrativeBlock | null {
  const path = model.decisionPaths[0];
  const sorted = sortedParagraphs(model);

  const content = first(
    path?.interpretation,
    path?.implication,
    sorted[1]?.summary,
  );
  if (!content) return null;

  const evidence = dedupe([
    path?.implication,
    sorted[1]?.coreSignals[0],
  ]).filter((e) => e !== content).slice(0, 2);

  return { id: "narrative-logic", type: "logic", title: "How it works", content, evidence };
}

function applicationFromModel(model: PageInsightModel): NarrativeBlock | null {
  const path = model.decisionPaths[0];

  const content = first(
    path?.nextMove,
    model.topTakeaways[1],
    path?.trap,
  );
  if (!content) return null;

  const evidence = dedupe([
    path?.trap,
    model.topTakeaways[2],
  ]).filter((e) => e !== content).slice(0, 2);

  return { id: "narrative-application", type: "application", title: "Why it matters", content, evidence };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Builds 3 narrative blocks from page intelligence.
 * When storyV3 is provided it is used as the primary source (paragraph-native).
 * Falls back to PageInsightModel fields.
 */
export function buildNarrativeBlocks(
  pageModel: PageInsightModel,
  storyV3?: PageStoryV3 | null,
): NarrativeBlock[] {
  const [coreFn, logicFn, appFn]: Array<() => NarrativeBlock | null> = storyV3
    ? [() => coreFromV3(storyV3), () => logicFromV3(storyV3), () => applicationFromV3(storyV3)]
    : [() => coreFromModel(pageModel), () => logicFromModel(pageModel), () => applicationFromModel(pageModel)];

  const result = [coreFn(), logicFn(), appFn()].filter(Boolean) as NarrativeBlock[];
  if (result.length > 0) return result;

  // Last-resort fallback: single block from pageSummary
  const fallback = clean(pageModel.pageSummary);
  if (valid(fallback)) {
    return [{ id: "narrative-fallback", type: "core", title: "What this page is about", content: fallback, evidence: [] }];
  }

  return [];
}
