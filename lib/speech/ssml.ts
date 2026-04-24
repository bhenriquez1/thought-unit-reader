// lib/speech/ssml.ts
// Standalone SSML builder for Azure TTS.
// Converts raw paragraph text + VoiceProfile into a well-formed SSML string
// with Ninja Nerd cadence rules baked in.
//
// Cadence spec:
//   pauseShort = 180ms  — after commas, semicolons
//   pauseMid   = 320ms  — after sentence-ending periods
//   pauseLong  = 520ms  — after headings / "Key point:" / "Therefore"
//
// Emphasis tokens: must, key, therefore, contrast, classic, high-yield,
//   most common, gold standard, first-line, hallmark, pathognomonic
//
// Auto-pause at figures/math tokens (FIG, Fig., Table, Equation, ≈, ∫, Σ,
//   lim, d/dx): add pauseLong before the sentence + optional announce phrase.

import type { VoiceProfile } from './profiles';

// ============================================================================
// XML escaping
// ============================================================================

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ============================================================================
// Cadence timing helpers
// ============================================================================

/** Compute pause values scaled by a profile's pauseMultiplier */
function pauseMs(base: number, mult: number): number {
  return Math.round(base * mult);
}

// ============================================================================
// Insertion types
// ============================================================================

interface Insertion {
  atChar: number;
  markup: string;
  priority: number; // lower = inserted first when atChar ties
}

// ============================================================================
// Pattern sets
// ============================================================================

/** Tokens that trigger `<emphasis level="strong">` */
const EMPHASIS_STRONG_RE =
  /\b(must|must not|never|always|only|key|therefore|contrast|classic|high-yield|most common|gold standard|first-line|hallmark|pathognomonic|critical|important)\b/gi;

/** Tokens that trigger `<emphasis level="moderate">` */
const EMPHASIS_MODERATE_RE =
  /\b(however|whereas|unlike|in contrast|versus|vs\.?|leads to|causes|results in|because|thus)\b/gi;

/** Numeric thresholds trigger moderate emphasis */
const THRESHOLD_RE =
  /\b(\d+(?:\.\d+)?)\s*(mg|ml|mm|%|mmHg|kg|g\/dL|mEq|μg|IU|cm|units?)\b/gi;

/** Figure / math tokens that trigger auto-pause + optional announce */
const FIGURE_MATH_RE =
  /(\[FIG\]|Fig\.|Figure\s+\d|Table\s+\d|Equation\s+\d|\bEquation\b|\blim\b|d\/dx|[≈∫Σ])/g;

/** Heading-level phrases that trigger pauseLong before them */
const HEADING_PHRASE_RE =
  /(?:^|\n)(Key point:|Therefore[,:]|In summary[,:]|Clinical pearl:|Exam tip:|Remember:|Note:|Important:)/gim;

// ============================================================================
// Core builder
// ============================================================================

/**
 * Build an SSML document from raw text and a VoiceProfile.
 *
 * @param text         Paragraph text (plain, not pre-escaped)
 * @param profile      Voice profile driving rate, pauses, emphasis intensity
 * @param voiceName    Azure neural voice name (default: en-US-JennyNeural)
 * @param announceMedia  If true, speak "Pause — check the figure/equation."
 *                       before media tokens
 */
