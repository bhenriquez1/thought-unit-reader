/**
 * assignParagraphSalience.ts
 *
 * Computes paragraph-level salience scores and reading priority assignments.
 * This is the V3 layer that makes the reader behave more like a human expert:
 * each paragraph gets ranked by how likely a strong reader would notice it first,
 * mark it as a rule, classify it as a trap, or defer it as optional detail.
 *
 * Role names use ParagraphRoleV2 values (primary_signal, decision_rule, etc.)
 * to remain compatible with the existing assignment pipeline.
 */

import type {
  NormalizedPageBlock,
  PageClass,
  PageReadingMode,
  ParagraphRoleAssignmentV3,
  ParagraphRoleV2,
  ParagraphSalienceV3,
  ReadingPriority,
  ReaderIntent,
} from "./types";
import { canonicalTextKey } from "./textCleanup";

// ---------------------------------------------------------------------------
// Signal term configs
// ---------------------------------------------------------------------------

type RoleSignalConfig = {
  terms: string[];
  weight: number;
};

const RULE_SIGNALS: RoleSignalConfig[] = [
  { terms: ["must", "should", "need to", "requires", "recommended", "indicated"], weight: 2.4 },
  { terms: ["first", "next", "then", "before", "after"],                           weight: 1.2 },
  { terms: ["diagnosis", "treatment", "management", "evaluation", "approach"],     weight: 1.5 },
];

const WARNING_SIGNALS: RoleSignalConfig[] = [
  { terms: ["avoid", "warning", "danger", "pitfall", "trap", "risk"],              weight: 2.8 },
  { terms: ["however", "but", "except", "unless", "although"],                     weight: 1.2 },
  { terms: ["misdiagnosis", "complication", "error", "wrong", "failure"],          weight: 2.0 },
];

const SUPPORT_SIGNALS: RoleSignalConfig[] = [
  { terms: ["because", "therefore", "thus", "so that", "which means"],            weight: 1.8 },
  { terms: ["for example", "for instance", "in general", "typically"],            weight: 1.1 },
  { terms: ["consists of", "includes", "defined as", "refers to"],               weight: 1.4 },
];

const MECHANISM_SIGNALS: RoleSignalConfig[] = [
  { terms: ["because", "due to", "results in", "leads to", "causes"],            weight: 2.2 },
  { terms: ["mechanism", "process", "pathway", "mediated", "through"],           weight: 1.8 },
  { terms: ["function", "relationship", "interaction", "sequence"],              weight: 1.2 },
];

const NOVELTY_PENALTY_TERMS = [
  "fig", "figure", "table", "box", "copyright", "chapter outline",
  "visit http", "www.", "isbn",
];

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

function countOccurrences(text: string, needle: string): number {
  if (!needle.trim()) return 0;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`\\b${escaped}\\b`, "gi");
  return [...text.matchAll(regex)].length;
}

function scoreSignals(text: string, configs: RoleSignalConfig[]): number {
  let score = 0;
  for (const config of configs) {
    for (const term of config.terms) {
      const hits = countOccurrences(text, term);
      if (hits > 0) score += hits * config.weight;
    }
  }
  return score;
}

function computeHeadingBoost(index: number, blocks: NormalizedPageBlock[]): number {
  const prev = blocks[index - 1];
  if (!prev) return 0;
  return prev.kind === "heading" ? 1.8 : 0;
}

function computeStructuralBoost(block: NormalizedPageBlock): number {
  switch (block.kind) {
    case "heading":      return 2.5;
    case "form_field":   return 1.6;
    case "table_row":    return 1.2;
    case "caption":      return -0.8;
    case "diagram_label": return -1.2;
    default:             return 0;
  }
}

function computeLengthBoost(text: string): number {
  const len = text.length;
  if (len >= 350) return 1.2;
  if (len >= 180) return 0.8;
  if (len >= 80)  return 0.4;
  return 0;
}

function computeNoveltyScore(text: string): number {
  const lower = text.toLowerCase();
  let penalty = 0;
  for (const term of NOVELTY_PENALTY_TERMS) {
    if (lower.includes(term)) penalty += 0.7;
  }
  const uppercaseRatio = text.length > 0
    ? (text.replace(/[^A-Z]/g, "").length / text.length)
    : 0;
  const capsPenalty = uppercaseRatio > 0.22 ? 0.8 : 0;
  const urlPenalty  = /https?:\/\/|www\./i.test(text) ? 1.5 : 0;
  return Math.max(0, 3 - penalty - capsPenalty - urlPenalty);
}

// ---------------------------------------------------------------------------
// Page-class bias — weights signal kinds by page reading mode
// ---------------------------------------------------------------------------

