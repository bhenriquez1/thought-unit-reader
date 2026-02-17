// lib/page-intelligence/signals.ts
// Detect "signals" - patterns indicating high-yield exam content

import type { Signal, SignalType, Segment } from './types';
import { generateId } from './types';

// ============================================================================
// Signal Detection Patterns
// ============================================================================

interface SignalPattern {
  type: SignalType;
  patterns: RegExp[];
  label: string;
  baseScore: number;
}

const SIGNAL_PATTERNS: SignalPattern[] = [
  {
    type: 'definition',
    patterns: [
      /\b(is defined as|is\s+a|refers to|is called|is termed|means|defined by)\b/i,
      /\bthe definition of\b/i,
      /\bknown as\b/i,
    ],
    label: 'Definition',
    baseScore: 18,
  },
  {
    type: 'contrast',
    patterns: [
      /\b(whereas|however|in contrast|unlike|on the other hand|conversely|but)\b/i,
      /\b(different from|differs from|as opposed to)\b/i,
    ],
    label: 'Contrast',
    baseScore: 10,
  },
  {
    type: 'cause_effect',
    patterns: [
      /\b(leads to|results in|causes|due to|because of|resulting from)\b/i,
      /\b(contributes to|responsible for|triggers|produces|induces)\b/i,
      /\b(consequence of|effect of|outcome of)\b/i,
    ],
    label: 'Cause & Effect',
    baseScore: 16,
  },
  {
    type: 'list',
    patterns: [
      /\b(includes|consists of|comprises|characterized by|features)\b/i,
      /\b(the following|as follows|such as)\b/i,
    ],
    label: 'List/Classification',
    baseScore: 12,
  },
  {
    type: 'risk_factor',
    patterns: [
      /\b(risk factor|predisposes|associated with|increases risk)\b/i,
      /\b(susceptible to|prone to|likelihood of)\b/i,
      /\b(prevalence|incidence)\b/i,
    ],
    label: 'Risk Factor',
    baseScore: 14,
  },
  {
    type: 'diagnostic',
    patterns: [
      /\b(diagnos|clinical features|signs and symptoms|presentation)\b/i,
      /\b(finding|manifest|present with|indicates)\b/i,
      /\b(pathognomonic|hallmark|classic presentation)\b/i,
    ],
    label: 'Diagnostic',
    baseScore: 14,
  },
  {
    type: 'treatment',
    patterns: [
      /\b(treatment|management|therapy|indicated for|prescribe)\b/i,
      /\b(administer|dose|dosage|regimen)\b/i,
      /\b(first-line|gold standard|drug of choice)\b/i,
    ],
    label: 'Treatment',
    baseScore: 14,
  },
  {
    type: 'exception',
    patterns: [
      /\b(except|exception|contraindicated|should not|never)\b/i,
      /\b(avoid|caution|warning|adverse)\b/i,
      /\b(unless|only if|only when)\b/i,
    ],
    label: 'Exception/Caution',
    baseScore: 12,
  },
  {
    type: 'exam_keyword',
    patterns: [
      /\b(most common|primary|key|important|high-yield|classic|hallmark)\b/i,
      /\b(remember|note|major|main|essential|critical)\b/i,
      /\b(board|exam|test|question)\b/i,
    ],
    label: 'Exam Keyword',
    baseScore: 12,
  },
  {
    type: 'numbers_thresholds',
    patterns: [
      /\d+\s*(mg|ml|mm|cm|%|days|hours|weeks|months|years)/i,
      /\b(stage|grade|class|type)\s*[IVX\d]+/i,
      /[<>≤≥]\s*\d+/,
      /\d+\s*-\s*\d+\s*(mg|ml|mm|%)/i,
    ],
    label: 'Numbers/Thresholds',
    baseScore: 10,
  },
];

// ============================================================================
// Main Signal Detector
// ============================================================================

export interface DetectSignalsOptions {
  segments: Segment[];
  minScore?: number;
}

/**
 * Detect signals (clinical/exam patterns) in segments
 */
export function detectSignals(options: DetectSignalsOptions): Signal[] {
  const { segments, minScore = 0 } = options;
  const signals: Signal[] = [];
  const segmentSignals = new Map<string, Set<SignalType>>(); // Track unique signals per segment

  for (const segment of segments) {
    const text = segment.text;
    const segmentTypes = new Set<SignalType>();

    for (const pattern of SIGNAL_PATTERNS) {
      for (const regex of pattern.patterns) {
        if (regex.test(text)) {
          // Avoid duplicate signals of same type for same segment
          if (!segmentTypes.has(pattern.type)) {
            segmentTypes.add(pattern.type);

            // Calculate score with modifiers
            let score = pattern.baseScore;

            // Boost for longer evidence
            if (text.length > 200) score += 3;

            // Boost for heading proximity (previous segment is heading)
            const segIndex = segments.indexOf(segment);
            if (segIndex > 0 && segments[segIndex - 1].kind === 'heading') {
              score += 5;
            }

            if (score >= minScore) {
              signals.push({
                id: generateId('sig'),
                type: pattern.type,
                evidenceSegmentIds: [segment.id],
                score,
                label: pattern.label,
              });
            }
          }
          break; // Found a match for this pattern, move to next
        }
      }
    }

    if (segmentTypes.size > 0) {
      segmentSignals.set(segment.id, segmentTypes);
    }
  }

  return signals;
}

// ============================================================================
// Utility: Get signals by type
// ============================================================================

export function getSignalsByType(signals: Signal[], type: SignalType): Signal[] {
  return signals.filter(s => s.type === type);
}

// ============================================================================
// Utility: Get high-scoring signals
// ============================================================================

export function getHighScoringSignals(signals: Signal[], threshold: number = 14): Signal[] {
  return signals.filter(s => s.score >= threshold);
}

// ============================================================================
// Utility: Count signal types
// ============================================================================

export function countSignalTypes(signals: Signal[]): Map<SignalType, number> {
  const counts = new Map<SignalType, number>();
  for (const signal of signals) {
    counts.set(signal.type, (counts.get(signal.type) || 0) + 1);
  }
  return counts;
}

// ============================================================================
// Utility: Get total score from signals
// ============================================================================

export function getTotalSignalScore(signals: Signal[]): number {
  return signals.reduce((sum, s) => sum + s.score, 0);
}

// ============================================================================
// Utility: Match specific pattern in text (for ad-hoc detection)
// ============================================================================

export function matchPattern(text: string, type: SignalType): boolean {
  const pattern = SIGNAL_PATTERNS.find(p => p.type === type);
  if (!pattern) return false;
  return pattern.patterns.some(regex => regex.test(text));
}

// ============================================================================
// Export pattern definitions for testing
// ============================================================================

export { SIGNAL_PATTERNS };
