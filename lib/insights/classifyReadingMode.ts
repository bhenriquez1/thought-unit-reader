/**
 * classifyReadingMode.ts
 *
 * Determines the cognitive reading mode for a page — distinct from structural
 * PageClass. PageClass describes what the page looks like structurally; reading
 * mode describes how a strong reader should mentally approach it.
 *
 * A clinical prose page and a concept narrative page may both be "narrative_text"
 * structurally, but one calls for rule-scanning and the other for idea-mapping.
 */

import type {
  NormalizedPageBlock,
  PageClass,
  PageReadingMode,
  ParagraphRoleAssignment,
} from "./types";

// Keyword sets that indicate domain intent (not page structure)

const CLINICAL_TERMS = [
  "diagnosis", "treatment", "clinical", "patient", "symptom", "history",
  "examination", "procedure", "pathology", "etiology", "prognosis", "therapy",
  "lesion", "finding", "differential", "workup", "management", "surgical",
  "operation", "incision", "flap", "repair", "reconstruction", "closure",
  "complication", "postoperative", "intraoperative",
];

const DEFINITION_TERMS = [
  "defined as", "refers to", "is the", "is a type", "is characterized by",
  "can be classified", "describes", "consists of", "encompasses", "represents",
  "concept of", "principle of", "theory of",
];

const CONTRAST_TERMS = [
  "unlike", "whereas", "in contrast", "compared with", "rather than",
  "different from", "distinguish", "versus", "vs.", "differentiated",
  "on the other hand", "alternatively",
];

const RULE_TERMS = [
  "must", "should", "always", "never", "require", "is indicated", "is necessary",
  "do not", "first step", "next step", "initial management", "standard of care",
];

const NARRATIVE_TERMS = [
  "case", "example", "patient presented", "scenario", "story", "note that",
  "consider the following", "illustrates", "demonstrates", "in this case",
  "when a patient", "a patient who",
];

function containsAny(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  return terms.filter((t) => lower.includes(t)).length;
}

function pageTextJoined(blocks: NormalizedPageBlock[]): string {
  return blocks.map((b) => b.text).join(" ").toLowerCase();
}

function trapRoleCount(roles: ParagraphRoleAssignment[]): number {
  return roles.filter((r) => r.role === "trap_warning").length;
}

function decisionRuleCount(roles: ParagraphRoleAssignment[]): number {
  return roles.filter((r) => r.role === "decision_rule").length;
}

function primarySignalCount(roles: ParagraphRoleAssignment[]): number {
  return roles.filter((r) => r.role === "primary_signal").length;
}

export function classifyReadingMode(
  blocks: NormalizedPageBlock[],
  pageClass: PageClass,
  paragraphRoles: ParagraphRoleAssignment[],
): PageReadingMode {
  // Structural overrides — these page classes map directly to a reading mode
  switch (pageClass) {
    case "form_checklist":   return "form_page";
    case "diagram_caption":  return "diagram_page";
    case "table_structured": return "reference_page";
    case "frontmatter":
    case "image_only":
    case "sparse_text":      return "reference_page";
  }

  const joined = pageTextJoined(blocks);

  const clinicalScore  = containsAny(joined, CLINICAL_TERMS);
  const definitionScore = containsAny(joined, DEFINITION_TERMS);
  const contrastScore  = containsAny(joined, CONTRAST_TERMS);
  const ruleScore      = containsAny(joined, RULE_TERMS);
  const narrativeScore = containsAny(joined, NARRATIVE_TERMS);

  // Role-based boosts
  const rulePressure = decisionRuleCount(paragraphRoles) * 2 + trapRoleCount(paragraphRoles);
  const conceptPressure = primarySignalCount(paragraphRoles);

  // Clinical prose with rule/trap pressure → clinical_page
  if (pageClass === "clinical_prose") {
    if (ruleScore + rulePressure >= 4) return "clinical_page";
    if (narrativeScore >= 2)          return "narrative_page";
    return "clinical_page";
  }

  // For narrative_text, pick cognitive mode by signal dominance
  const scores: Record<PageReadingMode, number> = {
    clinical_page:  clinicalScore * 1.4 + rulePressure * 1.2,
    concept_page:   definitionScore * 1.6 + conceptPressure * 1.0 + contrastScore * 0.8,
    narrative_page: narrativeScore * 1.8,
    reference_page: 0,
    form_page:      0,
    diagram_page:   0,
  };

  const best = (Object.entries(scores) as [PageReadingMode, number][])
    .sort((a, b) => b[1] - a[1])[0];

  if (best[1] >= 2) return best[0];

  // Default: concept page for well-structured prose, narrative for everything else
  return definitionScore >= 1 ? "concept_page" : "narrative_page";
}