function pageClassBias(
  pageClass: PageClass,
  readingMode: PageReadingMode,
): { rule: number; warning: number; support: number; mechanism: number } {
  const key = `${pageClass}:${readingMode}`;
  switch (key) {
    case "clinical_prose:clinical_page":
      return { rule: 1.2, warning: 1.0, support: 0.8, mechanism: 1.0 };
    case "form_checklist:form_page":
      return { rule: 1.8, warning: 0.5, support: 0.4, mechanism: 0.3 };
    case "diagram_caption:diagram_page":
      return { rule: 0.6, warning: 0.3, support: 0.7, mechanism: 1.1 };
    case "table_structured:reference_page":
      return { rule: 1.0, warning: 0.4, support: 0.6, mechanism: 0.5 };
    case "narrative_text:narrative_page":
      return { rule: 0.8, warning: 0.9, support: 1.0, mechanism: 1.0 };
    default:
      return { rule: 1.0, warning: 0.8, support: 0.8, mechanism: 0.8 };
  }
}

// ---------------------------------------------------------------------------
// Role-specific scoring
// ---------------------------------------------------------------------------

function scoreRole(block: NormalizedPageBlock, role: ParagraphRoleV2): number {
  const text = block.text.toLowerCase();
  switch (role) {
    case "decision_rule":
      return scoreSignals(text, RULE_SIGNALS);
    case "mechanism":
      return scoreSignals(text, MECHANISM_SIGNALS);
    case "support_relation":
      return scoreSignals(text, [
        { terms: ["related", "associated", "connects", "interaction", "correlates"], weight: 1.8 },
        { terms: ["between", "across", "compared with", "in relation to"],            weight: 1.2 },
      ]);
    case "support_distinction":
      return scoreSignals(text, [
        { terms: ["unlike", "whereas", "in contrast", "different", "distinguish"],   weight: 2.0 },
        { terms: ["vs", "versus", "rather than"],                                     weight: 1.6 },
      ]);
    case "trap_warning":
      return scoreSignals(text, WARNING_SIGNALS);
    case "bottom_line":
      return scoreSignals(text, [
        { terms: ["therefore", "thus", "in summary", "overall", "in short"],         weight: 2.4 },
        { terms: ["main", "important", "key", "critical"],                           weight: 1.2 },
      ]);
    case "primary_signal":
      return scoreSignals(text, [
        { terms: ["defined as", "is the", "refers to", "main", "important", "key"], weight: 1.9 },
        { terms: ["diagnosis", "principle", "concept", "introduction", "scope"],    weight: 1.4 },
      ]);
    case "support_explanation":
    case "background":
    default:
      return scoreSignals(text, SUPPORT_SIGNALS);
  }
}

// ---------------------------------------------------------------------------
// Priority and intent inference
// ---------------------------------------------------------------------------

function inferReadingPriority(
  role: ParagraphRoleV2,
  salience: number,
  block: NormalizedPageBlock,
  blockOriginalIndex: number,
): ReadingPriority {
  if (role === "trap_warning")                           return "warning";
  if (role === "primary_signal"  && salience >= 5.0)    return "read_first";
  if (role === "bottom_line"     && salience >= 4.5)    return "read_first";
  if (role === "decision_rule"   && salience >= 4.2)    return "read_second";
  if (role === "mechanism"       && salience >= 4.0)    return "read_second";
  if (role === "support_explanation" && salience >= 3.2) return "read_later";
  if (role === "support_relation"    && salience >= 3.0) return "read_later";
  if (role === "support_distinction" && salience >= 3.0) return "read_later";
  if (block.kind === "caption" || block.kind === "diagram_label") return "optional";
  if (blockOriginalIndex < 2 && salience >= 3.0)         return "read_second";
  return "optional";
}

function inferReaderIntent(
  role: ParagraphRoleV2,
  priority: ReadingPriority,
): ReaderIntent {
  if (priority === "warning") return "notice_exception";
  switch (role) {
    case "primary_signal":
    case "bottom_line":
      return "learn_core";
    case "decision_rule":
      return "apply_rule";
    case "trap_warning":
      return "notice_exception";
    case "support_explanation":
    case "support_relation":
    case "support_distinction":
    case "mechanism":
      return priority === "optional" ? "skip_for_now" : "store_support";
    case "background":
      return priority === "optional" ? "skip_for_now" : "orient";
    default:
      return "orient";
  }
}

// ---------------------------------------------------------------------------
// Role selection — picks the best ParagraphRoleV2 for each block
// ---------------------------------------------------------------------------

/** Candidate roles per block kind, in preference order */
function candidateRolesForBlock(block: NormalizedPageBlock): ParagraphRoleV2[] {
  switch (block.kind) {
    case "heading":
      return ["primary_signal", "bottom_line", "support_explanation"];
    case "form_field":
      return ["decision_rule", "support_explanation", "bottom_line"];
    case "table_row":
      return ["support_explanation", "support_relation", "decision_rule"];
    case "caption":
    case "diagram_label":
      return ["support_explanation", "support_relation", "mechanism"];
    default:
      return [
        "primary_signal",
        "decision_rule",
        "mechanism",
        "support_relation",
        "support_distinction",
        "trap_warning",
        "bottom_line",
        "support_explanation",
        "background",
      ];
  }
}

