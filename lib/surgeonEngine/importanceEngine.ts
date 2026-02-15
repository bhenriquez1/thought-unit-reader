// lib/surgeonEngine/importanceEngine.ts
// Importance Engine v2 - Dental/Medical-First Scoring
// Score formula: BaseClinical + ExamBoost + StructureBoost + PersonalBoost - RedundancyPenalty

import type {
  ExtractedUnit,
  ImportanceScore,
  ImportanceLabel,
  ImportanceSignals,
  ExamDomain,
  ID,
  TocNode,
} from './types';

// ============================================================================
// A) Clinical Core Signal Detectors
// ============================================================================

const DEFINITION_PATTERNS = [
  /\bis\s+defined\s+as\b/i,
  /\bdefinition\b/i,
  /\brefers\s+to\b/i,
  /\bis\s+a\s+(type|form|class|kind)\b/i,
  /\bis\s+characterized\s+by\b/i,
  /\bterm\s+(for|meaning)\b/i,
];

const CLASSIFICATION_PATTERNS = [
  /\bclassification\b/i,
  /\bclassified\s+(as|into)\b/i,
  /\btypes?\s+of\b/i,
  /\bcategories?\b/i,
  /\bclass\s+(I|II|III|IV|V)\b/i,
  /\bgrade\s+\d\b/i,
  /\btype\s+\d\b/i,
];

const STAGING_GRADING_PATTERNS = [
  /\bstag(e|ing)\b/i,
  /\bgrad(e|ing)\b/i,
  /\bTNM\b/,
  /\bstage\s+(I|II|III|IV)\b/i,
  /\bgrade\s+(I|II|III|IV|1|2|3|4)\b/i,
  /\bmild|moderate|severe|advanced\b/i,
];

const MECHANISM_PATTERNS = [
  /\bmechanism\b/i,
  /\bpathophysiology\b/i,
  /\bpathogenesis\b/i,
  /\bcaused\s+by\b/i,
  /\bresults?\s+in\b/i,
  /\bleads?\s+to\b/i,
  /\bdue\s+to\b/i,
  /\bmediated\s+by\b/i,
  /\bpathway\b/i,
  /\bcascade\b/i,
];

const DIAGNOSTIC_CRITERIA_PATTERNS = [
  /\bdiagnostic\s+criteria\b/i,
  /\bdiagnos(is|ed|tic)\b/i,
  /\bconfirmed\s+by\b/i,
  /\bgold\s+standard\b/i,
  /\bpathognomonic\b/i,
  /\bhallmark\b/i,
  /\bcharacteristic\s+(of|feature|sign|finding)\b/i,
  /\bpresents?\s+with\b/i,
];

const FIRST_LINE_PATTERNS = [
  /\bfirst[- ]line\b/i,
  /\btreatment\s+of\s+choice\b/i,
  /\bgold\s+standard\b/i,
  /\bpreferred\s+treatment\b/i,
  /\binitial\s+(treatment|therapy|management)\b/i,
  /\bdrug\s+of\s+choice\b/i,
  /\bmost\s+effective\b/i,
];

const CONTRAINDICATION_PATTERNS = [
  /\bcontraindicated\b/i,
  /\bcontraindication\b/i,
  /\bavoid\s+in\b/i,
  /\bdo\s+not\s+use\b/i,
  /\bnever\s+use\b/i,
  /\bshould\s+not\s+be\s+used\b/i,
  /\babsolute\s+contraindication\b/i,
  /\brelative\s+contraindication\b/i,
];

const DIFFERENTIAL_PATTERNS = [
  /\bdifferential\b/i,
  /\bvs\.?\b/i,
  /\bversus\b/i,
  /\bdistinguish\b/i,
  /\bdifferentiate\b/i,
  /\bcompared\s+(to|with)\b/i,
  /\bin\s+contrast\b/i,
  /\bwhereas\b/i,
];

const RED_FLAG_PATTERNS = [
  /\bred\s+flag\b/i,
  /\bemergency\b/i,
  /\blife[- ]threatening\b/i,
  /\burgen(t|cy)\b/i,
  /\bimmediate\s+(referral|treatment|action)\b/i,
  /\bcomplication\b/i,
  /\bdanger\b/i,
  /\bcritical\b/i,
  /\bwarning\s+sign\b/i,
];

const NUMERIC_THRESHOLD_PATTERNS = [
  /\b\d+\s*(mm|cm|mg|ml|%|mmHg|mmol|mEq|units?|IU)\b/i,
  /\bgreater\s+than\s+\d+/i,
  /\bless\s+than\s+\d+/i,
  /\b[<>≥≤]\s*\d+/,
  /\bnormal\s+(range|value)\b/i,
  /\bcutoff\b/i,
  /\bthreshold\b/i,
  /\bprobing\s+depth\b/i,
  /\bCAL\b/,
  /\bHbA1c\b/i,
  /\bBP\b/,
  /\bBMI\b/,
];

