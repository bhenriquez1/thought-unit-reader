// lib/intelligence/scoring.ts
// Paragraph Intelligence Scoring Engine
// Computes a stable 0–100 score with named sub-scores explaining WHY.
// All weights and thresholds match the implementation spec exactly.

// ============================================================================
// Output types
// ============================================================================

export interface ScoreResult {
  total: number; // 0–100 integer
  subs: {
    examYield: number;        // 0..1
    mechanismDensity: number; // 0..1
    numbersThresholds: number;// 0..1
    decisionRules: number;    // 0..1
    clinicalFlow: number;     // 0..1
    trapRisk: number;         // 0..1 (high = more exam-relevant; show as warning)
  };
  highlights: {
    matchedSignals: string[];  // examYield keywords found
    matchedRules: string[];    // decisionRule markers found
    matchedNumbers: string[];  // numeric tokens found
    matchedFlow: string[];     // clinicalFlow markers found
    matchedTraps: string[];    // trap categories detected
  };
}

// ============================================================================
// Helpers
// ============================================================================

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

function countMatches(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length;
}

function uniqueMarkerHits(text: string, markers: string[]): number {
  let hits = 0;
  for (const m of markers) {
    if (text.includes(m)) hits++;
  }
  return hits;
}

function findMatchedMarkers(text: string, markers: string[]): string[] {
  return markers.filter(m => text.includes(m));
}

// ============================================================================
// 1) examYield — keyword density + definition/heading signals
// ============================================================================

const SIGNAL_KEYWORDS = [
  'high-yield', 'board', 'exam', 'important', 'key', 'classic', 'common',
  'most common', 'frequently', 'remember', 'must know', 'clinical significance',
];

const HAS_DEFINITION_RE = /(\bis\b|\bare\b)\s+(defined as|the|a)\b/;
const HAS_SECTION_HEADING_RE = /^[A-Z][A-Z\s,;:]{4,50}$/m;

function computeExamYield(lower: string): { score: number; matched: string[] } {
  const matched = findMatchedMarkers(lower, SIGNAL_KEYWORDS);
  const hasDef   = HAS_DEFINITION_RE.test(lower) ? 0.10 : 0;
  const hasHeading = HAS_SECTION_HEADING_RE.test(lower) ? 0.12 : 0;
  const score = clamp01(matched.length * 0.12 + hasHeading + hasDef);
  return { score, matched };
}

// ============================================================================
// 2) mechanismDensity — causal chains + pathway language
// ============================================================================

const CAUSAL_MARKERS = [
  'because', 'therefore', 'thus', 'leads to', 'results in', 'causes',
  'due to', 'as a result', 'mechanism', 'pathway', 'mediated', 'inhibits',
  'activates', 'stimulates', 'decreases', 'increases',
];

const ARROW_RE = /→|->|⇒/;
const STEP_LIST_RE = /^\s*(\d+[).]\s|[-•*]\s)/m;

function computeMechanismDensity(lower: string, original: string): { score: number; matched: string[] } {
  const matched = findMatchedMarkers(lower, CAUSAL_MARKERS);
  const hasArrow    = ARROW_RE.test(original) ? 0.10 : 0;
  const hasStepList = STEP_LIST_RE.test(original) ? 0.06 : 0;
  const score = clamp01(matched.length * 0.08 + hasArrow + hasStepList);
  return { score, matched };
}

// ============================================================================
// 3) numbersThresholds — numeric facts, cutoffs, units
// ============================================================================

const UNITS = [
  'mm', 'cm', 'mg', 'g', 'ml', 'l', 'µm', 'nm', 'kpa', 'mmhg', '°c',
  '%', 'mol', 'm', 's', 'min', 'hr', 'day', 'week', 'year',
];

const THRESHOLD_MARKERS = [
  'at least', 'at most', 'greater than', 'less than', '≥', '≤', '>', '<',
  'between', 'range', 'cutoff', 'threshold', 'normal', 'abnormal',
];

const NUMBER_RE = /(\b\d+(\.\d+)?\b)|(\b\d+\/\d+\b)/g;

function computeNumbersThresholds(lower: string): { score: number; matched: string[] } {
  const numMatches    = countMatches(lower, NUMBER_RE);
  const unitHits      = uniqueMarkerHits(lower, UNITS);
  const thresholdHits = uniqueMarkerHits(lower, THRESHOLD_MARKERS);
  const matched = [...new Set(lower.match(NUMBER_RE) ?? [])].slice(0, 8);
  const score = clamp01(numMatches * 0.06 + unitHits * 0.05 + thresholdHits * 0.06);
  return { score, matched };
}

// ============================================================================
// 4) decisionRules — if/then logic, contraindications, rules of thumb
// ============================================================================

const RULE_MARKERS = [
  'if', 'then', 'unless', 'only if', 'when', 'should', 'must', 'avoid',
  'contraindicated', 'indicated', 'recommend', 'rule', 'algorithm',
  'first-line', 'second-line', 'diagnosis', 'differential',
];

const IF_THEN_RE = /\bif\b.{5,80}\bthen\b/i;
const MODAL_RE = /\b(must|should)\b/gi;
const CONTRA_RE = /\b(contraindicated|contraindication)\b/i;

function computeDecisionRules(lower: string): { score: number; matched: string[] } {
  const ifThenHit  = IF_THEN_RE.test(lower) ? 1 : 0;
  const modalCount = countMatches(lower, MODAL_RE);
  const contraHit  = CONTRA_RE.test(lower) ? 1 : 0;
  const ruleHits   = uniqueMarkerHits(lower, RULE_MARKERS);
  const score = clamp01(
    (ifThenHit >= 1 ? 0.25 : 0) +
    modalCount * 0.06 +
    contraHit * 0.18 +
    ruleHits * 0.05,
  );
  const matched = findMatchedMarkers(lower, RULE_MARKERS);
  return { score, matched };
}

