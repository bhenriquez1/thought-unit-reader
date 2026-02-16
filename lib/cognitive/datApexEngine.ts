// lib/cognitive/datApexEngine.ts
// DAT Apex Engine - Exam Signal Scoring + Trap Detection
// Identifies confusables, exceptions, thresholds, look-alikes

import type {
  KnowledgeCard,
  ExamType,
  TrapSignal,
  TrapKind,
  DifferentialTable,
  DatApexEngine,
  EvidenceSpan,
} from './types';

// ============================================================================
// Trap Detection Patterns
// ============================================================================

interface TrapPattern {
  kind: TrapKind;
  patterns: RegExp[];
  baseLabel: string;
  baseSeverity: number;
}

const TRAP_PATTERNS: TrapPattern[] = [
  {
    kind: 'exception',
    patterns: [
      /\bexcept\b/i,
      /\ball\s+(of\s+the\s+following\s+)?except\b/i,
      /\brare(ly)?\s+(but|however|except)\b/i,
      /\bunlike\b/i,
      /\bhowever\b/i,
      /\bin\s+contrast\b/i,
      /\bonly\s+when\b/i,
    ],
    baseLabel: 'Exception pattern',
    baseSeverity: 80,
  },
  {
    kind: 'threshold',
    patterns: [
      /\b\d+\s*(mm|cm|mg|ml|%|mmHg)\b/i,
      /\b[<>≥≤]\s*\d+/,
      /\bprobing\s+depth\b.*\b\d+/i,
      /\bcutoff\b|\bthreshold\b/i,
      /\bgreater\s+than\s+\d+/i,
      /\bless\s+than\s+\d+/i,
      /\bstage\s+(I|II|III|IV)\b/i,
      /\bgrade\s+(1|2|3|4|I|II|III|IV)\b/i,
    ],
    baseLabel: 'Numeric threshold',
    baseSeverity: 75,
  },
  {
    kind: 'confusable',
    patterns: [
      /\bvs\.?\s+\w+/i,
      /\bversus\b/i,
      /\bdistinguish\b/i,
      /\bdifferentiate\b/i,
      /\bcompared\s+(to|with)\b/i,
      /\bsimilar\s+to\b/i,
    ],
    baseLabel: 'Confusable terms',
    baseSeverity: 70,
  },
  {
    kind: 'negation',
    patterns: [
      /\bdo\s+not\b/i,
      /\bnever\b/i,
      /\bnot\s+recommended\b/i,
      /\bshould\s+not\b/i,
      /\bcannot\b/i,
      /\bno\s+(evidence|indication|benefit)\b/i,
      /\bleast\s+likely\b/i,
    ],
    baseLabel: 'Negation trap',
    baseSeverity: 70,
  },
  {
    kind: 'units',
    patterns: [
      /\bconvert\b.*\b(to|from)\b/i,
      /\b(mg|ml|mcg|ng|g)\s*\/\s*(kg|L|dL|mL)\b/i,
      /\bper\s+(day|hour|minute|kg)\b/i,
    ],
    baseLabel: 'Unit conversion',
    baseSeverity: 65,
  },
  {
    kind: 'lookalike',
    patterns: [
      /\bgingivitis\b.*\bperiodontitis\b|\bperiodontitis\b.*\bgingivitis\b/i,
      /\breversible\b.*\birreversible\b|\birreversible\b.*\breversible\b/i,
      /\bacute\b.*\bchronic\b|\bchronic\b.*\bacute\b/i,
      /\bbenign\b.*\bmalignant\b|\bmalignant\b.*\bbenign\b/i,
      /\btype\s+1\b.*\btype\s+2\b|\btype\s+2\b.*\btype\s+1\b/i,
      /\bintrinsic\b.*\bextrinsic\b|\bextrinsic\b.*\bintrinsic\b/i,
      /\bagonist\b.*\bantagonist\b|\bantagonist\b.*\bagonist\b/i,
      /\bsympathetic\b.*\bparasympathetic\b/i,
      /\bafferent\b.*\befferent\b|\befferent\b.*\bafferent\b/i,
    ],
    baseLabel: 'Look-alike terms',
    baseSeverity: 85,
  },
];

