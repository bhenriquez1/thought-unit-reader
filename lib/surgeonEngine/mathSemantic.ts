// lib/surgeonEngine/mathSemantic.ts
// Math Semantic Parsing + OCR Normalization
// Converts OCR artifacts → normalized LaTeX-like expressions with clinical meaning layers

import type { ParagraphUnit, AnchoredItem, SourceRef } from '@/lib/page-intelligence/types';
import { generateId } from '@/lib/page-intelligence/types';

// ============================================================================
// Payload type
// ============================================================================

export interface MathSemanticPayload {
  /** Raw OCR text before normalization */
  raw: string;
  /** Normalized expression (LaTeX-like) */
  normalised: string;
  /** True if this is a standalone display equation (not inline) */
  isDisplay: boolean;
  /** Extracted variable→meaning pairs */
  variables: Array<{ symbol: string; meaning: string }>;
  /** Primary expression string (same as normalised, for render layer) */
  expression: string;
  /** One-sentence plain-English meaning */
  meaning: string;
  /** How/when this is used clinically */
  clinicalUse: string;
  /** Exam trap or common error students make */
  examTrap: string;
  /** Rendering hint: 'katex' for display math, 'inline' for in-line, 'code' fallback */
  renderMode: 'katex' | 'inline' | 'code';
}

// ============================================================================
// OCR Normalization Table
// ============================================================================

const OCR_NORMALIZATIONS: Array<[RegExp, string]> = [
  // Squared/cubed exponents (OCR omits ^ and {})
  [/\br(\s*)2\b/g, 'r^{2}'],
  [/\br(\s*)3\b/g, 'r^{3}'],
  [/([A-Za-z])2\b(?!\s*[=:])/g, '$1^{2}'],
  [/([A-Za-z])3\b(?!\s*[=:])/g, '$1^{3}'],

  // Greek letters (OCR reads as English words)
  [/\bpi\b(?!\s*\w{4,})/gi, '\\pi'],
  [/\balpha\b/gi, '\\alpha'],
  [/\bbeta\b/gi, '\\beta'],
  [/\bgamma\b/gi, '\\gamma'],
  [/\bdelta\b/gi, '\\Delta'],
  [/\bmu\b/gi, '\\mu'],
  [/\blambda\b/gi, '\\lambda'],
  [/\bsigma\b/gi, '\\sigma'],
  [/\btheta\b/gi, '\\theta'],
  [/\bomega\b/gi, '\\omega'],

  // Common OCR misreads for π (tr, Ti, 7t)
  [/\btr\s+r\b/gi, '\\pi r'],
  [/\bTi\s*r/g, '\\pi r'],
  [/\b7t\s*r/g, '\\pi r'],

  // Multiplication/division symbols
  [/\bx\b(?=\s*\d)/g, '\\times'],
  [/×/g, '\\times'],
  [/÷/g, '\\div'],

  // Comparison operators
  [/≤/g, '\\leq'],
  [/≥/g, '\\geq'],
  [/≠/g, '\\neq'],
  [/\b<=\b/g, '\\leq'],
  [/\b>=\b/g, '\\geq'],

  // Square root
  [/sqrt\s*\(/g, '\\sqrt{'],
  [/√/g, '\\sqrt'],

  // Simple fraction pattern a/b → \frac{a}{b} (digits only to avoid false positives)
  [/\b(\d+)\/(\d+)\b/g, '\\frac{$1}{$2}'],
];

// ============================================================================
// Variable extraction
// ============================================================================

function extractVariables(text: string): Array<{ symbol: string; meaning: string }> {
  const vars: Array<{ symbol: string; meaning: string }> = [];
  const seen = new Set<string>();

  // Pattern: "X = something" (single uppercase letter or known symbol)
  for (const m of text.matchAll(/\b([A-Z])\s*=\s*([^,;.\n]{3,50})/g)) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      vars.push({ symbol: m[1], meaning: m[2].trim() });
    }
  }

  // Pattern: "where X is something" or "where X = something"
  for (const m of text.matchAll(/where\s+([A-Z])\s+(?:is|=)\s+([^,;.\n]{3,50})/gi)) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      vars.push({ symbol: m[1], meaning: m[2].trim() });
    }
  }

  return vars;
}

// ============================================================================
// Semantic inference
// ============================================================================

function inferMeaning(raw: string, normalised: string): string {
  const lower = raw.toLowerCase();

  if (/area|surface area/.test(lower)) return 'Calculates area or surface measurement';
  if (/volume|capacity/.test(lower)) return 'Calculates volume or volumetric capacity';
  if (/pressure|force/.test(lower)) return 'Describes force-pressure relationship';
  if (/concentration|molarity|dilut/.test(lower)) return 'Describes concentration or dilution formula';
  if (/flow\s*rate|cardiac\s*output/.test(lower)) return 'Hemodynamic flow rate calculation';
  if (/dose|dosage|drug/.test(lower)) return 'Pharmacological dosing formula';
  if (/probability|p\s*=\s*[01]/.test(lower)) return 'Statistical probability expression';
  if (/\bph\b|\bacid|base\b/.test(lower)) return 'Acid-base or pH calculation';
  if (/ratio|index/.test(lower)) return 'Expresses a clinical ratio or index';

  // Fallback: describe the normalized form
  const shortExpr = normalised.replace(/\\/g, '').slice(0, 60);
  return `Mathematical expression: ${shortExpr}`;
}

