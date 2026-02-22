// lib/speech/providers/elevenlabs.ts
// ElevenLabs TTS Provider (Tier A)
// Encodes NarrationPlan cues into ElevenLabs voice settings + text normalization.
// Uses ElevenLabs streaming API (/v1/text-to-speech/:voiceId/stream).
// Word-level boundaries are approximated via local token timing since ElevenLabs
// doesn't expose sentence-level timestamps in the basic API.

import type { NarrationPlan, WordBoundary } from '../narrationPlan';

// ============================================================================
// Types
// ============================================================================

export interface ElevenLabsOptions {
  apiKey: string;
  voiceId: string;
  /** ElevenLabs model — defaults to 'eleven_turbo_v2' for latency */
  modelId?: string;
  /** Ninja Nerd cadence: true = apply rate/pause transforms */
  cadenceEnabled?: boolean;
  /** Global rate multiplier (1.0 = no change) */
  rateMultiplier?: number;
  /** Called with each audio chunk (Uint8Array, mp3) */
  onAudioChunk: (chunk: Uint8Array) => void;
  /** Called with estimated word boundary events (approximate) */
  onWordBoundary?: (wb: WordBoundary, charOffset: number) => void;
  /** Called when stream is complete */
  onEnd?: () => void;
  /** Called on error */
  onError?: (err: Error) => void;
}

// ============================================================================
// SSML-like text normalization for ElevenLabs
// ElevenLabs doesn't use SSML, but we can:
//  1. Insert explicit "..." or "[pause]"-style text to add breaths
//  2. Use voice_settings stability/similarity to shape delivery
//  3. Apply text transformations: spell out abbreviations, etc.
// ============================================================================

/**
 * Insert pause markers as "..." into text based on NarrationPlan cues.
 * ElevenLabs interprets "..." as a natural pause.
 */
function insertPauseMarkers(text: string, plan: NarrationPlan, cadenceEnabled: boolean): string {
  if (!cadenceEnabled) return text;

  const pauseCues = plan.cues
    .filter(c => c.t === 'pause' && c.atChar !== undefined && (c.ms ?? 0) >= 200)
    .sort((a, b) => (b.atChar ?? 0) - (a.atChar ?? 0)); // reverse order for safe insertion

  let result = text;
  for (const cue of pauseCues) {
    const at = cue.atChar!;
    const ms = cue.ms ?? 250;

    // Map pause duration to ellipsis count
    const dots = ms >= 400 ? '... ' : ms >= 250 ? '.. ' : '. ';

    // Insert after the current character (and any immediate punctuation)
    // Avoid double-inserting near existing punctuation
    const nearby = result.slice(Math.max(0, at - 1), at + 2);
    if (/[.,;!?]/.test(nearby)) continue; // already has punctuation

    result = result.slice(0, at) + dots + result.slice(at);
  }

  return result;
}

/**
 * Normalize text for ElevenLabs:
 * - Spell out common medical abbreviations
 * - Handle numbers (e.g., "12 mg" → "12 milligrams")
 * - Remove markdown/formatting characters
 */
