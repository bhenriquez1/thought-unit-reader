// lib/surgeonEngine/mathEngine.ts
// Math Engine (PR4A)
// Processes ParagraphUnit[] to produce AnchoredItem[] for formula-heavy content.
// Builds on lib/mathExtractor.ts — no hardcoded textbook logic.

import {
  computeMathDensity,
  normalizeMathText,
  isDisplayMathBlock,
  mathRenderMode,
} from '../mathExtractor';
import type { ParagraphUnit, AnchoredItem, SourceRef } from '../page-intelligence/types';

// ============================================================================
// Variable meaning extraction heuristics
// ============================================================================

// "A = base width" / "P denotes perimeter" / "where V is volume"
const VAR_MEANING_RE = /\b([A-Z][a-z]?)\s*(?:=|is|denotes?|represents?|stands for)\s*([a-z][^,.;]{2,40})/gi;

// Exam trap patterns for math
const MATH_TRAP_RES = [
  { re: /\bwhere\b.{5,}\bonly\b/i, hint: 'Restriction on domain/variables' },
  { re: /\bnot equal\b|≠|!=/, hint: 'Inequality — check boundaries' },
  { re: /\bapproximat|≈|~\s*\d/, hint: 'Approximation used — exact value differs' },
  { re: /\bunits?\b.{3,20}\b(per|over|divided)\b/i, hint: 'Unit conversion trap' },
];

function extractVariableMeanings(raw: string): Record<string, string> {
  const meanings: Record<string, string> = {};
  let m: RegExpExecArray | null;
  const re = new RegExp(VAR_MEANING_RE.source, 'gi');
  while ((m = re.exec(raw)) !== null) {
    meanings[m[1]] = m[2].trim().replace(/[,;.]$/, '');
  }
  return meanings;
}

function detectMathTraps(text: string): string[] {
  return MATH_TRAP_RES
    .filter(({ re }) => re.test(text))
    .map(({ hint }) => hint);
}

function inferWhatItMeans(unit: ParagraphUnit, normalised: string): string {
  if (unit.role === 'formula') {
    const varMeanings = extractVariableMeanings(unit.text);
    const varLines = Object.entries(varMeanings)
      .map(([v, m]) => `${v} = ${m}`)
      .join(', ');
    return varLines
      ? `Equation with variables: ${varLines}`
      : `Mathematical relationship: ${normalised.slice(0, 120)}`;
  }
  return unit.text.slice(0, 180);
}

function inferWhenUsed(unit: ParagraphUnit): string {
  const { signals } = unit;
  if (signals.hasClinicalTerms) return 'Clinical calculation / diagnostic threshold';
  if (signals.hasUnits) return 'Quantitative measurement or conversion';
  return 'Quantitative expression — check units and domain';
}

// ============================================================================
// Main engine function
// ============================================================================

export interface MathEngineOptions {
  /** Min density to treat a paragraph as math (default 0.15) */
  minDensity?: number;
}

/**
 * Process ParagraphUnit[] and produce AnchoredItem[] for formula content.
 * Items have kind="math" and carry normalised expression + variable meanings.
 */
export function runMathEngine(
  units: ParagraphUnit[],
  docId: string,
  options: MathEngineOptions = {},
): AnchoredItem[] {
  const { minDensity = 0.15 } = options;

  const items: AnchoredItem[] = [];

  for (const unit of units) {
    const density = computeMathDensity(unit.text);
    if (unit.role !== 'formula' && density < minDensity) continue;

    const normalised = normalizeMathText(unit.text);
    const isDisplay = isDisplayMathBlock(unit.text) || density >= 0.4;
    const varMeanings = extractVariableMeanings(unit.text);
    const traps = detectMathTraps(unit.text);
    const renderMode = mathRenderMode(normalised);

    const source: SourceRef = {
      pageIndex: unit.pageIndex,
      paragraphId: unit.id,
      startChar: unit.startChar,
      endChar: unit.endChar,
      quote: unit.text.slice(0, 180),
      bbox: unit.bbox,
      confidence: density >= 0.4 ? 0.9 : 0.6,
    };

    items.push({
      id: `math:${unit.id}`,
      kind: 'math',
      title: isDisplay ? 'Display Formula' : 'Key Formula',
      content: normalised,
      tags: ['math', isDisplay ? 'display' : 'inline', renderMode],
      source,
      payload: {
        raw: unit.text,
        normalised,
        isDisplay,
        density,
        renderMode,
        variableMeanings: varMeanings,
        whatItMeans: inferWhatItMeans(unit, normalised),
        whenUsed: inferWhenUsed(unit),
        examTraps: traps,
      },
    });
  }

  return items;
}
