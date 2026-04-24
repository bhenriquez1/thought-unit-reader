// lib/speech/providers/azure.ts
// Azure Cognitive Services TTS Provider (Tier A)
// Generates proper SSML from NarrationPlan cues — the richest rendering.
// Supports: prosody rate/pitch, <emphasis>, <break>, <say-as>.
// Uses Azure's streaming REST API (SpeakerRecognition format compatible).

import type { NarrationPlan, NarrationCue } from '../narrationPlan';

// ============================================================================
// Types
// ============================================================================

export interface AzureTTSOptions {
  subscriptionKey: string;
  region: string;
  /** Azure neural voice name, e.g. "en-US-DavisNeural", "en-US-JennyNeural" */
  voiceName?: string;
  /** Ninja Nerd cadence ON */
  cadenceEnabled?: boolean;
  /** Global rate multiplier */
  rateMultiplier?: number;
  /** Called with each audio chunk (Uint8Array, mp3/ogg) */
  onAudioChunk: (chunk: Uint8Array) => void;
  onEnd?: () => void;
  onError?: (err: Error) => void;
}

// ============================================================================
// SSML generation from NarrationPlan
// ============================================================================

const RATE_TO_SSML: Record<string, string> = {
  // value ranges → SSML prosody rate strings
};

function rateToSSML(rate: number, baseRate: number): string {
  const effective = rate * (1 / baseRate); // relative to plan base
  if (effective <= 0.75) return 'x-slow';
  if (effective <= 0.88) return 'slow';
  if (effective <= 0.97) return '-8%';
  if (effective >= 1.12) return 'fast';
  return 'medium';
}

function pitchToSSML(pitch: number): string {
  // pitch is -2..+2 semitones
  if (pitch <= -1.5) return 'x-low';
  if (pitch <= -0.5) return 'low';
  if (pitch >= 1.5) return 'x-high';
  if (pitch >= 0.5) return 'high';
  return 'medium';
}