function inferClinicalUse(raw: string): string {
  const lower = raw.toLowerCase();

  if (/bone|periodon|alveol|attachment/.test(lower)) return 'Periodontal/bone level assessment';
  if (/drug|dose|mg|mcg|pharmac|prescri/.test(lower)) return 'Drug dosing and pharmacology calculations';
  if (/blood|pressure|pulse|cardiac|ejection/.test(lower)) return 'Cardiovascular vital signs monitoring';
  if (/cell|count|hematol|wbc|rbc|hemoglob/.test(lower)) return 'Laboratory hematology values';
  if (/radius|diameter|lesion|mass|tumor/.test(lower)) return 'Lesion/tissue size measurement';
  if (/glomer|filtrat|creatinin/.test(lower)) return 'Renal function assessment';
  if (/ph|acid|buffer|bicarb/.test(lower)) return 'Acid-base balance management';
  if (/anesthes|agent|local/.test(lower)) return 'Anesthetic dosage calculations';

  return 'Applied in clinical measurements and comparative analysis';
}

function detectExamTrap(raw: string, normalised: string): string {
  if (/r\^?\{?2\}?|r2/.test(normalised)) {
    return 'Area uses r² (radius squared) — do NOT confuse with diameter (d = 2r)';
  }
  if (/\\pi/.test(normalised)) {
    return 'π ≈ 3.14; area of circle = πr², circumference = 2πr — different formulas for different measures';
  }
  if (/\\leq|\\geq|<=|>=/.test(normalised)) {
    return 'Carefully note ≤ vs < direction — boundary values included (≤) vs excluded (<)';
  }
  if (/\\frac|\d+\/\d+/.test(normalised) && /concentration|dilut/.test(raw.toLowerCase())) {
    return 'Concentration = mass/volume — do NOT invert the ratio';
  }
  if (/log|\\ln/.test(normalised)) {
    return 'log₁₀ ≠ ln (natural log) — they yield different numeric values';
  }
  if (/\\sqrt/.test(normalised)) {
    return 'Square root of a product ≠ product of square roots when values are not perfect squares';
  }

  return '';
}

// ============================================================================
// Main engine
// ============================================================================

/**
 * Scan ParagraphUnit[] for math content, normalize OCR artifacts,
 * and return AnchoredItem<MathSemanticPayload>[] for each formula found.
 */
export function runMathSemantic(
  units: ParagraphUnit[],
  _docId: string
): AnchoredItem<MathSemanticPayload>[] {
  const results: AnchoredItem<MathSemanticPayload>[] = [];

  for (const unit of units) {
    // Only process formula units or units with significant numeric/symbolic density
    const mathCharCount = (unit.text.match(/[=+\-×÷√∫∑∏^πΠ∆δ\d]/g) ?? []).length;
    const density = mathCharCount / Math.max(unit.text.length, 1);

    const isMathRole = unit.role === 'formula';
    const hasSufficientDensity = density >= 0.08;
    const hasEquation = /[A-Za-z]\s*=\s*[\d\w\\(]/.test(unit.text);

    if (!isMathRole && !hasSufficientDensity && !hasEquation) continue;

    const raw = unit.text;
    let normalised = raw;
    for (const [pattern, replacement] of OCR_NORMALIZATIONS) {
      normalised = normalised.replace(pattern, replacement);
    }

    const variables = extractVariables(raw);
    const meaning = inferMeaning(raw, normalised);
    const clinicalUse = inferClinicalUse(raw);
    const examTrap = detectExamTrap(raw, normalised);
    const isDisplay = density > 0.25 || unit.role === 'formula';

    const source: SourceRef = {
      pageIndex: unit.pageIndex,
      paragraphId: unit.id,
      startChar: unit.startChar,
      endChar: unit.endChar,
      quote: raw.slice(0, 180),
      confidence: unit.importance / 100,
    };

    const payload: MathSemanticPayload = {
      raw,
      normalised,
      isDisplay,
      variables,
      expression: normalised,
      meaning,
      clinicalUse,
      examTrap,
      renderMode: isDisplay ? 'katex' : 'inline',
    };

    results.push({
      id: generateId('math'),
      kind: 'math',
      title: `Formula: ${normalised.replace(/\\/g, '').slice(0, 60)}`,
      content: meaning,
      tags: ['math', 'formula', ...(examTrap ? ['exam_trap'] : [])],
      source,
      payload,
    });
  }

  return results;
}