// ============================================================================
// B) Exam Language Signal Detectors
// ============================================================================

const EXAM_LANGUAGE_PATTERNS = [
  /\bmost\s+common\b/i,
  /\bmost\s+likely\b/i,
  /\bmost\s+frequent\b/i,
  /\bmost\s+important\b/i,
  /\bgold\s+standard\b/i,
  /\bfirst[- ]line\b/i,
  /\bcontraindicated\b/i,
  /\brisk\s+factor\b/i,
  /\betiology\b/i,
  /\bincidence\b/i,
  /\bprevalence\b/i,
  /\bprognosis\b/i,
  /\bclassic(al)?\s+(presentation|sign|finding|feature)\b/i,
  /\bbest\s+(test|treatment|initial|next\s+step)\b/i,
];

// ============================================================================
// Signal Computation
// ============================================================================

function countPatternMatches(text: string, patterns: RegExp[]): number {
  return patterns.filter(p => p.test(text)).length;
}

function signalStrength(text: string, patterns: RegExp[]): number {
  const matches = countPatternMatches(text, patterns);
  if (matches === 0) return 0;
  if (matches === 1) return 0.5;
  if (matches === 2) return 0.75;
  return 1.0;
}

export function computeSignals(text: string): ImportanceSignals {
  return {
    hasDefinition: signalStrength(text, DEFINITION_PATTERNS),
    hasClassification: signalStrength(text, CLASSIFICATION_PATTERNS),
    hasStagingGrading: signalStrength(text, STAGING_GRADING_PATTERNS),
    hasMechanism: signalStrength(text, MECHANISM_PATTERNS),
    hasDiagnosticCriteria: signalStrength(text, DIAGNOSTIC_CRITERIA_PATTERNS),
    hasFirstLine: signalStrength(text, FIRST_LINE_PATTERNS),
    hasContraindication: signalStrength(text, CONTRAINDICATION_PATTERNS),
    hasDifferential: signalStrength(text, DIFFERENTIAL_PATTERNS),
    hasRedFlags: signalStrength(text, RED_FLAG_PATTERNS),
    hasNumericThresholds: signalStrength(text, NUMERIC_THRESHOLD_PATTERNS),
    tocBoost: 0,
    tableBoxBoost: 0,
    repetitionBoost: 0,
    syllabusBoost: 0,
    weaknessBoost: 0,
    recencyDecay: 0,
  };
}

// ============================================================================
// Score Computation
// ============================================================================

/**
 * BaseClinical (0..55):
 * dx criteria, presentation, mechanism, management, red flags, differentials
 */
function computeBaseClinical(signals: ImportanceSignals): number {
  const weights: [keyof ImportanceSignals, number][] = [
    ['hasDiagnosticCriteria', 10],
    ['hasFirstLine', 9],
    ['hasContraindication', 9],
    ['hasRedFlags', 8],
    ['hasDifferential', 7],
    ['hasMechanism', 6],
    ['hasStagingGrading', 5],
    ['hasDefinition', 4],
    ['hasClassification', 4],
    ['hasNumericThresholds', 3],
  ];

  let score = 0;
  for (const [key, weight] of weights) {
    score += (signals[key] || 0) * weight;
  }
  // Normalize: max possible = 10+9+9+8+7+6+5+4+4+3 = 65, scale to 55
  return Math.min(55, Math.round(score * (55 / 65)));
}

/**
 * ExamBoost (0..25):
 * "most common/gold standard/first-line/contraindicated", thresholds, staging/grading
 */
function computeExamBoost(text: string, signals: ImportanceSignals): number {
  const examHits = countPatternMatches(text, EXAM_LANGUAGE_PATTERNS);
  const examScore = Math.min(1, examHits / 3);

  const thresholdScore = signals.hasNumericThresholds || 0;
  const stagingScore = signals.hasStagingGrading || 0;

  return Math.min(25, Math.round(
    examScore * 15 + thresholdScore * 5 + stagingScore * 5
  ));
}

/**
 * StructureBoost (0..10):
 * Appears in headings, tables, boxes; bold/italic; repetition
 */
function computeStructureBoost(signals: ImportanceSignals): number {
  const tocScore = (signals.tocBoost || 0) * 4;
  const tableScore = (signals.tableBoxBoost || 0) * 3;
  const repScore = (signals.repetitionBoost || 0) * 3;
  return Math.min(10, Math.round(tocScore + tableScore + repScore));
}

