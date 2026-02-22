// lib/page-intelligence/paragraphIntelligence.ts
// Paragraph Intelligence Engine (PR3+)
// Turns raw page text into ranked, role-classified ParagraphUnit[] with
// exact char offsets for click-to-source navigation.
// Now includes dimensional sub-scores + why-scored signal labels.

import type {
  ParagraphUnit,
  ParagraphRole,
  ParagraphSignals,
  ParagraphSubScores,
} from './types';

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

// Sub-score detection patterns
const DECISION_RE = /\b(if|when|criteria|staging|grade|stage|classification|indicate|threshold|cutoff|greater than|less than|≥|≤|>|<)\b/i;
const MATH_RE = /[=+\-×÷^√∑∫π]|\b\d+(\.\d+)?\s*(mg|ml|mm|%|mmHg|kg|dL|μg)\b|\bformula|equation\b/i;
const STRUCTURE_RE = /^\s*[-•*◦▪]\s+|\b(table|figure|fig\.|box|chart|diagram|section|chapter)\b/i;
const HEADING_PROXIMITY_RE = /^[A-Z][A-Z\s,;:]{5,50}$/;

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
 * Compute dimensional sub-scores (0–100 each) for visualization.
 */
function computeSubScores(
  text: string,
  role: ParagraphRole,
  signals: ParagraphSignals,
): ParagraphSubScores {
  // concept: definitions, key terms, "is" statements
  let conceptScore = 0;
  if (DEFINITION_RE.test(text)) conceptScore += 60;
  if (/\b(key|important|fundamental|principle|concept|term|terminology)\b/i.test(text)) conceptScore += 20;
  if (role === 'definition') conceptScore += 20;
  conceptScore = Math.min(100, conceptScore);

  // mechanism: cause→effect, pathways
  let mechanismScore = 0;
  if (MECHANISM_RE.test(text)) mechanismScore += 50;
  if (CAUSAL_RE.test(text)) mechanismScore += 30;
  if (/\b(pathway|cascade|sequence|process|step by step)\b/i.test(text)) mechanismScore += 20;
  mechanismScore = Math.min(100, mechanismScore);

  // decision: if/then, criteria, staging
  let decisionScore = 0;
  if (DECISION_RE.test(text)) decisionScore += 50;
  if (/\b(stage [IVX\d]|grade [IVX\d]|class [IVX\d])\b/i.test(text)) decisionScore += 30;
  if (signals.hasNumbers && signals.hasUnits) decisionScore += 20;
  decisionScore = Math.min(100, decisionScore);

  // examTrap: exceptions, negations, confusables
  let examTrapScore = 0;
  if (EXAM_TRAP_RE.test(text)) examTrapScore += 40;
  if (NEGATION_RE.test(text)) examTrapScore += 25;
  if (COMPARISON_RE.test(text)) examTrapScore += 20;
  if (/\b(except|all of the following|least likely|not typically)\b/i.test(text)) examTrapScore += 15;
  examTrapScore = Math.min(100, examTrapScore);

  // math: formulas, equations, variables
  let mathScore = 0;
  if (MATH_RE.test(text)) mathScore += 50;
  if (role === 'formula') mathScore += 30;
  if (signals.hasNumbers && signals.hasUnits) mathScore += 20;
  mathScore = Math.min(100, mathScore);

  // clinical: symptom→dx→test→tx chains
  let clinicalScore = 0;
  if (signals.hasClinicalTerms) clinicalScore += 40;
  if (/\b(symptom|sign|present|diagnos|treatment|therapy|management)\b/i.test(text)) clinicalScore += 30;
  const lower = text.toLowerCase();
  if (/\b(patient|clinical|dx|tx|rx|hx|sx)\b/.test(lower)) clinicalScore += 20;
  if (/\b(differential|rule out|confirm|exclude)\b/i.test(text)) clinicalScore += 10;
  clinicalScore = Math.min(100, clinicalScore);

  // structure: heading proximity, bullets, figure refs
  let structureScore = 0;
  if (STRUCTURE_RE.test(text)) structureScore += 40;
  if (HEADING_PROXIMITY_RE.test(text.trim().split('\n')[0] || '')) structureScore += 30;
  if (/\b(see figure|see table|refer to|as shown|above|below)\b/i.test(text)) structureScore += 20;
  if (/^(\d+\.|[a-z]\)|\([a-z]\)|\s*[-•*])/m.test(text)) structureScore += 10;
  structureScore = Math.min(100, structureScore);

  return {
    conceptScore,
    mechanismScore,
    decisionScore,
    examTrapScore,
    mathScore,
    clinicalScore,
    structureScore,
  };
}

