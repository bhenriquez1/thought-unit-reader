import type {
  NormalizedPageBlock,
  PageClass,
  ParagraphRoleV2,
  ParagraphRoleAssignment,
} from "./types";

// ---------------------------------------------------------------------------
// Keyword lists
// ---------------------------------------------------------------------------

const DECISION_TERMS = [
  "must", "should", "always", "never", "recommend", "record", "document",
  "assess", "evaluate", "determine", "rule out", "confirm", "indicates",
  "use", "collect", "ask", "check", "required", "is indicated", "is necessary",
];

const MECHANISM_TERMS = [
  "because", "therefore", "due to", "results in", "leads to", "causes",
  "so that", "through", "by which", "mechanism", "process", "sequence",
  "pathway", "explains", "underlies", "produces", "secondary to",
];

const RELATION_TERMS = [
  "associated with", "correlates with", "related to", "linked to",
  "connected to", "depends on", "in relation to", "between", "interaction",
];

const DISTINCTION_TERMS = [
  "unlike", "whereas", "in contrast", "compared with", "rather than",
  "different from", "distinguish", "versus", "vs.", "differentiated",
];

const TRAP_TERMS = [
  "avoid", "mistake", "error", "risk", "warning", "pitfall",
  "do not", "don't", "misleading", "incorrect", "wrong",
  "except", "unless", "common error", "common mistake", "not to be confused",
];

