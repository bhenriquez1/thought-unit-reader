/**
 * buildShadowRecall.ts
 *
 * Builds a current-page recall model: fixed prompts + page-grounded reveal answers.
 *
 * The reveal is derived exclusively from the current page's intelligence data —
 * NOT from UI state, prior pages, or generic templates.
 *
 * Usage pattern:
 *   const recall = buildShadowRecall(pageModel, storyV3);
 *   // show recall.prompts to the student
 *   // show recall.reveal after the student attempts recall
 */

import type { PageInsightModel } from "./types";
import type { PageStoryV3 } from "./buildPageStoryV3";
import { buildNarrativeBlocks } from "./buildNarrativeBlocks";
import { cleanSentence } from "./sentenceCleanup";
import { isRenderableSentence } from "./isRenderableSentence";

export type ShadowRecallPromptSet = {
  keyConcept: string;
  mechanism: string;
  distinction: string;
  testPoint: string;
  studentTrap: string;
};

export type ShadowRecallReveal = {
  keyConceptTruth: string;
  mechanismTruth: string;
  distinctionTruth: string;
  testPointTruth: string;
  studentTrapTruth: string;
  fastRecallCues: string[];
};

export type ShadowRecallModel = {
  pageLabel: string;
  prompts: ShadowRecallPromptSet;
  reveal: ShadowRecallReveal;
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

const CONTRAST_RE = /\b(whereas|unlike|differs?|in contrast|versus|vs\.|distinguish|compared to)\b/i;
const TRAP_RE     = /\b(avoid|trap|mistake|confuse|misread|error|wrong|pitfall|careful)\b/i;

// ---------------------------------------------------------------------------
// Field extraction
// ---------------------------------------------------------------------------

function distinctionFrom(model: PageInsightModel, storyV3?: PageStoryV3 | null): string {
  // Look for a contrast-bearing sentence in decisionPaths or topTakeaways
  const path = model.decisionPaths[0];
  const contrastTakeaway = model.topTakeaways.find((t) => CONTRAST_RE.test(t ?? ""));
  const contrastCondition = path?.condition && CONTRAST_RE.test(path.condition) ? path.condition : null;

  return first(
    contrastCondition,
    contrastTakeaway,
    storyV3?.trapBlock?.text,        // trap often describes a contrast
    path?.condition,
    model.topTakeaways[0],
  );
}

function testPointFrom(model: PageInsightModel, storyV3?: PageStoryV3 | null): string {
  const path = model.decisionPaths[0];
  return first(
    storyV3?.actionBlock?.text,
    storyV3?.ruleBlock?.text,
    path?.nextMove,
    path?.implication,
    model.topTakeaways[1],
  );
}

function trapFrom(model: PageInsightModel, storyV3?: PageStoryV3 | null): string {
  const path = model.decisionPaths.find((p) => p.trap && valid(p.trap));
  const trapTakeaway = model.topTakeaways.find((t) => TRAP_RE.test(t ?? ""));

  return first(
    storyV3?.trapBlock?.text,
    path?.trap,
    trapTakeaway,
    model.topTakeaways[2],
  );
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

/**
 * Builds a shadow recall model for the current page.
 * All reveal answers are derived from the current page's intelligence — never from
 * prior pages, UI state, or generic templates.
 */
export function buildShadowRecall(
  pageModel: PageInsightModel,
  storyV3?: PageStoryV3 | null,
): ShadowRecallModel {
  const narrative = buildNarrativeBlocks(pageModel, storyV3);
  const path = pageModel.decisionPaths[0];

  const keyConceptTruth = first(
    storyV3?.brief.pageBottomLine,
    storyV3?.signalBlock?.text,
    narrative[0]?.content,
    pageModel.pageSummary,
  ) || "No key concept was extracted for this page.";

  const mechanismTruth = first(
    storyV3?.mechanismBlock?.text,
    narrative[1]?.content,
    path?.interpretation,
    path?.implication,
  ) || keyConceptTruth;

  const distinctionTruth = distinctionFrom(pageModel, storyV3)
    || "No distinct contrast was identified on this page.";

  const testPointTruth = testPointFrom(pageModel, storyV3)
    || "Apply the core concept from this page to a scenario.";

  const studentTrapTruth = trapFrom(pageModel, storyV3)
    || "Watch for the most common misreading of this page's main claim.";

  const fastRecallCues = dedupe([
    storyV3?.signalBlock?.text,
    storyV3?.ruleBlock?.text,
    path?.condition,
    path?.nextMove,
    path?.trap,
    pageModel.topTakeaways[0],
    pageModel.topTakeaways[1],
  ]).slice(0, 5);

  const pageNumber = pageModel.pageNumber;
  const pageLabel = pageNumber != null ? `Page ${pageNumber}` : "Current page";

  return {
    pageLabel,
    prompts: {
      keyConcept:  "What is the key concept on this page?",
      mechanism:   "How does this page explain the mechanism or logic?",
      distinction: "What distinction or contrast matters here?",
      testPoint:   "What should you be able to apply or test?",
      studentTrap: "What mistake would catch a student who only skimmed this page?",
    },
    reveal: {
      keyConceptTruth,
      mechanismTruth,
      distinctionTruth,
      testPointTruth,
      studentTrapTruth,
      fastRecallCues,
    },
  };
}
