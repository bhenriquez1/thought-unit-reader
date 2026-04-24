// lib/speech/narrationPlan.ts
// Ninja Nerd Narration Cadence System
// Converts a ParagraphUnit into a NarrationPlan with precise timing cues.
// Fully deterministic — no LLM, works offline.

import type { ParagraphUnit } from '@/lib/page-intelligence/types';

// ============================================================================
// Types
// ============================================================================

export type NarrationCueType =
  | 'pause'     // insert silence
  | 'rate'      // change speaking rate
  | 'pitch'     // change pitch
  | 'emphasis'  // stress a span
  | 'boundary'  // segment boundary (sentence / heading)
  | 'section';  // major section start

export type EmphasisLevel = 'low' | 'medium' | 'high';

export type NarrationLabel =
  | 'definition'
  | 'mechanism'
  | 'exam_tip'
  | 'warning'
  | 'clinical'
  | 'formula'
  | 'threshold';

export interface NarrationCue {
  /** Cue type */
  t: NarrationCueType;
  /** Character offset in paragraph text where cue fires (0-based) */
  atChar?: number;
  /** Pause duration in milliseconds */
  ms?: number;
  /** Rate multiplier (for 'rate' cues): 0.7–1.3 */
  value?: number | EmphasisLevel;
  /** Semantic label — drives voice style in SSML providers */
  label?: NarrationLabel;
}

export interface WordBoundary {
  word: string;
  startChar: number;
  endChar: number;
}

export interface NarrationPlan {
  paragraphId: string;
  role: ParagraphUnit['role'];
  text: string;
  /** Base speaking rate for the whole paragraph */
  baseRate: number;
  /** Base pitch offset (-2..+2 semitones, 0 = neutral) */
  basePitch: number;
  /** Ordered cues (sorted by atChar) */
  cues: NarrationCue[];
  /** Word-level boundaries for click-to-start and highlight sync */
  wordBoundaries: WordBoundary[];
}

// ============================================================================
// Base rates by paragraph role
// ============================================================================

const BASE_RATE: Record<ParagraphUnit['role'], number> = {
  definition: 0.92,
  mechanism:  0.95,
  clinical:   1.00,
  example:    1.00,
  step:       0.95,
  warning:    0.90,
  exam_trap:  0.90,
  formula:    0.88,
  summary:    0.98,
};

const BASE_PITCH: Record<ParagraphUnit['role'], number> = {
  definition: 0,
  mechanism:  0,
  clinical:   0,
  example:    0.5,
  step:       0,
  warning:    -1.0,
  exam_trap:  -0.8,
  formula:    -0.5,
  summary:    0,
};

// ============================================================================
// Punctuation pause table (ms)
// ============================================================================

const PUNCT_PAUSE: { re: RegExp; ms: number; label?: string }[] = [
  { re: /[,]/g,              ms: 120 },
  { re: /[;]/g,              ms: 180 },
  { re: /[.!?](?:\s|$)/g,   ms: 250 },
  { re: /[:]/g,              ms: 150 },
  { re: /[()[\]{}]/g,        ms: 140 },
  { re: /—|–/g,              ms: 180 },
  { re: /\n/g,               ms: 300 },
];

// ============================================================================
// Emphasis patterns — key terms, thresholds, negations, comparisons
// ============================================================================

const EMPHASIS_HIGH: RegExp[] = [
  /\b(\d+(?:\.\d+)?)\s*(mg|ml|mm|%|mmHg|kg|g\/dL|mEq|μg|IU)\b/gi,  // thresholds
  /\b(not|never|do not|except|only|always|must not|contraindicated)\b/gi, // negations
  /\b(most common|gold standard|first-line|hallmark|pathognomonic|classic|key|critical|important)\b/gi, // exam keywords
  /\b(diagnos|treatment|therapy|management)\b/gi,                    // clinical pivots
];

