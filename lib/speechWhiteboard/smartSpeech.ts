// lib/speechWhiteboard/smartSpeech.ts
// Smart Speech - High-Yield Reading Modes

import type { RankedInsight, ImportanceBucket } from '@/lib/relationshipSchema/types';

// ============================================================================
// Types
// ============================================================================

export type SpeechMode =
  | 'full'           // Read everything
  | 'smart_high_yield' // All CRITICAL + top 5 HIGH_YIELD (default)
  | 'exam_rapid'     // Only CRITICAL, faster pace
  | 'explain';       // Detailed with pauses for whiteboard

export type SpeechSpeed = 'slow' | 'normal' | 'fast' | 'very_fast';

export interface SpeechConfig {
  mode: SpeechMode;
  speed: SpeechSpeed;
  autoExplain: boolean;  // Open whiteboard after reading
  pauseOnFigures: boolean;
  pauseOnTables: boolean;
  pauseOnEquations: boolean;
}

export interface SpeechState {
  isPlaying: boolean;
  isPaused: boolean;
  currentInsightId?: string;
  currentInsightIndex: number;
  totalInsights: number;
  pauseReason?: 'figure' | 'table' | 'equation' | 'user' | 'end';
}

export interface SpeechScript {
  insightId: string;
  segments: SpeechSegment[];
  totalDurationMs: number;
}

export interface SpeechSegment {
  type: 'title' | 'claim' | 'why_it_matters' | 'key_cue' | 'trap' | 'pause' | 'transition';
  text: string;
  durationMs: number;
  emphasis?: 'normal' | 'strong' | 'whisper';
}

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_SPEECH_CONFIG: SpeechConfig = {
  mode: 'smart_high_yield',
  speed: 'normal',
  autoExplain: false,
  pauseOnFigures: true,
  pauseOnTables: true,
  pauseOnEquations: true,
};

const SPEED_MULTIPLIERS: Record<SpeechSpeed, number> = {
  slow: 1.5,
  normal: 1.0,
  fast: 0.75,
  very_fast: 0.5,
};

const BASE_PAUSE_MS = 800;

// Patterns for pause triggers
const FIGURE_PATTERN = /\b(figure\s*\d+|fig\.?\s*\d+)\b/gi;
const TABLE_PATTERN = /\b(table\s*\d+|tbl\.?\s*\d+)\b/gi;
const EQUATION_PATTERN = /[=+\-*/^]|[\d]+\s*[×÷]|mol\/l|mg\/dl/gi;

// ============================================================================
// Selection Logic
// ============================================================================

/**
 * Select insights to read based on mode
 */
export function selectInsightsForMode(
  insights: RankedInsight[],
  mode: SpeechMode
): RankedInsight[] {
  switch (mode) {
    case 'full':
      return insights;

    case 'smart_high_yield': {
      // All CRITICAL + top 5 HIGH_YIELD
      const critical = insights.filter(i => i.bucket === 'CRITICAL');
      const highYield = insights
        .filter(i => i.bucket === 'HIGH_YIELD')
        .slice(0, 5);
      return [...critical, ...highYield];
    }

    case 'exam_rapid':
      // Only CRITICAL
      return insights.filter(i => i.bucket === 'CRITICAL');

    case 'explain':
      // Top 3 most important (for detailed explanation)
      return insights.slice(0, 3);

    default:
      return insights;
  }
}

/**
 * Check if text contains pause triggers
 */
export function detectPauseTriggers(
  text: string,
  config: SpeechConfig
): { shouldPause: boolean; reason?: 'figure' | 'table' | 'equation' } {
  if (config.pauseOnFigures && FIGURE_PATTERN.test(text)) {
    return { shouldPause: true, reason: 'figure' };
  }
  if (config.pauseOnTables && TABLE_PATTERN.test(text)) {
    return { shouldPause: true, reason: 'table' };
  }
  if (config.pauseOnEquations) {
    // Check for high density of math symbols
    const matches = text.match(EQUATION_PATTERN) || [];
    if (matches.length >= 2) {
      return { shouldPause: true, reason: 'equation' };
    }
  }
  return { shouldPause: false };
}

// ============================================================================
// Script Generation
// ============================================================================

/**
 * Generate speech script for a single insight
 */
export function generateInsightScript(
  insight: RankedInsight,
  mode: SpeechMode,
  speed: SpeechSpeed
): SpeechScript {
  const segments: SpeechSegment[] = [];
  const speedMultiplier = SPEED_MULTIPLIERS[speed];

  // Intro based on bucket
  const bucketIntro = getBucketIntro(insight.bucket);
  if (bucketIntro) {
    segments.push({
      type: 'title',
      text: bucketIntro,
      durationMs: 500 * speedMultiplier,
      emphasis: insight.bucket === 'CRITICAL' ? 'strong' : 'normal',
    });
  }

  // Title
  segments.push({
    type: 'title',
    text: insight.title,
    durationMs: estimateDuration(insight.title) * speedMultiplier,
    emphasis: 'normal',
  });

  // Claim
  segments.push({
    type: 'claim',
    text: insight.claim,
    durationMs: estimateDuration(insight.claim) * speedMultiplier,
    emphasis: 'normal',
  });

  // Pause after claim
  segments.push({
    type: 'pause',
    text: '',
    durationMs: BASE_PAUSE_MS * speedMultiplier * 0.5,
  });

  // Why it matters
  segments.push({
    type: 'why_it_matters',
    text: `Why it matters: ${insight.whyItMatters}`,
    durationMs: estimateDuration(insight.whyItMatters) * speedMultiplier,
    emphasis: 'normal',
  });

  // Key cue (if present)
  if (insight.keyCue) {
    segments.push({
      type: 'key_cue',
      text: `Key cue: ${insight.keyCue}`,
      durationMs: estimateDuration(insight.keyCue) * speedMultiplier,
      emphasis: 'strong',
    });
  }

  // Trap (if present and not in rapid mode)
  if (insight.trap && mode !== 'exam_rapid') {
    segments.push({
      type: 'trap',
      text: `Watch out: ${insight.trap}`,
      durationMs: estimateDuration(insight.trap) * speedMultiplier,
      emphasis: 'whisper',
    });
  }

  // End pause
  segments.push({
    type: 'pause',
    text: '',
    durationMs: BASE_PAUSE_MS * speedMultiplier,
  });

  // Calculate total duration
  const totalDurationMs = segments.reduce((sum, seg) => sum + seg.durationMs, 0);

  return {
    insightId: insight.id,
    segments,
    totalDurationMs,
  };
}

