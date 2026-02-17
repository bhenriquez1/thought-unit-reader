// lib/page-intelligence/explain.ts
// Generate page-aware explanations with summaries, bullets, pitfalls, and mnemonics

import type { ExplainResult, Segment, Signal, Insight } from './types';

// ============================================================================
// Configuration
// ============================================================================

const MAX_SUMMARY_LENGTH = 300;
const MAX_BULLETS = 6;
const MAX_PITFALLS = 4;
const MAX_MNEMONICS = 2;

// ============================================================================
// Pitfall Detection Patterns
// ============================================================================

const PITFALL_PATTERNS = [
  {
    pattern: /\b(except|but not|excluding|does not include|not to be confused)\b/i,
    type: 'exception',
  },
  {
    pattern: /\b(common mistake|commonly confused|often mistaken|frequently misunderstood)\b/i,
    type: 'confusion',
  },
  {
    pattern: /\b(contraindicated|avoid|never|do not|should not)\b/i,
    type: 'contraindication',
  },
  {
    pattern: /\b(only if|only when|only in|exclusively)\b/i,
    type: 'condition',
  },
  {
    pattern: /\b(remember|note that|important to note|key point)\b/i,
    type: 'emphasis',
  },
  {
    pattern: /\b(unlike|in contrast to|different from|as opposed to)\b/i,
    type: 'contrast',
  },
];

// ============================================================================
// Mnemonic Generation Helpers
// ============================================================================

const MNEMONIC_TEMPLATES = [
  // For lists: take first letters
  (items: string[]) => {
    if (items.length < 3 || items.length > 8) return null;
    const letters = items.map(i => i.trim()[0]?.toUpperCase()).filter(Boolean);
    if (letters.length !== items.length) return null;
    const acronym = letters.join('');
    // Check if it's pronounceable (has vowels)
    if (!/[AEIOU]/.test(acronym)) return null;
    return `${acronym} = ${items.map((i, idx) => `${letters[idx]} (${i.split(' ')[0]})`).join(', ')}`;
  },
  // For definitions: create association
  (items: string[]) => {
    if (items.length !== 1) return null;
    const text = items[0];
    // Find a key term
    const match = text.match(/\b([A-Z][a-z]+)\s+(?:is|refers to|means)\b/);
    if (!match) return null;
    return `Think: "${match[1]}" sounds like...`;
  },
];

// ============================================================================
// Summary Generation
// ============================================================================

function generateSummary(segments: Segment[], insights: Insight[]): string {
  // Prioritize high-yield insights for summary
  const topInsights = insights
    .filter(i => i.score >= 60)
    .slice(0, 3);

  if (topInsights.length > 0) {
    // Build summary from top insights
    const summaryParts: string[] = [];
    for (const insight of topInsights) {
      // Extract first sentence of body
      const firstLine = insight.body.split('\n')[0]?.replace(/^[•\-]\s*/, '').trim();
      if (firstLine && firstLine.length > 20) {
        summaryParts.push(firstLine);
      }
    }
    if (summaryParts.length > 0) {
      const summary = summaryParts.join('. ');
      return summary.length > MAX_SUMMARY_LENGTH
        ? summary.slice(0, MAX_SUMMARY_LENGTH - 3) + '...'
        : summary;
    }
  }

  // Fallback: extract from segments
  const paragraphs = segments.filter(s => s.kind === 'paragraph');
  if (paragraphs.length === 0) {
    return 'No content available for this page.';
  }

  // Take first paragraph or heading + paragraph
  const headings = segments.filter(s => s.kind === 'heading');
  let summary = '';

  if (headings.length > 0) {
    summary = headings[0].text + ': ';
  }

  const firstPara = paragraphs[0].text;
  const sentences = firstPara.split(/[.!?]+/).filter(s => s.trim().length > 10);

  if (sentences.length > 0) {
    summary += sentences.slice(0, 2).join('. ').trim();
    if (!summary.endsWith('.')) summary += '.';
  }

  return summary.length > MAX_SUMMARY_LENGTH
    ? summary.slice(0, MAX_SUMMARY_LENGTH - 3) + '...'
    : summary;
}