const EMPHASIS_MEDIUM: RegExp[] = [
  /\b(vs\.?|versus|compared|unlike|whereas|however|in contrast)\b/gi, // comparisons
  /\b(leads to|causes|results in|because|therefore|thus)\b/gi,       // causal
  /\b(stage [IVX\d]|grade [IVX\d]|class [IVX\d])\b/gi,             // classifications
];

// Slow-rate spans around formulas / equations
const FORMULA_SPAN_RE = /[A-Z]\s*=\s*[A-Za-z0-9\s+\-*/^()]+/g;
const VARIABLE_RE = /\b[A-Z]\b(?!\s*[a-z])/g;

// Definition trigger
const DEF_AFTER_RE = /(?:is defined as|refers to|is termed|is called|means that|known as)\s+/gi;

// ============================================================================
// Word boundary extractor
// ============================================================================

export function extractWordBoundaries(text: string): WordBoundary[] {
  const boundaries: WordBoundary[] = [];
  // Match word tokens — include contractions and hyphenated words
  const re = /\b[\w'-]+\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    boundaries.push({
      word: m[0],
      startChar: m.index,
      endChar: m.index + m[0].length,
    });
  }
  return boundaries;
}

// ============================================================================
// Cue generators
// ============================================================================

function punctuationCues(text: string): NarrationCue[] {
  const cues: NarrationCue[] = [];
  for (const { re, ms } of PUNCT_PAUSE) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      cues.push({ t: 'pause', atChar: m.index, ms });
    }
  }
  return cues;
}

function emphasisCues(text: string): NarrationCue[] {
  const cues: NarrationCue[] = [];

  for (const re of EMPHASIS_HIGH) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      cues.push({ t: 'emphasis', atChar: m.index, value: 'high' });
    }
  }

  for (const re of EMPHASIS_MEDIUM) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      // Add a small pre-pause before contrast words
      if (m[0].match(/\b(vs\.?|versus|however|whereas|unlike|in contrast)\b/i)) {
        cues.push({ t: 'pause', atChar: Math.max(0, m.index - 1), ms: 150 });
      }
      cues.push({ t: 'emphasis', atChar: m.index, value: 'medium' });
    }
  }

  return cues;
}

function formulaCues(text: string, role: ParagraphUnit['role']): NarrationCue[] {
  if (role !== 'formula' && !/[=+\-×÷^√∑∫π]/.test(text)) return [];

  const cues: NarrationCue[] = [];

  // Slow down for formula spans
  FORMULA_SPAN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FORMULA_SPAN_RE.exec(text)) !== null) {
    cues.push({ t: 'rate', atChar: m.index, value: 0.82 });
    // Pause before and after
    cues.push({ t: 'pause', atChar: m.index, ms: 200 });
    cues.push({ t: 'pause', atChar: m.index + m[0].length, ms: 200 });
  }

  // Emphasize single variables
  VARIABLE_RE.lastIndex = 0;
  while ((m = VARIABLE_RE.exec(text)) !== null) {
    cues.push({ t: 'emphasis', atChar: m.index, value: 'medium' });
  }

  return cues;
}

function definitionCues(text: string): NarrationCue[] {
  const cues: NarrationCue[] = [];
  DEF_AFTER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DEF_AFTER_RE.exec(text)) !== null) {
    // Long pause after the definition trigger phrase
    cues.push({ t: 'pause', atChar: m.index + m[0].length, ms: 350, label: 'definition' });
    // Slow rate for what follows
    cues.push({ t: 'rate', atChar: m.index + m[0].length, value: 0.88 });
  }
  return cues;
}

function examTrapCues(text: string, role: ParagraphUnit['role']): NarrationCue[] {
  if (role !== 'exam_trap') return [];
  const cues: NarrationCue[] = [];

  // Long dramatic pause before exam trap content begins
  cues.push({ t: 'pause', atChar: 0, ms: 400, label: 'exam_tip' });
  cues.push({ t: 'pitch', atChar: 0, value: -1.0 });

  // Emphasize "except", "not", "unlike", etc.
  const trapTriggers = /\b(except|not|never|unlike|in contrast|beware|do not|however)\b/gi;
  trapTriggers.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = trapTriggers.exec(text)) !== null) {
    cues.push({ t: 'pause', atChar: Math.max(0, m.index - 1), ms: 200 });
    cues.push({ t: 'emphasis', atChar: m.index, value: 'high', label: 'exam_tip' });
  }

  return cues;
}

