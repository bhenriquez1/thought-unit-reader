// lib/page-intelligence/trapDetector.ts
// DAT Trap Detection for ParagraphUnit[]
// Generic heuristics + dental domain module (oralPath + perio).
// Operates on the page-intelligence ParagraphUnit type.

import type { ParagraphUnit } from './types';

// ============================================================================
// Trap type taxonomy
// ============================================================================

export type TrapKind =
  | 'LOOK_ALIKE'
  | 'REVERSAL'
  | 'THRESHOLD'
  | 'EXCEPTION'
  | 'NEGATION'
  | 'ABSOLUTE_QUALIFIER'
  | 'CLASSIFICATION_BOUNDARY'
  | 'WORDING_TRICK';

export interface TrapHit {
  kind: TrapKind;
  confidence: number; // 0..1
  cue: string;
  matchedText?: string;
  prompt: string;  // "Don't confuse X..." advice
}

// ============================================================================
// Generic pattern banks
// ============================================================================

const LOOK_ALIKE: { re: RegExp; cue: string }[] = [
  { re: /\bgingivitis\b.*\bperiodontitis\b|\bperiodontitis\b.*\bgingivitis\b/is, cue: 'gingivitis vs periodontitis' },
  { re: /\bleukoplakia\b.*\blichen\s+planus\b|\blichen\s+planus\b.*\bleukoplakia\b/is, cue: 'leukoplakia vs lichen planus' },
  { re: /\breversible\s+pulpitis\b.*\birreversible|\birreversible.*\breversible\s+pulpitis\b/is, cue: 'reversible vs irreversible pulpitis' },
  { re: /\bameloblastoma\b.*\bodontoma\b|\bodontoma\b.*\bameloblastoma\b/is, cue: 'ameloblastoma vs odontoma' },
  { re: /\bosteoarthritis\b.*\brheumatoid\b|\brheumatoid\b.*\bosteoarthritis\b/is, cue: 'OA vs RA' },
  { re: /\btype\s+1\b.*\btype\s+2\b|\btype\s+2\b.*\btype\s+1\b/i, cue: 'Type 1 vs Type 2' },
  { re: /\bacute\b.*\bchronic\b|\bchronic\b.*\bacute\b/i, cue: 'acute vs chronic' },
  { re: /\bbenign\b.*\bmalignant\b|\bmalignant\b.*\bbenign\b/i, cue: 'benign vs malignant' },
  { re: /\b\w+\s+vs\.?\s+\w+/i, cue: 'comparison' },
];

const REVERSAL: { re: RegExp; cue: string }[] = [
  { re: /\bincreases?\b.*\bdecreases?\b|\bdecreases?\b.*\bincreases?\b/i, cue: 'increases vs decreases' },
  { re: /\bsympathetic\b.*\bparasympathetic\b|\bparasympathetic\b.*\bsympathetic\b/i, cue: 'sympathetic vs parasympathetic' },
  { re: /\bafferent\b.*\befferent\b|\befferent\b.*\bafferent\b/i, cue: 'afferent vs efferent' },
  { re: /\banterior\b.*\bposterior\b|\bposterior\b.*\banterior\b/i, cue: 'anterior vs posterior' },
  { re: /\bagonist\b.*\bantagonist\b|\bantagonist\b.*\bagonist\b/i, cue: 'agonist vs antagonist' },
  { re: /\bupregulat\w*\b.*\bdownregulat\w*\b|\bdownregulat\w*\b.*\bupregulat\w*\b/i, cue: 'upregulation vs downregulation' },
  { re: /\binhibit\b.*\bactivate\b|\bactivate\b.*\binhibit\b/i, cue: 'inhibit vs activate' },
];