/**
 * PersonalBoost (0..20):
 * Mapped to syllabus, weakness cluster, recently reviewed decay
 */
function computePersonalBoost(signals: ImportanceSignals): number {
  const syllabusScore = (signals.syllabusBoost || 0) * 10;
  const weaknessScore = (signals.weaknessBoost || 0) * 10;
  return Math.min(20, Math.round(syllabusScore + weaknessScore));
}

/**
 * RedundancyPenalty (0..15):
 * Penalize repeated/low-info units
 */
function computeRedundancyPenalty(
  text: string,
  allUnits: ExtractedUnit[],
  unitId: ID
): number {
  // Simple text overlap check with nearby units
  const normalizedText = text.toLowerCase().trim();
  if (normalizedText.length < 20) return 10; // Very short = low value

  let duplicateCount = 0;
  for (const other of allUnits) {
    if (other.unitId === unitId) continue;
    const otherNorm = other.text.toLowerCase().trim();
    // Jaccard-like quick check
    const words1 = new Set(normalizedText.split(/\s+/));
    const words2 = new Set(otherNorm.split(/\s+/));
    let overlap = 0;
    for (const w of words1) {
      if (words2.has(w)) overlap++;
    }
    const similarity = overlap / Math.max(words1.size, 1);
    if (similarity > 0.8) duplicateCount++;
  }

  return Math.min(15, duplicateCount * 5);
}

// ============================================================================
// Main Scoring Function
// ============================================================================

export function scoreUnit(
  unit: ExtractedUnit,
  allUnits: ExtractedUnit[],
  domain: ExamDomain = 'DENTAL',
  options?: {
    tocNodes?: TocNode[];
    syllabusMatched?: boolean;
    isWeakCluster?: boolean;
  }
): ImportanceScore {
  const text = unit.cleanText || unit.text;
  const signals = computeSignals(text);

  // Apply structural boosts from options
  if (options?.tocNodes) {
    const inToc = options.tocNodes.some(
      n => n.pageStart && n.pageEnd &&
        unit.page >= n.pageStart && unit.page <= n.pageEnd
    );
    if (inToc) signals.tocBoost = 0.5;
  }

  if (options?.syllabusMatched) {
    signals.syllabusBoost = 1.0;
  }

  if (options?.isWeakCluster) {
    signals.weaknessBoost = 1.0;
  }

  // Check for table/box structure indicators
  if (/\|.*\|/.test(text) || /table\s+\d/i.test(text) || /\bfigure\b/i.test(text)) {
    signals.tableBoxBoost = 0.5;
  }

  const baseClinical = computeBaseClinical(signals);
  const examBoost = computeExamBoost(text, signals);
  const structureBoost = computeStructureBoost(signals);
  const personalBoost = computePersonalBoost(signals);
  const redundancyPenalty = computeRedundancyPenalty(text, allUnits, unit.unitId);

  const rawScore = baseClinical + examBoost + structureBoost + personalBoost - redundancyPenalty;
  const score = Math.max(0, Math.min(100, rawScore));

  let label: ImportanceLabel;
  if (score >= 75) label = 'HIGH_YIELD';
  else if (score >= 55) label = 'WORTH_KNOWING';
  else label = 'BACKGROUND';

  return {
    unitId: unit.unitId,
    bookId: unit.bookId,
    page: unit.page,
    score,
    label,
    domain,
    signals,
    breakdown: {
      baseClinical,
      examBoost,
      structureBoost,
      personalBoost,
      redundancyPenalty,
    },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Batch-score all units
 */
export function scoreAllUnits(
  units: ExtractedUnit[],
  domain: ExamDomain = 'DENTAL',
  options?: {
    tocNodes?: TocNode[];
    syllabusMatchedUnitIds?: Set<ID>;
    weakClusterUnitIds?: Set<ID>;
  }
): Record<ID, ImportanceScore> {
  const scores: Record<ID, ImportanceScore> = {};

  for (const unit of units) {
    scores[unit.unitId] = scoreUnit(unit, units, domain, {
      tocNodes: options?.tocNodes,
      syllabusMatched: options?.syllabusMatchedUnitIds?.has(unit.unitId),
      isWeakCluster: options?.weakClusterUnitIds?.has(unit.unitId),
    });
  }

  return scores;
}

/**
 * Get units sorted by importance (highest first)
 */
export function rankUnits(
  scores: Record<ID, ImportanceScore>
): ImportanceScore[] {
  return Object.values(scores).sort((a, b) => b.score - a.score);
}

export default {
  computeSignals,
  scoreUnit,
  scoreAllUnits,
  rankUnits,
};