function emphasisToSSML(level: string | number | undefined): string {
  if (level === 'high') return 'strong';
  if (level === 'medium') return 'moderate';
  if (level === 'low') return 'reduced';
  return 'moderate';
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Convert a NarrationPlan into SSML string.
 *
 * Strategy:
 *   1. Walk text character by character, inserting SSML tags at cue positions
 *   2. Open/close prosody spans for rate-shifted regions
 *   3. Wrap emphasis spans around emphasis cue targets
 *   4. Insert <break> for pause cues
 */
export function planToSSML(
  plan: NarrationPlan,
  voiceName: string,
  rateMultiplier: number,
  cadenceEnabled: boolean,
): string {
  const { text, baseRate, basePitch, cues, role } = plan;

  if (!cadenceEnabled) {
    // Simple SSML with base rate/pitch only
    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
  <voice name="${voiceName}">
    <prosody rate="${rateToSSML(baseRate * rateMultiplier, 1)}" pitch="${pitchToSSML(basePitch)}">
      ${escapeXml(text)}
    </prosody>
  </voice>
</speak>`;
  }

  // Build a list of "insertions" at specific char offsets
  type Insertion = { atChar: number; markup: string; priority: number };
  const insertions: Insertion[] = [];

  // Sort cues by atChar
  const sortedCues = [...cues].sort((a, b) => (a.atChar ?? 0) - (b.atChar ?? 0));

  for (const cue of sortedCues) {
    const at = cue.atChar ?? 0;

    switch (cue.t) {
      case 'pause':
        if (cue.ms && cue.ms > 0) {
          insertions.push({
            atChar: at,
            markup: `<break time="${cue.ms}ms"/>`,
            priority: 1,
          });
        }
        break;

      case 'emphasis': {
        // Find the end of the word/phrase at this position
        const wordEnd = text.indexOf(' ', at);
        const spanEnd = wordEnd > at ? wordEnd : Math.min(at + 20, text.length);
        const emphLevel = emphasisToSSML(cue.value);
        // Open
        insertions.push({ atChar: at, markup: `<emphasis level="${emphLevel}">`, priority: 2 });
        // Close
        insertions.push({ atChar: spanEnd, markup: '</emphasis>', priority: 3 });
        break;
      }

      case 'rate': {
        if (typeof cue.value === 'number') {
          const rateStr = rateToSSML(cue.value * rateMultiplier, 1);
          // Apply rate to next sentence (close at next period or end)
          const endIdx = text.indexOf('.', at);
          const spanEnd = endIdx > at ? endIdx + 1 : text.length;
          insertions.push({
            atChar: at,
            markup: `<prosody rate="${rateStr}">`,
            priority: 2,
          });
          insertions.push({ atChar: spanEnd, markup: '</prosody>', priority: 3 });
        }
        break;
      }

      case 'pitch': {
        if (typeof cue.value === 'number') {
          const pitchStr = pitchToSSML(cue.value);
          const endIdx = text.indexOf('.', at);
          const spanEnd = endIdx > at ? endIdx + 1 : text.length;
          insertions.push({ atChar: at, markup: `<prosody pitch="${pitchStr}">`, priority: 2 });
          insertions.push({ atChar: spanEnd, markup: '</prosody>', priority: 3 });
        }
        break;
      }
    }
  }

  // Sort insertions by atChar, then priority
  insertions.sort((a, b) =>
    a.atChar !== b.atChar ? a.atChar - b.atChar : a.priority - b.priority
  );

  // Build the SSML body by splicing in markup
  let body = '';
  let cursor = 0;
  for (const ins of insertions) {
    if (ins.atChar > cursor) {
      body += escapeXml(text.slice(cursor, ins.atChar));
      cursor = ins.atChar;
    }
    body += ins.markup;
  }
  if (cursor < text.length) {
    body += escapeXml(text.slice(cursor));
  }

  const globalRate = rateToSSML(baseRate * rateMultiplier, 1);
  const globalPitch = pitchToSSML(basePitch);

  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
  <voice name="${voiceName}">
    <prosody rate="${globalRate}" pitch="${globalPitch}">
      ${body}
    </prosody>
  </voice>
</speak>`;
}

// ============================================================================
// Azure REST API streaming call
// ============================================================================

const AZURE_TTS_URL = (region: string) =>
  `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;

export async function streamAzureTTS(
  plan: NarrationPlan,
  opts: AzureTTSOptions,
): Promise<() => void> {
  const {
    subscriptionKey,
    region,
    voiceName = 'en-US-DavisNeural',
    cadenceEnabled = true,
    rateMultiplier = 1.0,
    onAudioChunk,
    onEnd,
    onError,
  } = opts;

  const abortController = new AbortController();
  const cancel = () => abortController.abort();

  const ssml = planToSSML(plan, voiceName, rateMultiplier, cadenceEnabled);

  try {
    const response = await fetch(AZURE_TTS_URL(region), {
      method: 'POST',
      signal: abortController.signal,
      headers: {
        'Ocp-Apim-Subscription-Key': subscriptionKey,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'ThoughtUnitReader/1.0',
      },
      body: ssml,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Azure TTS error ${response.status}: ${body}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body from Azure TTS');

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
 * List available Azure neural voices for English
 */
export async function listAzureVoices(
  subscriptionKey: string,
  region: string,
): Promise<Array<{ ShortName: string; DisplayName: string; Gender: string; Locale: string }>> {
  const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`;
  const res = await fetch(url, {
    headers: { 'Ocp-Apim-Subscription-Key': subscriptionKey },
  });
  if (!res.ok) throw new Error(`Azure voices error: ${res.status}`);
  const voices = await res.json();
  return (voices as Array<{ Locale: string; ShortName: string; DisplayName: string; Gender: string }>)
    .filter(v => v.Locale.startsWith('en-'));
}