const THRESHOLD: { re: RegExp; cue: string }[] = [
  { re: /\bprobing\s+depth\b.*\b\d+\s*mm\b/i, cue: 'probing depth cutoff' },
  { re: /\bclinical\s+attachment\s+(loss|level)\b.*\b\d+/i, cue: 'CAL threshold' },
  { re: /\bHbA1c\b.*\b\d+(\.\d+)?%?/i, cue: 'HbA1c threshold' },
  { re: /\b(greater|less|more|fewer)\s+than\s+\d+/i, cue: 'numeric threshold' },
  { re: /\bcutoff\b|\bthreshold\b/i, cue: 'defined cutoff' },
  { re: /\b[<>≥≤]\s*\d+/i, cue: 'comparison threshold' },
  { re: /\bstage\s+(I{1,3}V?|IV)\b.*\bcriteria\b/i, cue: 'staging criteria' },
  { re: /\bgrade\s+[1-4IVX]+\b.*\b(criteria|factor)/i, cue: 'grading criteria' },
];

const EXCEPTION: { re: RegExp; cue: string }[] = [
  { re: /\ball\s+(of\s+the\s+following\s+)?except\b/i, cue: 'all except' },
  { re: /\bleast\s+likely\b/i, cue: 'least likely' },
  { re: /\bnot\s+(associated|related|caused|seen|found)\b/i, cue: 'negated association' },
  { re: /\bunlike\b/i, cue: 'unlike' },
  { re: /\bin\s+contrast\s+to\b/i, cue: 'in contrast' },
  { re: /\bhowever\b/i, cue: 'however (exception)' },
  { re: /\bexcept\b/i, cue: 'except' },
];

const NEGATION: { re: RegExp; cue: string }[] = [
  { re: /\bdo\s+not\b/i, cue: 'do not' },
  { re: /\bnever\b/i, cue: 'never' },
  { re: /\bnot\s+recommended\b/i, cue: 'not recommended' },
  { re: /\bshould\s+not\b/i, cue: 'should not' },
  { re: /\bcannot\b|\bcan\s+not\b/i, cue: 'cannot' },
  { re: /\bno\s+(evidence|indication|benefit)\b/i, cue: 'no evidence/benefit' },
];

const ABSOLUTE: { re: RegExp; cue: string }[] = [
  { re: /\balways\b/i, cue: 'always (absolute)' },
  { re: /\bnever\b/i, cue: 'never (absolute)' },
  { re: /\bmust\s+(always|never)\b/i, cue: 'must always/never' },
  { re: /\bin\s+all\s+cases\b/i, cue: 'in all cases' },
  { re: /\bwithout\s+exception\b/i, cue: 'without exception' },
];

// ============================================================================
// Dental domain patterns (oralPath + perio)
// ============================================================================

const ORAL_PATH_CONFUSABLES: { re: RegExp; cue: string }[] = [
  { re: /\bdysplasia\b.*\bcarcinoma\b|\bcarcinoma\b.*\bdysplasia\b/i, cue: 'dysplasia vs carcinoma in situ' },
  { re: /\bpemphigus\b.*\bpemphigoid\b|\bpemphigoid\b.*\bpemphigus\b/i, cue: 'pemphigus vs pemphigoid' },
  { re: /\berythroplakia\b.*\bleukoplakia\b|\bleukoplakia\b.*\berythroplakia\b/i, cue: 'erythroplakia vs leukoplakia' },
  { re: /\bverrucous\b.*\bSCC\b|\bSCC\b.*\bverrucous\b/i, cue: 'verrucous vs SCC' },
  { re: /\bcandidiasis\b.*\blichen\s+planus\b|\blichen\s+planus\b.*\bcandidiasis\b/i, cue: 'candidiasis vs lichen planus' },
];

const PERIO_CLASSIFICATION: { re: RegExp; cue: string }[] = [
  { re: /\b(stage|grade)\s+(I{1,3}V?|IV)\b.*\b(CAL|PPD|BOP|bone\s+loss)\b/i, cue: 'perio staging/grading criteria' },
  { re: /\baggressive\b.*\bchronic\b|\bchronic\b.*\baggressive\b/i, cue: 'aggressive vs chronic periodontitis (legacy)' },
  { re: /\bfurcation\s+(class|involvement)\b.*\b[123]\b/i, cue: 'furcation classification boundary' },
  { re: /\b(systemic\s+modifier|smoking|diabetes)\b.*\b(grade|risk)\b/i, cue: 'systemic modifier → grade escalation' },
];

// ============================================================================
// Prompt generator
// ============================================================================