function normalizeText(text: string): string {
  return text
    // Spell out common abbreviations for better pronunciation
    .replace(/\bmg\b/g, 'milligrams')
    .replace(/\bml\b/g, 'milliliters')
    .replace(/\bmmHg\b/g, 'millimeters of mercury')
    .replace(/\bdL\b/g, 'deciliters')
    .replace(/\bμg\b/g, 'micrograms')
    .replace(/\bBID\b/gi, 'twice daily')
    .replace(/\bTID\b/gi, 'three times daily')
    .replace(/\bQID\b/gi, 'four times daily')
    .replace(/\bPRN\b/gi, 'as needed')
    .replace(/\bSQ\b/gi, 'subcutaneous')
    .replace(/\bIV\b/g, 'intravenous')
    .replace(/\bCAL\b/g, 'clinical attachment level')
    .replace(/\bPPD\b/g, 'probing pocket depth')
    .replace(/\bBOP\b/g, 'bleeding on probing')
    .replace(/\bSCC\b/g, 'squamous cell carcinoma')
    // Expand "vs" so it's spoken naturally
    .replace(/\bvs\.\b/g, 'versus')
    // Remove markdown-style characters
    .replace(/[*_`#]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================================
// Voice settings by role
// ============================================================================

interface VoiceSettings {
  stability: number;       // 0..1 — higher = more consistent, less expressive
  similarity_boost: number; // 0..1 — higher = closer to voice character
  style?: number;          // 0..1 — ElevenLabs style exaggeration
  use_speaker_boost?: boolean;
}

function voiceSettingsForRole(role: NarrationPlan['role']): VoiceSettings {
  switch (role) {
    case 'exam_trap':
    case 'warning':
      return { stability: 0.45, similarity_boost: 0.80, style: 0.35, use_speaker_boost: true };
    case 'definition':
      return { stability: 0.60, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true };
    case 'formula':
      return { stability: 0.70, similarity_boost: 0.75, style: 0.05 };
    case 'clinical':
      return { stability: 0.50, similarity_boost: 0.80, style: 0.25, use_speaker_boost: true };
    case 'mechanism':
      return { stability: 0.55, similarity_boost: 0.78, style: 0.20, use_speaker_boost: true };
    default:
      return { stability: 0.55, similarity_boost: 0.75, style: 0.15 };
  }
}

// ============================================================================
// Word boundary approximation
// ============================================================================

/**
 * Given the planned text and word boundaries, emit approximate boundary events
 * based on estimated speech rate (chars/sec). Used when the provider doesn't
 * supply real-time timing.
 */
export function scheduleApproximateWordEvents(
  plan: NarrationPlan,
  rateMultiplier: number,
  onWordBoundary: (wb: WordBoundary, charOffset: number) => void,
): () => void {
  // Average chars per second at baseRate × rateMultiplier
  // Typical English TTS: ~14-16 chars/sec at 1.0x
  const charsPerSec = 15 * plan.baseRate * rateMultiplier;
  const timers: ReturnType<typeof setTimeout>[] = [];

  for (const wb of plan.wordBoundaries) {
    const delayMs = (wb.startChar / charsPerSec) * 1000;
    const t = setTimeout(() => {
      onWordBoundary(wb, wb.startChar);
    }, delayMs);
    timers.push(t);
  }

  return () => timers.forEach(clearTimeout);
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Stream a NarrationPlan via ElevenLabs TTS.
 * Returns a cancel function.
 */
export async function streamElevenLabs(
  plan: NarrationPlan,
  opts: ElevenLabsOptions,
): Promise<() => void> {
  const {
    apiKey,
    voiceId,
    modelId = 'eleven_turbo_v2',
    cadenceEnabled = true,
    rateMultiplier = 1.0,
    onAudioChunk,
    onWordBoundary,
    onEnd,
    onError,
  } = opts;

  let abortController: AbortController | null = new AbortController();

  // Schedule approximate word boundary events
  let cancelWordEvents: (() => void) | null = null;
  if (onWordBoundary) {
    cancelWordEvents = scheduleApproximateWordEvents(plan, rateMultiplier, onWordBoundary);
  }

  const cancel = () => {
    abortController?.abort();
    abortController = null;
    cancelWordEvents?.();
  };

  // Prepare text
  const normalizedText = normalizeText(
    insertPauseMarkers(plan.text, plan, cadenceEnabled)
  );

  const voiceSettings = voiceSettingsForRole(plan.role);

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
      {
        method: 'POST',
        signal: abortController.signal,
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: normalizedText,
          model_id: modelId,
          voice_settings: voiceSettings,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) onAudioChunk(value);
    }

    onEnd?.();
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      onError?.(err as Error);
    }
  }

  return cancel;
}

/**
 * ElevenLabs voices list helper
 */
export async function listElevenLabsVoices(
  apiKey: string,
): Promise<Array<{ voice_id: string; name: string; labels: Record<string, string> }>> {
  const res = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': apiKey },
  });
  if (!res.ok) throw new Error(`ElevenLabs voices error: ${res.status}`);
  const data = await res.json();
  return data.voices ?? [];
}