/**
 * Generate full playlist script
 */
export function generatePlaylistScript(
  insights: RankedInsight[],
  config: SpeechConfig
): SpeechScript[] {
  const selected = selectInsightsForMode(insights, config.mode);
  return selected.map(insight => generateInsightScript(insight, config.mode, config.speed));
}

/**
 * Get intro text based on bucket
 */
function getBucketIntro(bucket: ImportanceBucket): string {
  switch (bucket) {
    case 'CRITICAL':
      return 'Critical point:';
    case 'HIGH_YIELD':
      return 'High-yield point:';
    case 'IMPORTANT':
      return 'Important:';
    default:
      return '';
  }
}

/**
 * Estimate speech duration in ms (rough: ~150 words/min)
 */
function estimateDuration(text: string): number {
  const wordCount = text.split(/\s+/).length;
  const wordsPerMinute = 150;
  const msPerWord = 60000 / wordsPerMinute;
  return Math.round(wordCount * msPerWord);
}

// ============================================================================
// Text-to-Speech Integration
// ============================================================================

/**
 * Convert script to SSML for better TTS output
 */
export function scriptToSSML(script: SpeechScript): string {
  const ssmlParts: string[] = ['<speak>'];

  for (const segment of script.segments) {
    switch (segment.type) {
      case 'pause':
        ssmlParts.push(`<break time="${Math.round(segment.durationMs)}ms"/>`);
        break;

      case 'title':
        if (segment.emphasis === 'strong') {
          ssmlParts.push(`<emphasis level="strong">${escapeXml(segment.text)}</emphasis>`);
        } else {
          ssmlParts.push(escapeXml(segment.text));
        }
        break;

      case 'trap':
        // Slower and softer for traps
        ssmlParts.push(`<prosody rate="slow" volume="soft">${escapeXml(segment.text)}</prosody>`);
        break;

      case 'key_cue':
        // Emphasize key cues
        ssmlParts.push(`<emphasis level="moderate">${escapeXml(segment.text)}</emphasis>`);
        break;

      default:
        ssmlParts.push(escapeXml(segment.text));
    }
  }

  ssmlParts.push('</speak>');
  return ssmlParts.join('\n');
}

/**
 * Convert script to plain text for Web Speech API
 */
export function scriptToPlainText(script: SpeechScript): string {
  return script.segments
    .filter(seg => seg.type !== 'pause')
    .map(seg => seg.text)
    .join('. ');
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ============================================================================
// Web Speech API Helpers
// ============================================================================

/**
 * Check if Web Speech API is available
 */
export function isWebSpeechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Get available voices
 */
export function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (!isWebSpeechAvailable()) return [];
  return speechSynthesis.getVoices();
}

/**
 * Speak text using Web Speech API
 */
export function speakText(
  text: string,
  options: {
    rate?: number;
    pitch?: number;
    voice?: SpeechSynthesisVoice;
    onEnd?: () => void;
    onPause?: () => void;
    onResume?: () => void;
    onError?: (error: SpeechSynthesisErrorEvent) => void;
  } = {}
): SpeechSynthesisUtterance | null {
  if (!isWebSpeechAvailable()) return null;

  const utterance = new SpeechSynthesisUtterance(text);

  if (options.rate) utterance.rate = options.rate;
  if (options.pitch) utterance.pitch = options.pitch;
  if (options.voice) utterance.voice = options.voice;

  if (options.onEnd) utterance.onend = options.onEnd;
  if (options.onPause) utterance.onpause = options.onPause;
  if (options.onResume) utterance.onresume = options.onResume;
  if (options.onError) utterance.onerror = options.onError;

  speechSynthesis.speak(utterance);
  return utterance;
}

/**
 * Stop all speech
 */
export function stopSpeech(): void {
  if (isWebSpeechAvailable()) {
    speechSynthesis.cancel();
  }
}

/**
 * Pause speech
 */
export function pauseSpeech(): void {
  if (isWebSpeechAvailable()) {
    speechSynthesis.pause();
  }
}

/**
 * Resume speech
 */
export function resumeSpeech(): void {
  if (isWebSpeechAvailable()) {
    speechSynthesis.resume();
  }
}

// ============================================================================
// Speed Rate Mapping
// ============================================================================

export function getWebSpeechRate(speed: SpeechSpeed): number {
  switch (speed) {
    case 'slow':
      return 0.8;
    case 'normal':
      return 1.0;
    case 'fast':
      return 1.3;
    case 'very_fast':
      return 1.6;
    default:
      return 1.0;
  }
}

export default {
  DEFAULT_SPEECH_CONFIG,
  selectInsightsForMode,
  detectPauseTriggers,
  generateInsightScript,
  generatePlaylistScript,
  scriptToSSML,
  scriptToPlainText,
  isWebSpeechAvailable,
  speakText,
  stopSpeech,
  pauseSpeech,
  resumeSpeech,
  getWebSpeechRate,
};