// ============================================================================
// Signal Scoring Patterns
// ============================================================================

const EXAM_SIGNAL_PATTERNS = [
  { pattern: /\bmost\s+common\b/i, weight: 15 },
  { pattern: /\bmost\s+likely\b/i, weight: 15 },
  { pattern: /\bgold\s+standard\b/i, weight: 12 },
  { pattern: /\bfirst[- ]line\b/i, weight: 12 },
  { pattern: /\btreatment\s+of\s+choice\b/i, weight: 12 },
  { pattern: /\bcontraindicated\b/i, weight: 10 },
  { pattern: /\bclassic(al)?\s+(presentation|sign|finding)\b/i, weight: 10 },
  { pattern: /\bpathognomonic\b/i, weight: 10 },
  { pattern: /\bhallmark\b/i, weight: 8 },
  { pattern: /\brisk\s+factor\b/i, weight: 6 },
  { pattern: /\bdifferential\b/i, weight: 6 },
  { pattern: /\bdiagnosis\b/i, weight: 5 },
  { pattern: /\btreatment\b/i, weight: 5 },
  { pattern: /\bcomplication\b/i, weight: 5 },
];

// ============================================================================
// Trap Detection Functions
// ============================================================================

function detectTraps(card: KnowledgeCard): TrapSignal[] {
  const text = `${card.title} ${card.summary}`;
  const traps: TrapSignal[] = [];

  for (const trapPattern of TRAP_PATTERNS) {
    for (const pattern of trapPattern.patterns) {
      const match = text.match(pattern);
      if (match) {
        // Create evidence from card evidence if available
        const evidence: EvidenceSpan[] = card.evidence.length > 0
          ? [{ ...card.evidence[0], text: match[0] }]
          : [{
            docId: card.docId,
            pageIndex: card.pageRefs[0] ?? 0,
            text: match[0],
          }];

        traps.push({
          kind: trapPattern.kind,
          label: trapPattern.baseLabel,
          detail: generateTrapDetail(trapPattern.kind, match[0]),
          evidence,
          severity: trapPattern.baseSeverity,
        });

        // Only one trap per kind per card
        break;
      }
    }
  }

  return traps;
}

function generateTrapDetail(kind: TrapKind, matchedText: string): string {
  switch (kind) {
    case 'exception':
      return `Watch for "except" or "unlike" - read carefully for what is EXCLUDED. Matched: "${matchedText}"`;
    case 'threshold':
      return `Memorize the exact number! This threshold is likely testable. Matched: "${matchedText}"`;
    case 'confusable':
      return `These terms are commonly confused on exams. Make a comparison table. Matched: "${matchedText}"`;
    case 'negation':
      return `Negation trap - the question may test what NOT to do. Re-read slowly. Matched: "${matchedText}"`;
    case 'units':
      return `Unit conversion is a common error source. Double-check your math. Matched: "${matchedText}"`;
    case 'lookalike':
      return `Look-alike conditions! Focus on the KEY distinguishing feature. Matched: "${matchedText}"`;
    default:
      return `Potential trap detected: "${matchedText}"`;
  }
}

// ============================================================================
// DAT Signal Scoring
// ============================================================================

function computeDatSignal(card: KnowledgeCard, examType: ExamType): number {
  if (examType === 'GENERIC') return 0;

  const text = `${card.title} ${card.summary}`;
  let totalWeight = 0;

  for (const { pattern, weight } of EXAM_SIGNAL_PATTERNS) {
    if (pattern.test(text)) {
      totalWeight += weight;
    }
  }

  // Normalize to 0-100
  return Math.min(100, totalWeight);
}

// ============================================================================
// Differential Table Builder
// ============================================================================