function keyTermCues(text: string, keyTerms: string[]): NarrationCue[] {
  const cues: NarrationCue[] = [];
  for (const term of keyTerms) {
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      cues.push({ t: 'emphasis', atChar: m.index, value: 'high' });
    }
  }
  return cues;
}

// ============================================================================
// Main builder
// ============================================================================

/**
 * Build a NarrationPlan for a single ParagraphUnit.
 * All cues are character-offset-indexed into the paragraph text.
 */
export function buildNarrationPlan(unit: ParagraphUnit): NarrationPlan {
  const { id, role, text, keyTerms = [] } = unit;
  const baseRate = BASE_RATE[role] ?? 1.0;
  const basePitch = BASE_PITCH[role] ?? 0;

  const allCues: NarrationCue[] = [
    ...punctuationCues(text),
    ...emphasisCues(text),
    ...formulaCues(text, role),
    ...definitionCues(text),
    ...examTrapCues(text, role),
    ...keyTermCues(text, keyTerms),
  ];

  // Sort by atChar (undefined → 0), then by type priority
  const TYPE_ORDER: Record<NarrationCueType, number> = {
    section: 0, boundary: 1, pause: 2, rate: 3, pitch: 4, emphasis: 5,
  };
  allCues.sort((a, b) => {
    const ca = a.atChar ?? 0;
    const cb = b.atChar ?? 0;
    if (ca !== cb) return ca - cb;
    return (TYPE_ORDER[a.t] ?? 5) - (TYPE_ORDER[b.t] ?? 5);
  });

  // Deduplicate: only one 'pause' per atChar (keep longest)
  const deduped: NarrationCue[] = [];
  const pauseByChar = new Map<number, number>(); // char → max ms
  for (const cue of allCues) {
    if (cue.t === 'pause' && cue.atChar !== undefined) {
      const prev = pauseByChar.get(cue.atChar) ?? 0;
      pauseByChar.set(cue.atChar, Math.max(prev, cue.ms ?? 0));
    } else {
      deduped.push(cue);
    }
  }
  for (const [atChar, ms] of pauseByChar) {
    deduped.push({ t: 'pause', atChar, ms });
  }
  deduped.sort((a, b) => (a.atChar ?? 0) - (b.atChar ?? 0));

  const wordBoundaries = extractWordBoundaries(text);

  return {
    paragraphId: id,
    role,
    text,
    baseRate,
    basePitch,
    cues: deduped,
    wordBoundaries,
  };
}

/**
 * Build narration plans for an entire page's paragraph units.
 */
export function buildPageNarrationPlans(units: ParagraphUnit[]): NarrationPlan[] {
  return units.map(buildNarrationPlan);
}

/**
 * Find the nearest word boundary to a given character offset.
 * Used for click-to-start: maps a clicked character position to the
 * correct word start so narration begins at the right place.
 */
export function findNearestWordStart(
  wordBoundaries: WordBoundary[],
  charIndex: number,
): number {
  if (wordBoundaries.length === 0) return charIndex;

  let best = wordBoundaries[0];
  let bestDist = Math.abs(wordBoundaries[0].startChar - charIndex);

  for (const wb of wordBoundaries) {
    const dist = Math.abs(wb.startChar - charIndex);
    if (dist < bestDist) {
      bestDist = dist;
      best = wb;
    }
  }

  return best.startChar;
}

/**
 * Get the active word boundary for a given absolute char position
 * (used for real-time word highlight while speaking).
 */
export function getActiveWord(
  wordBoundaries: WordBoundary[],
  charIndex: number,
): WordBoundary | null {
  for (const wb of wordBoundaries) {
    if (wb.startChar <= charIndex && wb.endChar > charIndex) return wb;
  }
  return null;
}
