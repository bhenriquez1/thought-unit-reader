// lib/recalllab/semanticQuestionFamilies.ts
// Semantic-type-aware question family engine for Recall card generation.
//
// Each canonical type maps to an ordered set of applicable question families.
// Only families that fit the semantic content type are applied — preventing
// "What is the mechanism of An Element?" for a pure-definition unit, or
// "What occurs immediately after element?" for a non-sequential concept.

export type QuestionFamily =
  | "identity"          // What is X?
  | "distinction"       // What distinguishes X from related concepts?
  | "classification"    // How is X classified?
  | "example"           // Give an example of X
  | "misconception"     // What is the common misconception about X?
  | "trigger"           // What triggers / initiates X?
  | "sequence"          // Describe the sequence of X
  | "causal-interrupt"  // What happens if X is interrupted?
  | "outcome"           // What is the outcome when X occurs?
  | "order"             // What is the correct order of steps in X?
  | "decision"          // What is the decision point when X?
  | "indication"        // When is X indicated?
  | "error"             // What is a common error when applying X?
  | "complication"      // What complication can arise from X?
  | "similarity"        // How is X similar to related concepts?
  | "difference"        // How does X differ from similar concepts?
  | "selection"         // When do you choose X over the alternative?
  | "formula"           // State the formula or rule for X
  | "application"       // Apply X to a new scenario
  | "evidence";         // What evidence supports X?

// ── Templates ──────────────────────────────────────────────────────────────

const FAMILY_TEMPLATES: Record<QuestionFamily, (label: string) => string> = {
  "identity":         l => `What is ${l}?`,
  "distinction":      l => `What distinguishes ${l} from related concepts?`,
  "classification":   l => `How is ${l} classified?`,
  "example":          l => `Give an example of ${l}.`,
  "misconception":    l => `What is the most common misconception about ${l}?`,
  "trigger":          l => `What triggers or initiates ${l}?`,
  "sequence":         l => `Describe the sequence of steps in ${l}.`,
  "causal-interrupt": l => `What happens when ${l} is interrupted or absent?`,
  "outcome":          l => `What is the outcome when ${l} occurs?`,
  "order":            l => `What is the correct order of steps in ${l}?`,
  "decision":         l => `What is the decision point for applying ${l}?`,
  "indication":       l => `When is ${l} indicated?`,
  "error":            l => `What is a common error when applying or understanding ${l}?`,
  "complication":     l => `What complication can ${l} cause?`,
  "similarity":       l => `How is ${l} similar to related concepts?`,
  "difference":       l => `How does ${l} differ from similar concepts?`,
  "selection":        l => `When would you choose ${l} over the alternative?`,
  "formula":          l => `State the formula or rule for ${l}.`,
  "application":      l => `Apply ${l} to a new scenario.`,
  "evidence":         l => `What evidence supports ${l}?`,
};

// ── Family assignment per canonical type ──────────────────────────────────
// Rules:
//   - Definitions → identity, distinction, classification, example, misconception
//   - Mechanisms/processes → trigger, sequence, causal-interrupt, outcome (never for definitions)
//   - Procedures → order, decision, indication, error, complication (temporal)
//   - Comparisons → similarity, difference, distinction, selection
//   - Clinical → indication, decision, error, complication (not for pure concepts)
//   - unknown/core-concept → conservative: identity + distinction only

export const QUESTION_FAMILIES_BY_TYPE: Partial<Record<string, QuestionFamily[]>> = {
  "definition":        ["identity", "distinction", "classification", "example", "misconception"],
  "core-concept":      ["identity", "distinction", "example", "misconception"],
  "mechanism":         ["trigger", "sequence", "causal-interrupt", "outcome", "misconception"],
  "process":           ["trigger", "sequence", "order", "outcome"],
  "cause":             ["identity", "outcome", "sequence"],
  "effect":            ["identity", "outcome", "misconception"],
  "comparison":        ["similarity", "difference", "distinction", "selection"],
  "relationship":      ["similarity", "difference", "identity"],
  "procedure":         ["order", "decision", "indication", "error", "complication"],
  "formula":           ["formula", "application", "identity"],
  "worked-example":    ["application", "order", "sequence"],
  "classification":    ["classification", "identity", "distinction", "example"],
  "indication":        ["indication", "decision", "selection"],
  "contraindication":  ["indication", "decision", "error"],
  "treatment":         ["indication", "decision", "complication", "error"],
  "complication":      ["identity", "outcome", "complication", "error"],
  "clinical-pearl":    ["identity", "application", "misconception"],
  "decision-point":    ["decision", "indication", "selection", "error"],
  "warning":           ["identity", "misconception", "error"],
  "high-yield":        ["identity", "distinction", "misconception"],
  "memory-anchor":     ["identity", "misconception"],
  "evidence":          ["evidence", "identity", "distinction"],
  "common-error":      ["error", "misconception", "identity"],
  "exception":         ["identity", "distinction", "misconception"],
};

const DEFAULT_FAMILIES: QuestionFamily[] = ["identity", "distinction"];

// ── Public API ────────────────────────────────────────────────────────────

export interface SemanticCard {
  family:  QuestionFamily;
  front:   string;
  back:    string;
}

/**
 * Build question cards from a canonical entry using semantic-type-aware families.
 * Only families that match the canonical type are generated — never mechanism
 * questions for a definition, never temporal questions for a concept without order.
 */
export function buildSemanticCards(
  entry:  { text: string; title?: string; canonicalType?: string },
  opts:   { maxCards?: number } = {},
): SemanticCard[] {
  const max     = opts.maxCards ?? 5;
  const ct      = entry.canonicalType ?? "core-concept";
  const families = (QUESTION_FAMILIES_BY_TYPE[ct] ?? DEFAULT_FAMILIES).slice(0, max);
  const label   = (entry.title ?? entry.text.slice(0, 50).trim()).replace(/\.$/, "");
  const back    = entry.text.length > 300
    ? entry.text.slice(0, 300).trim() + "…"
    : entry.text;

  return families.map(family => ({
    family,
    front: FAMILY_TEMPLATES[family](label),
    back,
  }));
}

/**
 * Returns true if the canonical type supports temporal / sequential reasoning.
 * Used to guard against "what happens next?" questions for non-sequential types.
 */
export function supportsSequentialReasoning(canonicalType: string | undefined): boolean {
  return ["mechanism", "process", "procedure", "cause", "effect", "worked-example"].includes(
    canonicalType ?? "",
  );
}

/**
 * Returns true if the canonical type supports clinical application questions.
 * Guards against clinical/indication questions for pure concept/definition types.
 */
export function supportsClinicalReasoning(canonicalType: string | undefined): boolean {
  return [
    "indication", "contraindication", "treatment", "complication",
    "clinical-pearl", "decision-point",
  ].includes(canonicalType ?? "");
}
