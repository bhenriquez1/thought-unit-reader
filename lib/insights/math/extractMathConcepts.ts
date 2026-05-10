// lib/insights/math/extractMathConcepts.ts
// Math-specific concept enhancement layer.
//
// Standard prose extraction produces broken titles like "Solution When" and
// verbatim sentences that don't explain math logic. This module:
//   1. Normalizes math concept titles from anchor text
//   2. Extracts Condition / Transformation / Result fields from anchor sentences
//   3. Detects numbered procedure steps from paragraph text
//   4. Produces a math-specific coreIdea from the page's highest-priority definition/theorem

import type { ParagraphInsight } from "@/lib/insights/types";
import type { ConceptBlockInput } from "@/lib/insights/extractConceptBlocks";

// ---------------------------------------------------------------------------
// Math block classification
// ---------------------------------------------------------------------------

export type MathBlockType =
  | "definition"
  | "theorem"
  | "formula"
  | "example"
  | "procedure"
  | "graph_behavior"
  | "trap"
  | "result"
  | "symbolic_relation";

const MATH_DEFINITION_RE   = /\b(is defined as|is called|refers? to|we define|a sequence is|a function is|a limit is|convergence is|divergence means)\b/i;
const MATH_THEOREM_RE      = /\b(theorem|corollary|lemma|if\b.{5,60}\bthen\b|implies|it follows that)\b/i;
const MATH_FORMULA_RE      = /(?:[=→∞√∫∂∑±≤≥≠]|lim\b|\bln\b|\bsin\b|\bcos\b|\btan\b|d[xyz]\/d[xyz]|\^[0-9n])/;
const MATH_EXAMPLE_RE      = /^(?:example|ex\.|solution|problem|for instance|consider the sequence|let [a-z]_?n\s*=)/i;
const MATH_PROCEDURE_RE    = /(?:^step\s+\d|^\d+[.)]\s+(?:identify|compute|find|check|test|determine|apply|simplify|evaluate)|first[,\s]|then[,\s]|finally[,\s])/im;
const MATH_BEHAVIOR_RE     = /\b(approaches?|tends? to|as [a-z]\s*→|oscillates?|grows? without bound|decreases? toward|increases? toward)\b/i;
const MATH_TRAP_RE         = /\b(common mistake|be careful|do not confuse|note:|beware|trap|oscillat(?:es?|ing)\s+(?:does? not|is not))\b/i;

export function classifyMathBlockType(text: string): MathBlockType {
  if (MATH_TRAP_RE.test(text))       return "trap";
  if (MATH_EXAMPLE_RE.test(text))    return "example";
  if (MATH_THEOREM_RE.test(text))    return "theorem";
  if (MATH_DEFINITION_RE.test(text)) return "definition";
  if (MATH_FORMULA_RE.test(text))    return "formula";
  if (MATH_PROCEDURE_RE.test(text))  return "procedure";
  if (MATH_BEHAVIOR_RE.test(text))   return "graph_behavior";
  return "result";
}

// ---------------------------------------------------------------------------
// Title normalization
// ---------------------------------------------------------------------------

// Fragments that signal a broken title — skip these and use concept map fallback
const BROKEN_TITLE_RE = /^(solution|example|exercise|problem|step|when |if |the |a |an |exists[,\s]|let |note |see |figure |theorem \d)/i;

// Map anchor text keywords to clean math concept titles
const CONCEPT_MAP: Array<{ test: RegExp; title: string }> = [
  { test: /\bconverg/i,                         title: "Sequence Convergence"    },
  { test: /\bdiverg/i,                          title: "Divergence"              },
  { test: /\blimit\s+law/i,                     title: "Limit Laws"              },
  { test: /\blim(?:it)?\b.*\bsequence/i,        title: "Limit of a Sequence"     },
  { test: /\blimit\b.*\bfunction/i,             title: "Limit of a Function"     },
  { test: /\bmonoton/i,                         title: "Monotone Sequences"      },
  { test: /\bbounded\b.*\bsequence/i,           title: "Bounded Sequences"       },
  { test: /\bsqueeze\s+theorem/i,               title: "Squeeze Theorem"         },
  { test: /\bderivative\b.*\bdefin/i,           title: "Derivative Definition"   },
  { test: /\bchain\s+rule/i,                    title: "Chain Rule"              },
  { test: /\bproduct\s+rule/i,                  title: "Product Rule"            },
  { test: /\bquotient\s+rule/i,                 title: "Quotient Rule"           },
  { test: /\bcontinui/i,                        title: "Continuity"              },
  { test: /\bdifferentiab/i,                    title: "Differentiability"       },
  { test: /\bintegral\b.*\bdefin/i,             title: "Integral Definition"     },
  { test: /\bfundamental\s+theorem/i,           title: "Fundamental Theorem"     },
  { test: /\bgeometric\s+series/i,              title: "Geometric Series"        },
  { test: /\barithmetic\s+sequence/i,           title: "Arithmetic Sequence"     },
  { test: /\boscillat/i,                        title: "Oscillating Sequences"   },
  { test: /\binfinit[ey]/i,                     title: "Behavior at Infinity"    },
  { test: /\blim\b.*[→∞]/,                      title: "Limit at Infinity"       },
  { test: /\bderivat/i,                         title: "Derivative"              },
  { test: /\bintegral/i,                        title: "Integration"             },
  { test: /\bsequence\b/i,                      title: "Sequence Behavior"       },
  { test: /\bfunction\b/i,                      title: "Function Analysis"       },
];