function extractDifferentialPairs(text: string): string[] {
  const pairs: string[] = [];

  // Look for "A vs B" patterns
  const vsMatch = text.match(/(\w+(?:\s+\w+)?)\s+vs\.?\s+(\w+(?:\s+\w+)?)/i);
  if (vsMatch) {
    pairs.push(vsMatch[1].trim(), vsMatch[2].trim());
  }

  // Look for "distinguish X from Y" patterns
  const distinguishMatch = text.match(/distinguish\s+(\w+(?:\s+\w+)?)\s+from\s+(\w+(?:\s+\w+)?)/i);
  if (distinguishMatch) {
    pairs.push(distinguishMatch[1].trim(), distinguishMatch[2].trim());
  }

  return [...new Set(pairs)];
}

function buildDifferential(
  card: KnowledgeCard,
  neighbors: KnowledgeCard[]
): DifferentialTable {
  const mainConcept = card.title;
  const text = `${card.title} ${card.summary}`;

  // Extract comparison targets from the card itself
  const comparisons = extractDifferentialPairs(text);

  // Find neighbors that might be confounders
  const confounders = neighbors
    .filter(n => n.id !== card.id)
    .filter(n => {
      const nText = `${n.title} ${n.summary}`.toLowerCase();
      // Same kind of card
      if (n.kind === card.kind) return true;
      // Similar tags
      if (n.tags.some(t => card.tags.includes(t))) return true;
      // Mentioned in comparisons
      if (comparisons.some(c => nText.includes(c.toLowerCase()))) return true;
      return false;
    })
    .slice(0, 3);

  // Build columns
  const columns = [mainConcept, ...confounders.map(c => c.title)];

  // Common features to compare
  const features = [
    'Definition',
    'Key Finding',
    'Mechanism',
    'Treatment',
    'Differentiator',
  ];

  const rows = features.map(feature => {
    const columnValues: Record<string, string> = {};

    // Main card
    columnValues[mainConcept] = extractFeatureFromCard(card, feature);

    // Neighbors
    for (const neighbor of confounders) {
      columnValues[neighbor.title] = extractFeatureFromCard(neighbor, feature);
    }

    return { feature, columns: columnValues };
  });

  return {
    title: `${mainConcept} vs ${confounders.map(c => c.title).join(' vs ') || 'Similar Concepts'}`,
    rows,
    evidence: card.evidence,
  };
}

function extractFeatureFromCard(card: KnowledgeCard, feature: string): string {
  const text = `${card.title} ${card.summary}`;

  switch (feature) {
    case 'Definition':
      // Look for "is defined as" or first sentence
      const defMatch = text.match(/is\s+(defined\s+as|characterized\s+by)\s+([^.]+)/i);
      if (defMatch) return defMatch[2].trim().slice(0, 50);
      return text.split('.')[0]?.slice(0, 50) || '-';

    case 'Key Finding':
      const findingMatch = text.match(/(pathognomonic|hallmark|classic|characteristic)\s+([^.]+)/i);
      if (findingMatch) return findingMatch[2].trim().slice(0, 50);
      return '-';

    case 'Mechanism':
      const mechMatch = text.match(/(caused by|due to|mechanism|pathway)\s+([^.]+)/i);
      if (mechMatch) return mechMatch[2].trim().slice(0, 50);
      return '-';

    case 'Treatment':
      const txMatch = text.match(/(treatment|therapy|first[- ]line|management)\s+([^.]+)/i);
      if (txMatch) return txMatch[2].trim().slice(0, 50);
      return '-';

    case 'Differentiator':
      // What makes this unique
      const diffMatch = text.match(/(unlike|unlike|in contrast|differentiates?|distinguishes?)\s+([^.]+)/i);
      if (diffMatch) return diffMatch[2].trim().slice(0, 50);
      return '-';

    default:
      return '-';
  }
}

// ============================================================================
// Main Engine Export
// ============================================================================

export function scoreCard(
  card: KnowledgeCard,
  ctx: { examType: ExamType }
): { datSignal: number; traps: TrapSignal[] } {
  return {
    datSignal: computeDatSignal(card, ctx.examType),
    traps: detectTraps(card),
  };
}

export const datApexEngine: DatApexEngine = {
  scoreCard,
  buildDifferential,
};

export default datApexEngine;
