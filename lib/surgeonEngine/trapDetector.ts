// lib/surgeonEngine/trapDetector.ts
// DAT Trap Detection Engine
// Detect "likely-to-confuse" areas + wrong-answer attractors

import type {
  ExtractedUnit,
  TrapTag,
  TrapType,
  ID,
} from './types';

// ============================================================================
// Trap Detection Patterns
// ============================================================================

// 1) LOOK-ALIKE traps: conditions/terms that are commonly confused
const LOOK_ALIKE_PATTERNS: { pattern: RegExp; cue: string }[] = [
  { pattern: /\bgingivitis\b.*\bperiodontitis\b|\bperiodontitis\b.*\bgingivitis\b/i, cue: 'gingivitis vs periodontitis' },
  { pattern: /\bleukoplakia\b.*\blichen\s+planus\b|\blichen\s+planus\b.*\bleukoplakia\b/i, cue: 'leukoplakia vs lichen planus' },
  { pattern: /\breversible\s+pulpitis\b.*\birreversible\s+pulpitis\b|\birreversible\s+pulpitis\b.*\breversible\s+pulpitis\b/i, cue: 'reversible vs irreversible pulpitis' },
  { pattern: /\bperiapical\s+abscess\b.*\bperiapical\s+granuloma\b|\bperiapical\s+granuloma\b.*\bperiapical\s+abscess\b/i, cue: 'periapical abscess vs granuloma' },
  { pattern: /\bameloblastoma\b.*\bodontoma\b|\bodontoma\b.*\bameloblastoma\b/i, cue: 'ameloblastoma vs odontoma' },
  { pattern: /\bosteoarthritis\b.*\brheumatoid\b|\brheumatoid\b.*\bosteoarthritis\b/i, cue: 'OA vs RA' },
  { pattern: /\btype\s+1\b.*\btype\s+2\b|\btype\s+2\b.*\btype\s+1\b/i, cue: 'Type 1 vs Type 2' },
  { pattern: /\bacute\b.*\bchronic\b|\bchronic\b.*\bacute\b/i, cue: 'acute vs chronic' },
  { pattern: /\bbenign\b.*\bmalignant\b|\bmalignant\b.*\bbenign\b/i, cue: 'benign vs malignant' },
  // General "vs" pattern
  { pattern: /\b\w+\s+vs\.?\s+\w+/i, cue: 'comparison' },
];

// 2) REVERSAL traps: directional confusion
const REVERSAL_PATTERNS: { pattern: RegExp; cue: string }[] = [
  { pattern: /\bincreases?\b.*\bdecreases?\b|\bdecreases?\b.*\bincreases?\b/i, cue: 'increases vs decreases' },
  { pattern: /\bsympathetic\b.*\bparasympathetic\b|\bparasympathetic\b.*\bsympathetic\b/i, cue: 'sympathetic vs parasympathetic' },
  { pattern: /\bmaxill(a|ary)\b.*\bmandib(le|ular)\b|\bmandib(le|ular)\b.*\bmaxill(a|ary)\b/i, cue: 'maxilla vs mandible' },
  { pattern: /\bafferent\b.*\befferent\b|\befferent\b.*\bafferent\b/i, cue: 'afferent vs efferent' },
  { pattern: /\banterior\b.*\bposterior\b|\bposterior\b.*\banterior\b/i, cue: 'anterior vs posterior' },
  { pattern: /\bsuperficial\b.*\bdeep\b|\bdeep\b.*\bsuperficial\b/i, cue: 'superficial vs deep' },
  { pattern: /\bagonist\b.*\bantagonist\b|\bantagonist\b.*\bagonist\b/i, cue: 'agonist vs antagonist' },
  { pattern: /\bsensory\b.*\bmotor\b|\bmotor\b.*\bsensory\b/i, cue: 'sensory vs motor' },
  { pattern: /\binhibit\b.*\bactivate\b|\bactivate\b.*\binhibit\b/i, cue: 'inhibit vs activate' },
  { pattern: /\bupregulat\b.*\bdownregulat\b|\bdownregulat\b.*\bupregulat\b/i, cue: 'upregulation vs downregulation' },
];