export function normalizeMathTitle(rawTitle: string, anchorText: string): string {
  // If the raw title is a known fragment, try to derive from anchor
  if (BROKEN_TITLE_RE.test(rawTitle.trim())) {
    const anchor = anchorText.toLowerCase();
    for (const { test, title } of CONCEPT_MAP) {
      if (test.test(anchor)) return title;
    }
    // Last resort: extract first 2-3 meaningful words from anchor
    const words = anchorText.trim().split(/\s+/).filter(w => w.length >= 4);
    if (words.length >= 2) return words.slice(0, 2).join(" ");
    return "Math Concept";
  }

  // Title looks OK — check if it can be improved via concept map
  for (const { test, title } of CONCEPT_MAP) {
    if (test.test(rawTitle) || test.test(anchorText)) return title;
  }

  return rawTitle;
}

// ---------------------------------------------------------------------------
// Field extraction from anchor sentence
// ---------------------------------------------------------------------------

export interface MathFields {
  condition: string;     // "when n → ∞" / "if aₙ is monotone and bounded"
  result: string;        // "the sequence converges to L"
  trapText: string;      // "alternating sequences do not converge"
  blockType: MathBlockType;
}

const IF_THEN_RE = /\bif\b(.{5,80}?)[,;]\s*then\b(.{5,100}?)(?:[.;,]|$)/i;
const WHEN_RE    = /\bwhen\b(.{5,60}?)(?:[,;]|→)(.{5,80}?)(?:[.;]|$)/i;
const ARROW_RE   = /(.{3,60}?)\s*→\s*(.{3,60}?)(?:[.;,]|$)/;

function trim10(s: string): string {
  const w = s.trim().split(/\s+/);
  return (w.length > 12 ? w.slice(0, 12).join(" ") : s.trim())
    .replace(/[.,;]$/, "").trim();
}

export function extractMathFields(anchorText: string): Pick<MathFields, "condition" | "result"> {
  // if...then pattern
  const ifThen = anchorText.match(IF_THEN_RE);
  if (ifThen) {
    return {
      condition: trim10(ifThen[1]),
      result:    trim10(ifThen[2]),
    };
  }

  // "when X, Y" or "when X → Y"
  const when = anchorText.match(WHEN_RE);
  if (when) {
    return {
      condition: `when ${trim10(when[1])}`,
      result:    trim10(when[2]),
    };
  }

  // Arrow notation: A → B
  const arrow = anchorText.match(ARROW_RE);
  if (arrow) {
    return {
      condition: trim10(arrow[1]),
      result:    trim10(arrow[2]),
    };
  }

  // Fallback: first clause = condition, rest = result
  const commaIdx = anchorText.search(/(?<=[a-zA-Z]{3})[,;]/);
  if (commaIdx > 15 && commaIdx < 100) {
    return {
      condition: trim10(anchorText.slice(0, commaIdx)),
      result:    trim10(anchorText.slice(commaIdx + 1)),
    };
  }

  return { condition: "", result: trim10(anchorText) };
}

// ---------------------------------------------------------------------------
// Transformation field extraction
// ---------------------------------------------------------------------------