const BOTTOM_LINE_TERMS = [
  "in summary", "overall", "therefore", "thus", "bottom line",
  "the key point", "the main point", "in conclusion", "to summarize",
  "the takeaway", "in short",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type RoleScoreMap = Record<ParagraphRoleV2, number>;

const EMPTY_SCORES = (): RoleScoreMap => ({
  primary_signal:      0,
  decision_rule:       0,
  mechanism:           0,
  support_explanation: 0,
  support_relation:    0,
  support_distinction: 0,
  trap_warning:        0,
  bottom_line:         0,
  background:          0,
});

function lower(text: string): string {
  return text.toLowerCase();
}

function countMatches(text: string, terms: string[]): number {
  const hay = lower(text);
  let count = 0;
  for (const term of terms) {
    if (hay.includes(term)) count++;
  }
  return count;
}

function add(scores: RoleScoreMap, role: ParagraphRoleV2, value: number) {
  scores[role] = Math.max(0, scores[role] + value);
}

function topRole(scores: RoleScoreMap): { role: ParagraphRoleV2; score: number } {
  let bestRole: ParagraphRoleV2 = "background";
  let bestScore = scores.background;
  (Object.keys(scores) as ParagraphRoleV2[]).forEach((role) => {
    if (scores[role] > bestScore) {
      bestRole = role;
      bestScore = scores[role];
    }
  });
  return { role: bestRole, score: bestScore };
}

/** Adjust role for page-class context so e.g. form pages don't end up with mechanism blocks. */
function adjustForPageClass(role: ParagraphRoleV2, pageClass: PageClass): ParagraphRoleV2 {
  if (pageClass === "form_checklist") {
    if (role === "mechanism")           return "support_explanation";
    if (role === "support_relation")    return "support_explanation";
    if (role === "support_distinction") return "support_explanation";
  }
  if (pageClass === "diagram_caption") {
    if (role === "decision_rule") return "support_explanation";
  }
  return role;
}

// ---------------------------------------------------------------------------
// Single-block scorer
// ---------------------------------------------------------------------------

export function scoreParagraphRole(
  block: NormalizedPageBlock,
  pageClass: PageClass,
): ParagraphRoleAssignment {
  const scores = EMPTY_SCORES();
  const reasons: string[] = [];
  const text = block.text.trim();

  // Conservative background baseline
  add(scores, "background", 1);

  if (block.isLikelyNoise) {
    add(scores, "background", 8);
    reasons.push("likely_noise");
  }

  if (!block.isComplete) {
    add(scores, "background", 4);
    reasons.push("incomplete_block");
  }

  // --- Structural kind cues ---
  if (block.kind === "heading") {
    add(scores, "primary_signal", 7);
    add(scores, "bottom_line", 2);
    reasons.push("heading");
  }

  if (block.kind === "form_field") {
    add(scores, "decision_rule", 8);
    add(scores, "support_explanation", 3);
    reasons.push("form_field");
  }

  if (block.kind === "table_row") {
    add(scores, "support_explanation", 4);
    add(scores, "decision_rule", 3);
    reasons.push("table_row");
  }

  if (block.kind === "caption" || block.kind === "diagram_label") {
    add(scores, "support_explanation", 5);
    add(scores, "support_relation", 2);
    reasons.push("caption");
  }

  if (block.kind === "list_item") {
    add(scores, "decision_rule", 3);
    add(scores, "support_explanation", 2);
    reasons.push("list_item");
  }

  // --- Lexical cues ---
  const decisionHits    = countMatches(text, DECISION_TERMS);
  const mechanismHits   = countMatches(text, MECHANISM_TERMS);
  const relationHits    = countMatches(text, RELATION_TERMS);
  const distinctionHits = countMatches(text, DISTINCTION_TERMS);
  const trapHits        = countMatches(text, TRAP_TERMS);
  const bottomLineHits  = countMatches(text, BOTTOM_LINE_TERMS);

  if (decisionHits)    { add(scores, "decision_rule",       decisionHits * 3);    reasons.push(`decision:${decisionHits}`); }
  if (mechanismHits)   { add(scores, "mechanism",           mechanismHits * 3);   reasons.push(`mechanism:${mechanismHits}`); }
  if (relationHits)    { add(scores, "support_relation",    relationHits * 3);    reasons.push(`relation:${relationHits}`); }
  if (distinctionHits) { add(scores, "support_distinction", distinctionHits * 3); reasons.push(`distinction:${distinctionHits}`); }
  if (trapHits)        { add(scores, "trap_warning",        trapHits * 4);        reasons.push(`trap:${trapHits}`); }
  if (bottomLineHits)  { add(scores, "bottom_line",         bottomLineHits * 4);  reasons.push(`bottom_line:${bottomLineHits}`); }

  // --- Positional cues ---
  if (block.blockIndex <= 1) {
    add(scores, "primary_signal", 3);
    reasons.push("early_block");
  }

  // --- Length / density cues ---
  const len = text.length;
  const sentCount = block.sentences?.length ?? 0;

  if (len >= 80 && len <= 450 && sentCount >= 1 && sentCount <= 4) {
    add(scores, "support_explanation", 2);
    reasons.push("good_length");
  }
  if (len > 180 && sentCount >= 2) {
    add(scores, "mechanism", 2);
    reasons.push("multi_sentence");
  }
  if (len < 40 && block.kind === "paragraph") {
    add(scores, "background", 3);
    reasons.push("very_short");
  }

  // --- Page-class biases ---
  switch (pageClass) {
    case "clinical_prose":
      add(scores, "primary_signal", 1);
      add(scores, "decision_rule",  1);
      add(scores, "mechanism",      1);
      if (trapHits) add(scores, "trap_warning", 2);
      reasons.push("clinical_bias");
      break;
    case "narrative_text":
      add(scores, "primary_signal",      1);
      add(scores, "mechanism",           2);
      add(scores, "support_explanation", 1);
      reasons.push("narrative_bias");
      break;
    case "form_checklist":
      add(scores, "decision_rule",       4);
      add(scores, "support_explanation", 2);
      add(scores, "mechanism",          -2);
      reasons.push("form_bias");
      break;
    case "table_structured":
      add(scores, "support_explanation", 3);
      add(scores, "support_relation",    2);
      add(scores, "decision_rule",       1);
      reasons.push("table_bias");
      break;
    case "diagram_caption":
      add(scores, "support_explanation", 4);
      add(scores, "support_relation",    2);
      add(scores, "primary_signal",      1);
      reasons.push("diagram_bias");
      break;
    case "mixed_layout":
      add(scores, "support_explanation", 1);
      add(scores, "primary_signal",      1);
      reasons.push("mixed_bias");
      break;
    case "frontmatter":
      add(scores, "background", 6);
      reasons.push("frontmatter_bias");
      break;
    case "image_only":
      add(scores, "background", 10);
      reasons.push("image_bias");
      break;
    case "sparse_text":
      add(scores, "primary_signal", 1);
      add(scores, "bottom_line",    1);
      reasons.push("sparse_bias");
      break;
  }

  // Promote early explanatory blocks to primary_signal
  if (
    (scores.support_explanation >= 3 || scores.mechanism >= 3) &&
    block.blockIndex <= 2
  ) {
    add(scores, "primary_signal", 3);
    reasons.push("promoted_to_signal");
  }

  const { role: rawRole, score } = topRole(scores);
  const role = adjustForPageClass(rawRole, pageClass);

  return { blockId: block.id, role, score, reasons };
}

// ---------------------------------------------------------------------------
// Batch assignment
// ---------------------------------------------------------------------------

export function assignParagraphRoles(
  blocks: NormalizedPageBlock[],
  pageClass: PageClass,
): ParagraphRoleAssignment[] {
  return blocks.map((block) => scoreParagraphRole(block, pageClass));
}