function pickBestRole(
  block: NormalizedPageBlock,
  salience: ParagraphSalienceV3,
): { role: ParagraphRoleV2; roleScore: number } {
  const candidates = candidateRolesForBlock(block);
  let bestRole: ParagraphRoleV2 = "background";
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const role of candidates) {
    let score = scoreRole(block, role);

    // Salience boosts per role type
    if (role === "primary_signal")     score += salience.headingBoost * 0.8;
    if (role === "decision_rule")      score += salience.ruleDensity * 0.6;
    if (role === "trap_warning")       score += salience.warningDensity * 0.8;
    if (role === "support_explanation") score += salience.supportDensity * 0.5;
    if (role === "mechanism")          score += salience.supportDensity * 0.3;

    // Structural overrides
    if (block.kind === "heading"       && role === "primary_signal")  score += 2.0;
    if (block.kind === "form_field"    && role === "decision_rule")   score += 1.8;
    if ((block.kind === "caption" || block.kind === "diagram_label") && role === "primary_signal") {
      score -= 2.5;
    }

    if (score > bestScore) {
      bestScore = score;
      bestRole  = role;
    }
  }

  return { role: bestRole, roleScore: bestScore };
}

// ---------------------------------------------------------------------------
// Salience builder
// ---------------------------------------------------------------------------

function buildSalience(
  block: NormalizedPageBlock,
  index: number,
  blocks: NormalizedPageBlock[],
  pageClass: PageClass,
  readingMode: PageReadingMode,
): ParagraphSalienceV3 {
  const lower   = block.text.toLowerCase();
  const bias    = pageClassBias(pageClass, readingMode);

  const ruleDensity      = scoreSignals(lower, RULE_SIGNALS)      * bias.rule;
  const warningDensity   = scoreSignals(lower, WARNING_SIGNALS)   * bias.warning;
  const supportDensity   = scoreSignals(lower, SUPPORT_SIGNALS)   * bias.support;
  const mechanismDensity = scoreSignals(lower, MECHANISM_SIGNALS) * bias.mechanism;

  const heading    = computeHeadingBoost(index, blocks);
  const structural = computeStructuralBoost(block);
  const novelty    = computeNoveltyScore(block.text);
  const length     = computeLengthBoost(block.text);

  const salience =
    ruleDensity + warningDensity + supportDensity + mechanismDensity +
    heading + structural + length + novelty * 0.6;

  return {
    blockId:        block.id,
    salience,
    novelty,
    ruleDensity,
    warningDensity,
    supportDensity: supportDensity + mechanismDensity * 0.4,
    headingBoost:   heading,
    structuralBoost: structural,
  };
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

function dedupeByCanonicalText(
  assignments: ParagraphRoleAssignmentV3[],
  blocksById: Map<string, NormalizedPageBlock>,
): ParagraphRoleAssignmentV3[] {
  const seen = new Set<string>();
  const kept: ParagraphRoleAssignmentV3[] = [];
  for (const a of assignments) {
    const block = blocksById.get(a.blockId);
    if (!block) continue;
    const key = canonicalTextKey(block.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    kept.push(a);
  }
  return kept;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type AssignParagraphSalienceInput = {
  blocks:      NormalizedPageBlock[];
  pageClass:   PageClass;
  readingMode: PageReadingMode;
};

/**
 * Returns one ParagraphRoleAssignmentV3 per meaningful block, sorted by
 * descending salience. Duplicate text is collapsed.
 *
 * This is the V3 salience layer: each paragraph gets a reading priority
 * (read_first / read_second / read_later / optional / warning) and a reader
 * intent (learn_core / apply_rule / notice_exception / store_support / …).
 */
export function assignParagraphSalience(
  input: AssignParagraphSalienceInput,
): ParagraphRoleAssignmentV3[] {
  const { blocks, pageClass, readingMode } = input;

  const blocksById = new Map(blocks.map((b) => [b.id, b]));

  const raw = blocks
    .filter((b) => !b.isLikelyNoise && b.text.trim().length > 0)
    .map((block, idx) => {
      const salience        = buildSalience(block, idx, blocks, pageClass, readingMode);
      const { role, roleScore } = pickBestRole(block, salience);
      const readingPriority = inferReadingPriority(role, salience.salience, block, idx);
      const readerIntent    = inferReaderIntent(role, readingPriority);

      return {
        blockId:        block.id,
        pageNumber:     block.pageNumber,
        role,
        roleScore,
        readingPriority,
        readerIntent,
        salience,
      } satisfies ParagraphRoleAssignmentV3;
    })
    .sort((a, b) => {
      if (b.salience.salience !== a.salience.salience) {
        return b.salience.salience - a.salience.salience;
      }
      return a.blockId.localeCompare(b.blockId);
    });

  return dedupeByCanonicalText(raw, blocksById);
}