// Matches inline arrow notation: "aₙ = 1/n → 0 as n → ∞"
const TRANSFORMATION_ARROW_RE = /([a-zA-Zₙ₀₁₂₃₄₅₆₇₈₉\d/_^.]+\s*(?:[=:]|:=)\s*.{2,40}?)\s*→\s*(.{2,40}?)(?:[.;,]|$)/;
// Matches "approaches / converges to / tends to" with a target value
const TRANSFORMATION_APPROACH_RE = /\b(?:approaches?|converges?\s+to|tends?\s+to|goes?\s+to)\s+([−-]?[\d∞L∞zero]+(?:\s+as\b.{0,30})?)/i;
// Simple arrow without assignment
const SIMPLE_ARROW_RE = /\b([a-zA-Zₙ_^{}\d /]+)\s*→\s*([−\-]?[\d∞zero]+)/;

/**
 * Extracts a symbolic transformation step for a math concept, e.g. "aₙ = 1/n → 0".
 * Returns a string if found, or null if no symbolic step is detectable.
 */
export function extractMathTransformation(
  anchorText: string,
  supportTexts: string[]
): string | null {
  const candidates = [anchorText, ...supportTexts];

  for (const text of candidates) {
    // Try assignment + arrow: "aₙ = 1/n → 0 as n → ∞"
    const arrowMatch = text.match(TRANSFORMATION_ARROW_RE);
    if (arrowMatch) {
      const lhs = arrowMatch[1].trim().replace(/[,;]$/, "");
      const rhs = arrowMatch[2].trim().replace(/[,;]$/, "");
      if (lhs.length <= 40 && rhs.length <= 40) return `${lhs} → ${rhs}`;
    }

    // "approaches / converges to" pattern
    const approachMatch = text.match(TRANSFORMATION_APPROACH_RE);
    if (approachMatch) {
      const target = approachMatch[1].trim().replace(/[,;.]$/, "");
      return `→ ${target}`;
    }

    // Simple bare arrow: "x → 0"
    const simpleMatch = text.match(SIMPLE_ARROW_RE);
    if (simpleMatch) {
      const lhs = simpleMatch[1].trim();
      const rhs = simpleMatch[2].trim();
      if (lhs.length >= 1 && lhs.length <= 20) return `${lhs} → ${rhs}`;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Given field extraction (math input formula/state)
// ---------------------------------------------------------------------------

// Matches variable definitions like "aₙ = 1/n" or "f(x) = x^2 + 1"
const GIVEN_ASSIGN_RE = /\b([a-zA-Zₙ₀₁₂₃₄₅₆₇₈₉_]{1,6}(?:\([^)]{0,10}\))?)\s*=\s*([^,;.]{2,40}?)(?=[,;.]|$|\s+(?:for|where|with|and|if)\b)/;
// "Let aₙ = ..." / "Suppose f(x) = ..." / "Consider the sequence aₙ = ..."
const GIVEN_LET_RE = /\b(?:let|suppose|consider|given that|assume)\s+([a-zA-Zₙ₀₁₂₃₄₅₆₇₈₉_]{1,6}(?:\([^)]{0,10}\))?)\s*=\s*([^,;.]{2,40}?)(?=[,;.]|$)/i;

/**
 * Extracts the "Given" input state for a math concept (e.g., "aₙ = 1/n").
 * Returns a compact formula string or null.
 */
export function extractMathGiven(
  anchorText: string,
  supportTexts: string[]
): string | null {
  const candidates = [anchorText, ...supportTexts];

  for (const text of candidates) {
    // "Let/suppose/consider aₙ = ..." takes priority
    const letMatch = text.match(GIVEN_LET_RE);
    if (letMatch) {
      const lhs = letMatch[1].trim();
      const rhs = letMatch[2].trim().replace(/[,;.]$/, "");
      if (rhs.length <= 40) return `${lhs} = ${rhs}`;
    }

    // Plain assignment: "aₙ = 1/n"
    const assignMatch = text.match(GIVEN_ASSIGN_RE);
    if (assignMatch) {
      const lhs = assignMatch[1].trim();
      const rhs = assignMatch[2].trim().replace(/[,;.]$/, "");
      // Filter out prose-like assignments ("convergence is defined as...")
      if (rhs.length <= 40 && /[0-9n\-\/^∞√∫∑]|lim\b|sin\b|cos\b/.test(rhs)) {
        return `${lhs} = ${rhs}`;
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Decision field extraction (math convergence/divergence verdict)
// ---------------------------------------------------------------------------

const CONVERGES_RE = /\b(?:the\s+(?:sequence|series|function|limit)\s+)?(?:converges?(?:\s+to\b.{0,30})?|is\s+convergent)\b/i;
const DIVERGES_RE  = /\b(?:the\s+(?:sequence|series|function|limit)\s+)?(?:diverges?|is\s+divergent|does\s+not\s+converge|does\s+not\s+exist)\b/i;
const LIMIT_EXISTS_RE = /\blim(?:it)?\s+(?:exists?|is\s+equal\s+to|equals?)\b/i;
const CONCLUSION_RE = /\b(?:therefore|thus|hence|so|we\s+conclude|it\s+follows\s+that|this\s+(?:means|shows|implies|proves))\b.{0,100}/i;

/**
 * Extracts the decision/verdict for a math concept (e.g., "The sequence converges to 0").
 * Prefers explicit conclusion sentences; returns null if none found.
 */
export function extractMathDecision(
  anchorText: string,
  supportTexts: string[]
): string | null {
  const candidates = [anchorText, ...supportTexts];

  for (const text of candidates) {
    // Explicit conclusion connector
    const conclusionMatch = text.match(CONCLUSION_RE);
    if (conclusionMatch) {
      const s = conclusionMatch[0].trim().replace(/[,;]$/, "");
      const words = s.split(/\s+/);
      if (words.length >= 3 && words.length <= 20) return s;
    }
  }

  // Second pass: convergence/divergence verdict sentences
  for (const text of candidates) {
    const sentences = text.split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      if (CONVERGES_RE.test(sentence) || DIVERGES_RE.test(sentence) || LIMIT_EXISTS_RE.test(sentence)) {
        const words = sentence.trim().split(/\s+/);
        if (words.length >= 3 && words.length <= 25) {
          return sentence.trim().replace(/[.!?]$/, "");
        }
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Procedure step detection
// ---------------------------------------------------------------------------

const NUMBERED_STEP_RE = /^[\s]*(\d+)[.)]\s+(.+)$/gm;
const SEQUENTIAL_RE    = /(?:^|\.\s+)(first[,\s]|step\s+one[,\s])/i;

export function extractProcedureSteps(paragraphs: ParagraphInsight[]): string[] {
  const steps: string[] = [];

  for (const p of paragraphs) {
    const text = (p.cleanedText || p.rawText || "").trim();
    if (!text) continue;

    // Numbered list pattern: "1. Identify the sequence\n2. Compute..."
    const numbered: string[] = [];
    let m: RegExpExecArray | null;
    NUMBERED_STEP_RE.lastIndex = 0;
    while ((m = NUMBERED_STEP_RE.exec(text)) !== null) {
      const step = m[2].trim();
      if (step.length >= 8 && step.length <= 120) numbered.push(step);
    }
    if (numbered.length >= 2) {
      return numbered.slice(0, 6);
    }

    // Sequential connectors: "First, ... Then, ... Finally, ..."
    if (SEQUENTIAL_RE.test(text)) {
      const parts = text
        .split(/(?<=\.)\s+(?=(?:first|second|third|next|then|after|finally)[,\s])/i)
        .map(s => s.replace(/^(first|second|third|next|then|after|finally)[,\s]+/i, "").trim())
        .filter(s => s.length >= 8 && s.length <= 120);
      if (parts.length >= 2) return parts.slice(0, 5);
    }
  }

  return steps;
}

// ---------------------------------------------------------------------------
// Math page core idea
// ---------------------------------------------------------------------------

// Produces a math-specific coreIdea from the highest-priority definition/theorem paragraph
export function buildMathCoreIdea(
  paragraphs: ParagraphInsight[],
  concepts: ConceptBlockInput[],
): string | null {
  // Find the definition/theorem paragraph with highest priority score
  const candidates = paragraphs
    .filter(p => {
      const t = (p.cleanedText || p.rawText || "").trim();
      return (
        p.paragraphType === "definition" ||
        p.paragraphType === "formula" ||
        MATH_DEFINITION_RE.test(t) ||
        MATH_THEOREM_RE.test(t)
      );
    })
    .sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0));

  if (!candidates.length) return null;

  const best = candidates[0];
  const text = (best.cleanedText || best.rawText || "").trim();

  // Try to extract a clean definition sentence (up to first sentence boundary)
  const firstSentence = text.match(/^([^.!?]{20,200}[.!?])/);
  if (firstSentence?.[1]) {
    const s = firstSentence[1].trim();
    // Must contain an explanation signal to avoid returning a fragment
    if (/\b(is|are|defined|called|means|equals|approaches?|converges?|diverges?)\b/i.test(s)) {
      return s.length <= 200 ? s : s.slice(0, 200) + "…";
    }
  }

  return null;
}