function buildPrompt(kind: TrapKind, cue: string): string {
  switch (kind) {
    case 'LOOK_ALIKE':
      return `Don't confuse: ${cue}. Identify the key distinguishing feature.`;
    case 'REVERSAL':
      return `Direction trap — ${cue}. Double-check which direction applies.`;
    case 'THRESHOLD':
      return `Number trap: ${cue}. Memorize the exact cutoff value.`;
    case 'EXCEPTION':
      return `Exception alert: "${cue}" — read carefully for what is excluded.`;
    case 'NEGATION':
      return `Negation trap: "${cue}" — test may ask what NOT to do.`;
    case 'ABSOLUTE_QUALIFIER':
      return `Absolute qualifier: "${cue}" — these are often wrong in MCQs.`;
    case 'CLASSIFICATION_BOUNDARY':
      return `Classification boundary: ${cue}. Know exactly which criteria push to next stage.`;
    case 'WORDING_TRICK':
      return `Wording trick: ${cue}. Parse each term slowly.`;
    default:
      return 'Potential confusion point detected.';
  }
}

// ============================================================================
// Main detection
// ============================================================================

function runPatterns(
  text: string,
  patterns: { re: RegExp; cue: string }[],
  kind: TrapKind,
  confidenceBase: number,
): TrapHit[] {
  const hits: TrapHit[] = [];
  for (const { re, cue } of patterns) {
    const m = text.match(re);
    if (m) {
      hits.push({
        kind,
        confidence: cue === 'comparison' ? 0.45 : confidenceBase,
        cue,
        matchedText: m[0].slice(0, 80),
        prompt: buildPrompt(kind, cue),
      });
    }
  }
  return hits;
}

/**
 * Detect all DAT traps in a single ParagraphUnit's text.
 * Returns deduplicated hits (highest confidence per kind).
 */
export function detectParagraphTraps(unit: ParagraphUnit): TrapHit[] {
  const text = unit.text;
  const allHits: TrapHit[] = [
    ...runPatterns(text, LOOK_ALIKE, 'LOOK_ALIKE', 0.80),
    ...runPatterns(text, REVERSAL, 'REVERSAL', 0.75),
    ...runPatterns(text, THRESHOLD, 'THRESHOLD', 0.70),
    ...runPatterns(text, EXCEPTION, 'EXCEPTION', 0.70),
    ...runPatterns(text, NEGATION, 'NEGATION', 0.65),
    ...runPatterns(text, ABSOLUTE, 'ABSOLUTE_QUALIFIER', 0.60),
    ...runPatterns(text, ORAL_PATH_CONFUSABLES, 'LOOK_ALIKE', 0.85),
    ...runPatterns(text, PERIO_CLASSIFICATION, 'CLASSIFICATION_BOUNDARY', 0.85),
  ];

  // Dense contrast language → wording trick
  const contrastCount = ['vs', 'versus', 'whereas', 'distinguish', 'unlike', 'in contrast',
    'as opposed to', 'on the other hand'].filter(t => text.toLowerCase().includes(t)).length;
  if (contrastCount >= 2) {
    allHits.push({
      kind: 'WORDING_TRICK',
      confidence: 0.55,
      cue: `dense contrast language (${contrastCount} contrast terms)`,
      prompt: buildPrompt('WORDING_TRICK', 'contrast-heavy paragraph'),
    });
  }

  // Dedup by kind — keep highest confidence per kind
  const byKind = new Map<TrapKind, TrapHit>();
  for (const hit of allHits) {
    const existing = byKind.get(hit.kind);
    if (!existing || hit.confidence > existing.confidence) {
      byKind.set(hit.kind, hit);
    }
  }

  return Array.from(byKind.values()).sort((a, b) => b.confidence - a.confidence);
}

/**
 * Annotate an array of ParagraphUnits with trapTypes[] field.
 * Mutates units in-place for pipeline convenience.
 */
export function annotateTraps(units: ParagraphUnit[]): ParagraphUnit[] {
  return units.map((u) => {
    const hits = detectParagraphTraps(u);
    if (hits.length === 0) return u;
    return {
      ...u,
      trapTypes: [...new Set(hits.map((h) => h.kind))],
    };
  });
}
