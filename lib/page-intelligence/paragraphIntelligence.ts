// lib/page-intelligence/paragraphIntelligence.ts
// Paragraph Intelligence Engine (PR3)
// Turns raw page text into ranked, role-classified ParagraphUnit[] with
// exact char offsets for click-to-source navigation.

import type { ParagraphUnit, ParagraphRole, ParagraphSignals } from './types';

// ============================================================================
// Signal patterns — domain-agnostic heuristics
// ============================================================================

const DEFINITION_RE = /\b(is defined as|are defined as|defined as|refers to|is termed|is called|means that|known as|is the)\b/i;
const MECHANISM_RE = /\b(leads to|results in|because|pathway|step|mechanism|triggers|activates|inhibits|causes|initiated by|mediated by)\b/i;
const CLINICAL_RE = /\b(patient|diagnosis|diagnose|treatment|therapy|prognosis|symptom|sign|management|prescribe|administer|dose|drug|clinical|procedure|refer)\b/i;
const EXAM_TRAP_RE = /\b(except|however|beware|not |rarely|most common|unless|contrary|importantly not|do not|note that|mistake|often confused)\b/i;
const FORMULA_RE = /[=+\-×÷^√∑∫]|\b([A-Z]\s*=\s*[A-Z0-9])|formula|equation|calculated as|rate of/i;
const UNIT_RE = /\b(mg|ml|mm|cm|%|mmHg|kg|g\/dL|L|dL|μg|mcg|mEq|IU|mIU|hours?|days?|weeks?|months?|years?|sec|min)\b/i;
const NEGATION_RE = /\b(not|no|without|never|absent|lack|negative|contra|deficit|failure)\b/i;
const COMPARISON_RE = /\b(vs\.?|versus|compared|higher|lower|greater|less|more than|similar|unlike|whereas|while|differ)\b/i;
const CAUSAL_RE = /\b(because|therefore|thus|hence|leads to|results in|causes|due to|leading to)\b/i;
const TEMPORAL_RE = /\b(after|before|during|when|while|initially|eventually|first|then|finally|subsequently)\b/i;

// ============================================================================
// Helpers
// ============================================================================

function computeSignals(text: string): ParagraphSignals {
  return {
    hasNumbers: /\d+/.test(text),
    hasUnits: UNIT_RE.test(text),
    hasNegation: NEGATION_RE.test(text),
    hasComparison: COMPARISON_RE.test(text),
    hasCausal: CAUSAL_RE.test(text),
    hasTemporal: TEMPORAL_RE.test(text),
    hasClinicalTerms: CLINICAL_RE.test(text),
  };
}

function detectRole(text: string, signals: ParagraphSignals): ParagraphRole {
  if (DEFINITION_RE.test(text)) return 'definition';
  if (FORMULA_RE.test(text) && signals.hasNumbers) return 'formula';
  if (EXAM_TRAP_RE.test(text)) return 'exam_trap';
  if (MECHANISM_RE.test(text)) return 'mechanism';
  if (signals.hasClinicalTerms) return 'clinical';
  if (signals.hasComparison) return 'example';
  return 'summary';
}

/**
 * Importance scoring — exactly matches the spec weights:
 *   +25 definition | +25 mechanism | +20 clinical | +15 numbers+units
 *   +15 exam_trap  | +10 comparison | -10 low-density narrative
 */
function scoreImportance(role: ParagraphRole, signals: ParagraphSignals, text: string): number {
  let score = 0;

  if (role === 'definition') score += 25;
  if (role === 'mechanism') score += 25;
  if (signals.hasClinicalTerms) score += 20;
  if (signals.hasNumbers && signals.hasUnits) score += 15;
  if (role === 'exam_trap') score += 15;
  if (signals.hasComparison) score += 10;

  // Low-density narrative penalty
  const wordCount = text.split(/\s+/).length;
  if (wordCount > 80 && !signals.hasNumbers && !signals.hasClinicalTerms) score -= 10;

  return Math.max(0, Math.min(100, score));
}

function extractKeyTerms(text: string): string[] {
  const terms: string[] = [];

  // Capitalized multi-word noun phrases
  const properNounMatch = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g);
  if (properNounMatch) terms.push(...properNounMatch.slice(0, 5));

  // ALL_CAPS acronyms (diagnostic, drug names, etc.)
  const acronyms = text.match(/\b[A-Z]{2,5}\b/g);
  if (acronyms) terms.push(...acronyms.slice(0, 4));

  return [...new Set(terms)].slice(0, 6);
}

// ============================================================================
// Main engine
// ============================================================================

/**
 * Build ranked ParagraphUnit[] from raw page text.
 * Each unit carries its char offset so it can be used for jump-to-source.
 *
 * Segmentation strategy (3-tier):
 *  1. Split on double newlines
 *  2. For large blocks (>400 chars), split at sentence boundaries before capitals
 *  3. Filter out short fragments (< 20 chars)
 *
 * Outputs are sorted by importance descending so callers can take top-N.
 */
export function buildParagraphUnits(
  pageText: string,
  pageIndex: number,
  docId: string,
): ParagraphUnit[] {
  if (!pageText || pageText.trim().length < 20) return [];

  // Tier-1: double-newline split
  const rawBlocks = pageText
    .split(/\n\n+/)
    .flatMap((block) => {
      // Tier-2: for long blocks, split at sentence boundaries before capital
      if (block.length > 400) {
        return block
          .split(/(?<=[.!?])\s+(?=[A-Z])/)
          .filter((s) => s.trim().length >= 20);
      }
      return [block];
    })
    .filter((b) => b.trim().length >= 20);

  const units: ParagraphUnit[] = [];
  let cursor = 0;

  for (const block of rawBlocks) {
    const startChar = pageText.indexOf(block, cursor);
    if (startChar === -1) continue;
    const endChar = startChar + block.length;
    cursor = endChar;

    const text = block.trim();
    const signals = computeSignals(text);
    const role = detectRole(text, signals);
    const importance = scoreImportance(role, signals, text);
    const keyTerms = extractKeyTerms(text);

    units.push({
      id: `pu:${docId}:${pageIndex}:${startChar}`,
      pageIndex,
      text,
      startChar,
      endChar,
      role,
      importance,
      keyTerms,
      signals,
    });
  }

  // Sort by importance desc; preserve insertion order for ties
  return units.sort((a, b) => b.importance - a.importance);
}