// 3) THRESHOLD traps: numeric cutoffs and criteria
const THRESHOLD_PATTERNS: { pattern: RegExp; cue: string }[] = [
  { pattern: /\bprobing\s+depth\b.*\b\d+\s*mm\b/i, cue: 'probing depth cutoff' },
  { pattern: /\bclinical\s+attachment\s+loss\b.*\b\d+/i, cue: 'CAL threshold' },
  { pattern: /\bHbA1c\b.*\b\d+(\.\d+)?%?/i, cue: 'HbA1c threshold' },
  { pattern: /\bBP\b.*\b\d+\/\d+/i, cue: 'blood pressure cutoff' },
  { pattern: /\b\d+\s*mm\b/i, cue: 'measurement cutoff' },
  { pattern: /\bstage\s+(I|II|III|IV)\b.*\bcriteria\b/i, cue: 'staging criteria' },
  { pattern: /\bgrade\s+(I|II|III|IV|1|2|3|4)\b.*\bcriteria\b/i, cue: 'grading criteria' },
  { pattern: /\b(greater|less|more|fewer)\s+than\s+\d+/i, cue: 'numeric threshold' },
  { pattern: /\bcutoff\b|\bthreshold\b|\bcriteria\b/i, cue: 'defined cutoff' },
  { pattern: /\b[<>≥≤]\s*\d+/i, cue: 'comparison threshold' },
];

// 4) EXCEPTION traps: negation and exclusion patterns
const EXCEPTION_PATTERNS: { pattern: RegExp; cue: string }[] = [
  { pattern: /\bexcept\b/i, cue: 'except' },
  { pattern: /\bnot\s+(associated|related|caused|seen|found)\b/i, cue: 'negated association' },
  { pattern: /\bleast\s+likely\b/i, cue: 'least likely' },
  { pattern: /\ball\s+(of\s+the\s+following\s+)?except\b/i, cue: 'all except' },
  { pattern: /\brare(ly)?\s+(but|however|except)\b/i, cue: 'rare exception' },
  { pattern: /\bunlike\b/i, cue: 'unlike' },
  { pattern: /\bin\s+contrast\s+to\b/i, cue: 'in contrast' },
  { pattern: /\bhowever\b/i, cue: 'however (exception)' },
];

// 5) NEGATION traps: "not", "never", explicit denial
const NEGATION_PATTERNS: { pattern: RegExp; cue: string }[] = [
  { pattern: /\bdo\s+not\b/i, cue: 'do not' },
  { pattern: /\bnever\b/i, cue: 'never' },
  { pattern: /\bnot\s+recommended\b/i, cue: 'not recommended' },
  { pattern: /\bshould\s+not\b/i, cue: 'should not' },
  { pattern: /\bcannot\b|\bcan\s+not\b/i, cue: 'cannot' },
  { pattern: /\bno\s+(evidence|indication|benefit)\b/i, cue: 'no evidence/benefit' },
];

// ============================================================================
// Detection Engine
// ============================================================================

interface TrapDetection {
  type: TrapType;
  confidence: number;
  cue: string;
  matchedText?: string;
}

function detectLookAlikes(text: string): TrapDetection[] {
  const traps: TrapDetection[] = [];
  for (const { pattern, cue } of LOOK_ALIKE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      traps.push({
        type: 'LOOK_ALIKE',
        confidence: cue === 'comparison' ? 0.5 : 0.8,
        cue,
        matchedText: match[0].slice(0, 80),
      });
    }
  }
  return traps;
}

function detectReversals(text: string): TrapDetection[] {
  const traps: TrapDetection[] = [];
  for (const { pattern, cue } of REVERSAL_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      traps.push({
        type: 'REVERSAL',
        confidence: 0.75,
        cue,
        matchedText: match[0].slice(0, 80),
      });
    }
  }
  return traps;
}

function detectThresholds(text: string): TrapDetection[] {
  const traps: TrapDetection[] = [];
  for (const { pattern, cue } of THRESHOLD_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      traps.push({
        type: 'THRESHOLD',
        confidence: 0.7,
        cue,
        matchedText: match[0].slice(0, 80),
      });
    }
  }
  return traps;
}

function detectExceptions(text: string): TrapDetection[] {
  const traps: TrapDetection[] = [];
  for (const { pattern, cue } of EXCEPTION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      traps.push({
        type: 'EXCEPTION',
        confidence: 0.7,
        cue,
        matchedText: match[0].slice(0, 80),
      });
    }
  }
  return traps;
}

function detectNegations(text: string): TrapDetection[] {
  const traps: TrapDetection[] = [];
  for (const { pattern, cue } of NEGATION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      traps.push({
        type: 'NEGATION',
        confidence: 0.65,
        cue,
        matchedText: match[0].slice(0, 80),
      });
    }
  }
  return traps;
}

/**
 * Detect contrast language density for wording tricks
 */