/**
 * Generate 3–5 human-readable "why scored" signal labels for the UI.
 */
function computeWhyScoredSignals(
  text: string,
  role: ParagraphRole,
  signals: ParagraphSignals,
  subScores: ParagraphSubScores,
): string[] {
  const labels: string[] = [];

  if (subScores.conceptScore >= 40) labels.push('definition phrase');
  if (subScores.mechanismScore >= 40) labels.push('cause→effect chain');
  if (subScores.decisionScore >= 40) labels.push('decision rule');
  if (subScores.examTrapScore >= 40) labels.push('exam trap signal');
  if (subScores.mathScore >= 40) labels.push('formula/equation');
  if (subScores.clinicalScore >= 40) labels.push('clinical chain');
  if (subScores.structureScore >= 40) labels.push('structural element');
  if (signals.hasNumbers && signals.hasUnits) labels.push('numeric threshold');
  if (signals.hasNegation) labels.push('negation pattern');
  if (signals.hasComparison) labels.push('contrast language');
  if (/\b(most common|gold standard|first-line|hallmark)\b/i.test(text)) labels.push('high-yield keyword');
  if (/\b(stage|grade|class)\s+[IVX\d]/i.test(text)) labels.push('classification/staging');

  return labels.slice(0, 5);
}

/**
 * Compute importance as a weighted sum of sub-scores.
 * Weights chosen to reflect clinical exam relevance.
 */
function scoreImportanceFromSubScores(
  role: ParagraphRole,
  signals: ParagraphSignals,
  subScores: ParagraphSubScores,
  text: string,
): number {
  const weights = {
    conceptScore: 0.25,
    mechanismScore: 0.20,
    decisionScore: 0.15,
    examTrapScore: 0.15,
    clinicalScore: 0.15,
    mathScore: 0.05,
    structureScore: 0.05,
  };

  let score =
    subScores.conceptScore * weights.conceptScore +
    subScores.mechanismScore * weights.mechanismScore +
    subScores.decisionScore * weights.decisionScore +
    subScores.examTrapScore * weights.examTrapScore +
    subScores.clinicalScore * weights.clinicalScore +
    subScores.mathScore * weights.mathScore +
    subScores.structureScore * weights.structureScore;

  // Role bonuses
  if (role === 'definition') score += 10;
  if (role === 'exam_trap') score += 10;
  if (role === 'formula') score += 5;

  // Low-density narrative penalty
  const wordCount = text.split(/\s+/).length;
  if (wordCount > 80 && !signals.hasNumbers && !signals.hasClinicalTerms) score -= 8;

  return Math.max(0, Math.min(100, Math.round(score)));
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

/** Simple djb2-style hash for deduplication (not cryptographic). */
function simpleHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
    h = h >>> 0; // keep unsigned 32-bit
  }
  return h.toString(16).padStart(8, '0');
}

/** Normalize text for hashing: lowercase, collapse whitespace, trim. */
function normalizeForHash(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Build a SourceRef-compatible quoteHash from a text excerpt. */
export function buildQuoteHash(quote: string): string {
  return simpleHash(normalizeForHash(quote));
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
 * Each unit now includes sub-scores + whyScoredSignals for UI visualization.
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
    const subScores = computeSubScores(text, role, signals);
    const importance = scoreImportanceFromSubScores(role, signals, subScores, text);
    const whyScoredSignals = computeWhyScoredSignals(text, role, signals, subScores);
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
      subScores,
      whyScoredSignals,
    });
  }

  // Sort by importance desc; preserve insertion order for ties
  return units.sort((a, b) => b.importance - a.importance);
}