// ============================================================================
// 5) clinicalFlow — chief complaint → diagnosis → management chain
// ============================================================================

const FLOW_MARKERS = [
  'chief complaint', 'history', 'exam', 'examination', 'vitals', 'radiograph',
  'imaging', 'test', 'diagnosis', 'differential', 'treatment', 'management',
  'follow-up', 'prognosis', 'symptom', 'sign',
];

const NUMBERED_CLINICAL_RE = /^\s*\d+[).]\s+(history|exam|diagnos|treat|follow)/im;

function computeClinicalFlow(lower: string): { score: number; matched: string[] } {
  const matched  = findMatchedMarkers(lower, FLOW_MARKERS);
  const hasSteps = NUMBERED_CLINICAL_RE.test(lower) ? 0.10 : 0;
  const score = clamp01(matched.length * 0.07 + hasSteps);
  return { score, matched };
}

// ============================================================================
// 6) trapRisk — distractor bait features (per spec Section D)
// ============================================================================

const ABSOLUTE_RE_TRAP  = /\b(always|never|must|only|completely|entirely|all|none)\b/gi;
const EXCEPTION_RE_TRAP = /\b(except|however|although|but|despite|whereas|nevertheless|unless)\b/gi;
const NEGATION_RE_TRAP  = /\b(not|no|without|lack|fails to|cannot|isn't|aren't|doesn't|won't)\b/gi;
const QUALIFIER_RE_TRAP = /\b(most|often|typically|usually|may|can|sometimes|rarely)\b/gi;

const CONFUSABLE_PAIRS: [string, string][] = [
  ['apical', 'coronal'], ['buccal', 'lingual'], ['mesial', 'distal'],
  ['reversible', 'irreversible'], ['pulpitis', 'necrosis'],
  ['increase', 'decrease'], ['direct', 'inverse'],
  ['acute', 'chronic'], ['benign', 'malignant'],
];

function computeTrapRisk(lower: string): { score: number; matched: string[] } {
  const absCount  = countMatches(lower, ABSOLUTE_RE_TRAP);
  const excCount  = countMatches(lower, EXCEPTION_RE_TRAP);
  const negCount  = countMatches(lower, NEGATION_RE_TRAP);
  const qualCount = countMatches(lower, QUALIFIER_RE_TRAP);

  let pairsPresent = 0;
  for (const [a, b] of CONFUSABLE_PAIRS) {
    if (lower.includes(a) && lower.includes(b)) pairsPresent++;
  }

  const absoluteScore   = clamp01(absCount  * 0.20);
  const exceptionScore  = clamp01(excCount  * 0.18);
  const negationScore   = clamp01(negCount  * 0.14);
  const doubleNegBonus  = negCount >= 2 ? 0.15 : 0;
  const qualifierScore  = clamp01(qualCount * 0.08);
  const confusableScore = clamp01(pairsPresent * 0.22);

  const score = clamp01(
    absoluteScore + exceptionScore + negationScore +
    doubleNegBonus + confusableScore + qualifierScore,
  );

  const matched: string[] = [];
  if (absCount  > 0) matched.push('absolute language');
  if (excCount  > 0) matched.push('exception/reversal');
  if (negCount  > 0) matched.push('negation');
  if (pairsPresent > 0) matched.push('confusable terms');
  if (qualCount > 0) matched.push('qualifiers');

  return { score, matched };
}

// ============================================================================
// Weights — must sum to 1.0
// ============================================================================

const WEIGHTS = {
  examYield:         0.22,
  mechanismDensity:  0.18,
  numbersThresholds: 0.18,
  decisionRules:     0.17,
  clinicalFlow:      0.15,
  trapRisk:          0.10,
} as const;

// ============================================================================
// Main API
// ============================================================================

/**
 * Score a paragraph of text on six independent dimensions.
 * Returns a stable 0–100 integer and per-dimension sub-scores.
 */
export function scoreParagraph(
  text: string,
  _meta?: { heading?: string; isList?: boolean },
): ScoreResult {
  const lower    = text.toLowerCase();
  const original = text;

  const examRes = computeExamYield(lower);
  const mechRes = computeMechanismDensity(lower, original);
  const numRes  = computeNumbersThresholds(lower);
  const decRes  = computeDecisionRules(lower);
  const flowRes = computeClinicalFlow(lower);
  const trapRes = computeTrapRisk(lower);

  const raw =
    WEIGHTS.examYield         * examRes.score +
    WEIGHTS.mechanismDensity  * mechRes.score +
    WEIGHTS.numbersThresholds * numRes.score  +
    WEIGHTS.decisionRules     * decRes.score  +
    WEIGHTS.clinicalFlow      * flowRes.score +
    WEIGHTS.trapRisk          * trapRes.score;

  // Nonlinearity: soften midrange, slightly boost high-signal paragraphs
  const score01 = Math.pow(clamp01(0.10 + 0.90 * raw), 0.85);
  const total   = clampInt(score01 * 100, 0, 100);

  return {
    total,
    subs: {
      examYield:         examRes.score,
      mechanismDensity:  mechRes.score,
      numbersThresholds: numRes.score,
      decisionRules:     decRes.score,
      clinicalFlow:      flowRes.score,
      trapRisk:          trapRes.score,
    },
    highlights: {
      matchedSignals: examRes.matched,
      matchedRules:   decRes.matched,
      matchedNumbers: numRes.matched,
      matchedFlow:    flowRes.matched,
      matchedTraps:   trapRes.matched,
    },
  };
}