export function buildSSML(
  text: string,
  profile: VoiceProfile,
  voiceName = 'en-US-JennyNeural',
  announceMedia = false,
): string {
  const { speed, pauseMultiplier, emphasisIntensity } = profile;

  const pShort = pauseMs(180, pauseMultiplier);
  const pMid   = pauseMs(320, pauseMultiplier);
  const pLong  = pauseMs(520, pauseMultiplier);

  const insertions: Insertion[] = [];

  // ── 1. Punctuation pauses ──────────────────────────────────────────────
  // Commas and semicolons → pauseShort
  const punctShortRe = /[,;]/g;
  for (const m of text.matchAll(punctShortRe)) {
    insertions.push({
      atChar: m.index! + 1,           // insert AFTER the punctuation char
      markup: `<break time="${pShort}ms"/>`,
      priority: 0,
    });
  }

  // Sentence-ending periods → pauseMid (skip decimal numbers and abbreviations)
  const periodRe = /(?<![0-9A-Z])\.(?=\s|$)/g;
  for (const m of text.matchAll(periodRe)) {
    insertions.push({
      atChar: m.index! + 1,
      markup: `<break time="${pMid}ms"/>`,
      priority: 0,
    });
  }

  // Em-dash / en-dash → pauseShort
  const dashRe = /—|–/g;
  for (const m of text.matchAll(dashRe)) {
    insertions.push({
      atChar: m.index!,
      markup: `<break time="${pShort}ms"/>`,
      priority: 0,
    });
  }

  // ── 2. Heading-level phrases → pauseLong before ────────────────────────
  HEADING_PHRASE_RE.lastIndex = 0;
  for (const m of text.matchAll(HEADING_PHRASE_RE)) {
    // atChar points to start of the matched phrase (skip leading \n if any)
    const phraseStart = m.index! + (m[0].startsWith('\n') ? 1 : 0);
    insertions.push({
      atChar: phraseStart,
      markup: `<break time="${pLong}ms"/>`,
      priority: 0,
    });
  }

  // ── 3. Figure / math auto-pause ────────────────────────────────────────
  FIGURE_MATH_RE.lastIndex = 0;
  for (const m of text.matchAll(FIGURE_MATH_RE)) {
    const pre = `<break time="${pLong}ms"/>`;
    const announce = announceMedia
      ? `<break time="${pLong}ms"/><emphasis level="reduced">Pause — check the figure or equation.</emphasis><break time="${pLong}ms"/>`
      : pre;
    insertions.push({ atChar: m.index!, markup: announce, priority: 1 });
  }

  // ── 4. Emphasis — strong keywords ─────────────────────────────────────
  if (emphasisIntensity !== 'off') {
    const strongLevel = emphasisIntensity === 'high' ? 'strong' : 'moderate';
    const moderateLevel = emphasisIntensity === 'high' ? 'moderate' : 'reduced';

    EMPHASIS_STRONG_RE.lastIndex = 0;
    for (const m of text.matchAll(EMPHASIS_STRONG_RE)) {
      insertions.push({
        atChar: m.index!,
        markup: `<emphasis level="${strongLevel}">`,
        priority: 2,
      });
      insertions.push({
        atChar: m.index! + m[0].length,
        markup: '</emphasis>',
        priority: 4,
      });
    }

    EMPHASIS_MODERATE_RE.lastIndex = 0;
    for (const m of text.matchAll(EMPHASIS_MODERATE_RE)) {
      // Add a pre-pause before contrast/causal connectors
      insertions.push({
        atChar: m.index!,
        markup: `<break time="${pShort}ms"/><emphasis level="${moderateLevel}">`,
        priority: 2,
      });
      insertions.push({
        atChar: m.index! + m[0].length,
        markup: '</emphasis>',
        priority: 4,
      });
    }

    THRESHOLD_RE.lastIndex = 0;
    for (const m of text.matchAll(THRESHOLD_RE)) {
      insertions.push({ atChar: m.index!, markup: `<emphasis level="${moderateLevel}">`, priority: 2 });
      insertions.push({ atChar: m.index! + m[0].length, markup: '</emphasis>', priority: 4 });
    }
  }

  // ── 5. Merge insertions into body ──────────────────────────────────────
  insertions.sort((a, b) =>
    a.atChar !== b.atChar ? a.atChar - b.atChar : a.priority - b.priority
  );

  let body = '';
  let cursor = 0;
  for (const ins of insertions) {
    if (ins.atChar > cursor) {
      body += esc(text.slice(cursor, ins.atChar));
      cursor = ins.atChar;
    } else if (ins.atChar < cursor) {
      // Overlap — just emit markup without advancing cursor
      body += ins.markup;
      continue;
    }
    body += ins.markup;
  }
  if (cursor < text.length) {
    body += esc(text.slice(cursor));
  }

  // ── 6. Wrap in prosody + voice ─────────────────────────────────────────
  // Azure prosody rate: expressed as a percentage like "+10%" or "-8%", or as
  // keywords. We store speed as 0.75–1.35; map to percentage offset.
  const rateStr = speedToSSMLRate(speed);

  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
  <voice name="${esc(voiceName)}">
    <prosody rate="${rateStr}">
      ${body}
    </prosody>
  </voice>
</speak>`;
}

// ============================================================================
// Speed conversion
// ============================================================================

/**
 * Convert a numeric speed (0.75–1.35) to an SSML prosody rate string.
 * Azure supports: x-slow | slow | medium | fast | x-fast | "+N%" | "-N%"
 */
export function speedToSSMLRate(speed: number): string {
  // Express as integer percentage relative to default (1.0 = medium)
  const pct = Math.round((speed - 1.0) * 100);
  if (pct === 0) return 'medium';
  if (pct > 0) return `+${pct}%`;
  return `${pct}%`;   // already has the minus sign
}

// ============================================================================
// Plain-text + WebSpeech rate helper
// ============================================================================

/**
 * For WebSpeech fallback: return the rate multiplier directly.
 * WebSpeech SpeechSynthesisUtterance.rate accepts 0.1–10.
 */
export function speedToWebSpeechRate(speed: number): number {
  return Math.max(0.1, Math.min(10, speed));
}