// ============================================================================
// Bullet Generation
// ============================================================================

function generateBullets(segments: Segment[], signals: Signal[], insights: Insight[]): string[] {
  const bullets: string[] = [];
  const usedTexts = new Set<string>();

  // Extract key points from insights
  for (const insight of insights.slice(0, MAX_BULLETS)) {
    const lines = insight.body.split('\n');
    for (const line of lines) {
      const cleaned = line.replace(/^[•\-]\s*/, '').trim();
      if (cleaned.length > 20 && cleaned.length < 150 && !usedTexts.has(cleaned.toLowerCase())) {
        bullets.push(cleaned);
        usedTexts.add(cleaned.toLowerCase());
        if (bullets.length >= MAX_BULLETS) break;
      }
    }
    if (bullets.length >= MAX_BULLETS) break;
  }

  // If not enough bullets, extract from segments
  if (bullets.length < MAX_BULLETS) {
    const lists = segments.filter(s => s.kind === 'list');
    for (const list of lists) {
      const items = list.text.split('\n');
      for (const item of items) {
        const cleaned = item.replace(/^[•\-\d\.\)\(a-z]+\s*/i, '').trim();
        if (cleaned.length > 15 && cleaned.length < 150 && !usedTexts.has(cleaned.toLowerCase())) {
          bullets.push(cleaned);
          usedTexts.add(cleaned.toLowerCase());
          if (bullets.length >= MAX_BULLETS) break;
        }
      }
      if (bullets.length >= MAX_BULLETS) break;
    }
  }

  // Extract from signal-marked content
  if (bullets.length < MAX_BULLETS) {
    const segmentMap = new Map(segments.map(s => [s.id, s]));
    for (const signal of signals) {
      for (const segId of signal.evidenceSegmentIds) {
        const segment = segmentMap.get(segId);
        if (!segment) continue;

        const sentences = segment.text.split(/[.!?]+/).filter(s => s.trim().length > 20);
        for (const sentence of sentences) {
          const cleaned = sentence.trim();
          if (cleaned.length < 150 && !usedTexts.has(cleaned.toLowerCase())) {
            bullets.push(cleaned);
            usedTexts.add(cleaned.toLowerCase());
            if (bullets.length >= MAX_BULLETS) break;
          }
        }
        if (bullets.length >= MAX_BULLETS) break;
      }
      if (bullets.length >= MAX_BULLETS) break;
    }
  }

  return bullets;
}

// ============================================================================
// Pitfall Detection
// ============================================================================

function detectPitfalls(segments: Segment[], signals: Signal[]): string[] {
  const pitfalls: string[] = [];
  const usedTexts = new Set<string>();

  for (const segment of segments) {
    const text = segment.text;

    for (const { pattern, type } of PITFALL_PATTERNS) {
      if (pattern.test(text)) {
        // Extract the sentence containing the pitfall
        const sentences = text.split(/[.!?]+/);
        for (const sentence of sentences) {
          if (pattern.test(sentence)) {
            const cleaned = sentence.trim();
            if (cleaned.length > 20 && cleaned.length < 200 && !usedTexts.has(cleaned.toLowerCase())) {
              pitfalls.push(cleaned);
              usedTexts.add(cleaned.toLowerCase());
              if (pitfalls.length >= MAX_PITFALLS) return pitfalls;
            }
          }
        }
      }
    }
  }

  // Also check exception signals
  const exceptionSignals = signals.filter(s => s.type === 'exception' || s.type === 'contrast');
  if (pitfalls.length < MAX_PITFALLS) {
    const segmentMap = new Map(segments.map(s => [s.id, s]));
    for (const signal of exceptionSignals) {
      for (const segId of signal.evidenceSegmentIds) {
        const segment = segmentMap.get(segId);
        if (!segment) continue;

        const sentences = segment.text.split(/[.!?]+/);
        for (const sentence of sentences) {
          const cleaned = sentence.trim();
          if (cleaned.length > 20 && cleaned.length < 200 && !usedTexts.has(cleaned.toLowerCase())) {
            pitfalls.push(`⚠️ ${cleaned}`);
            usedTexts.add(cleaned.toLowerCase());
            if (pitfalls.length >= MAX_PITFALLS) return pitfalls;
          }
        }
      }
    }
  }

  return pitfalls;
}