function detectWordingTricks(text: string): TrapDetection[] {
  const contrastTerms = ['vs', 'versus', 'whereas', 'distinguish', 'differentiate',
    'unlike', 'compared to', 'in contrast', 'as opposed to', 'on the other hand'];
  const hits = contrastTerms.filter(t => text.toLowerCase().includes(t));

  if (hits.length >= 2) {
    return [{
      type: 'WORDING_TRICK',
      confidence: 0.6,
      cue: `Dense contrast language: ${hits.join(', ')}`,
    }];
  }
  return [];
}

// ============================================================================
// Trap Prompt Generator
// ============================================================================

function generateTrapPrompt(detection: TrapDetection): string {
  switch (detection.type) {
    case 'LOOK_ALIKE':
      return `Don't confuse: ${detection.cue}. Look for the distinguishing feature.`;
    case 'REVERSAL':
      return `Direction trap: ${detection.cue}. Double-check which direction applies.`;
    case 'THRESHOLD':
      return `Number trap: ${detection.cue}. Remember the exact cutoff value.`;
    case 'EXCEPTION':
      return `Exception alert: "${detection.cue}" pattern detected. Read carefully for what is excluded.`;
    case 'NEGATION':
      return `Negation trap: "${detection.cue}" — the question may test what NOT to do.`;
    case 'WORDING_TRICK':
      return `${detection.cue}. Slow down and parse each term carefully.`;
    default:
      return 'Potential confusion point detected.';
  }
}

function generateSeparatorHint(detection: TrapDetection): string | undefined {
  switch (detection.type) {
    case 'LOOK_ALIKE':
      return `Focus on the KEY distinguishing feature between the two. Look for specific criteria, histology, or clinical presentation differences.`;
    case 'REVERSAL':
      return `Create a mental table: left column = one direction, right column = opposite. Map each term clearly.`;
    case 'THRESHOLD':
      return `Write down the exact number. Associate it with the clinical consequence of crossing that threshold.`;
    case 'EXCEPTION':
      return `List the general rule first, then clearly identify what breaks it. Exceptions are high-yield test material.`;
    case 'NEGATION':
      return `Rephrase the statement positively to confirm your understanding. "Do not use X" = "Use everything except X."`;
    default:
      return undefined;
  }
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Detect all traps in a single unit's text
 */
export function detectTraps(unit: ExtractedUnit): TrapTag[] {
  const text = unit.cleanText || unit.text;
  const allDetections: TrapDetection[] = [
    ...detectLookAlikes(text),
    ...detectReversals(text),
    ...detectThresholds(text),
    ...detectExceptions(text),
    ...detectNegations(text),
    ...detectWordingTricks(text),
  ];

  // Deduplicate by type (keep highest confidence per type)
  const byType = new Map<TrapType, TrapDetection>();
  for (const d of allDetections) {
    const existing = byType.get(d.type);
    if (!existing || d.confidence > existing.confidence) {
      byType.set(d.type, d);
    }
  }

  const tags: TrapTag[] = [];
  for (const [, detection] of byType) {
    tags.push({
      trapId: `trap_${unit.unitId}_${detection.type}_${Date.now().toString(36)}`,
      unitId: unit.unitId,
      bookId: unit.bookId,
      type: detection.type,
      confidence: detection.confidence,
      cue: detection.cue,
      trapPrompt: generateTrapPrompt(detection),
      separatorHint: generateSeparatorHint(detection),
      createdAt: new Date().toISOString(),
    });
  }

  return tags;
}

/**
 * Batch-detect traps for all units
 */
export function detectAllTraps(
  units: ExtractedUnit[]
): Record<ID, TrapTag[]> {
  const result: Record<ID, TrapTag[]> = {};
  for (const unit of units) {
    const traps = detectTraps(unit);
    if (traps.length > 0) {
      result[unit.unitId] = traps;
    }
  }
  return result;
}

/**
 * Get summary stats for trap detection
 */
export function getTrapStats(
  traps: Record<ID, TrapTag[]>
): Record<TrapType, number> {
  const stats: Record<string, number> = {
    LOOK_ALIKE: 0,
    REVERSAL: 0,
    THRESHOLD: 0,
    EXCEPTION: 0,
    NEGATION: 0,
    WORDING_TRICK: 0,
  };

  for (const unitTraps of Object.values(traps)) {
    for (const trap of unitTraps) {
      stats[trap.type] = (stats[trap.type] || 0) + 1;
    }
  }

  return stats as Record<TrapType, number>;
}

export default {
  detectTraps,
  detectAllTraps,
  getTrapStats,
};