// ============================================================================
// Mnemonic Generation
// ============================================================================

function generateMnemonics(segments: Segment[], signals: Signal[]): string[] {
  const mnemonics: string[] = [];

  // Look for lists that could become mnemonics
  const lists = segments.filter(s => s.kind === 'list');

  for (const list of lists) {
    const items = list.text
      .split('\n')
      .map(item => item.replace(/^[•\-\d\.\)\(a-z]+\s*/i, '').trim())
      .filter(item => item.length > 2 && item.length < 50);

    if (items.length >= 3 && items.length <= 8) {
      // Try to create an acronym
      const firstLetters = items.map(i => i[0].toUpperCase());
      const acronym = firstLetters.join('');

      // Check if it's somewhat memorable
      const hasVowels = /[AEIOU]/.test(acronym);
      const isShort = acronym.length <= 6;

      if (hasVowels && isShort) {
        mnemonics.push(`Remember "${acronym}": ${items.slice(0, 4).join(', ')}`);
        if (mnemonics.length >= MAX_MNEMONICS) break;
      }
    }
  }

  // Look for definition signals that could have mnemonics
  if (mnemonics.length < MAX_MNEMONICS) {
    const defSignals = signals.filter(s => s.type === 'definition');
    const segmentMap = new Map(segments.map(s => [s.id, s]));

    for (const signal of defSignals) {
      for (const segId of signal.evidenceSegmentIds) {
        const segment = segmentMap.get(segId);
        if (!segment) continue;

        // Try to extract a memorable association
        const match = segment.text.match(/\b([A-Z][a-z]{3,})\s+(?:is|are|refers to)/);
        if (match) {
          const term = match[1];
          // Create a simple association hint
          mnemonics.push(`"${term}" - think of the root meaning`);
          if (mnemonics.length >= MAX_MNEMONICS) break;
        }
      }
      if (mnemonics.length >= MAX_MNEMONICS) break;
    }
  }

  return mnemonics;
}

// ============================================================================
// Main Explain Generator
// ============================================================================

export interface GenerateExplainOptions {
  segments: Segment[];
  signals: Signal[];
  insights: Insight[];
}

/**
 * Generate a page-aware explanation
 */
export function generateExplain(options: GenerateExplainOptions): ExplainResult {
  const { segments, signals, insights } = options;

  const summary = generateSummary(segments, insights);
  const bullets = generateBullets(segments, signals, insights);
  const pitfalls = detectPitfalls(segments, signals);
  const mnemonics = generateMnemonics(segments, signals);

  return {
    summary,
    bullets,
    pitfalls,
    mnemonics: mnemonics.length > 0 ? mnemonics : undefined,
  };
}

// ============================================================================
// Utility: Generate explain for selected text
// ============================================================================

export function generateExplainForSelection(text: string): ExplainResult {
  // Quick explain for user-selected text
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);

  const summary = sentences.slice(0, 2).join('. ').trim();
  const bullets = sentences.slice(2, 6).map(s => s.trim());

  // Check for pitfalls in selection
  const pitfalls: string[] = [];
  for (const { pattern } of PITFALL_PATTERNS) {
    if (pattern.test(text)) {
      for (const sentence of sentences) {
        if (pattern.test(sentence)) {
          pitfalls.push(`⚠️ ${sentence.trim()}`);
          if (pitfalls.length >= 2) break;
        }
      }
      if (pitfalls.length >= 2) break;
    }
  }

  return {
    summary: summary || text.slice(0, MAX_SUMMARY_LENGTH),
    bullets,
    pitfalls,
  };
}

// ============================================================================
// Export pitfall patterns for testing
// ============================================================================

export { PITFALL_PATTERNS };
