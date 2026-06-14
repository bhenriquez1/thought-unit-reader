// lib/speech/providers/webspeech.ts
// Web Speech API Provider (Tier B — universal fallback)
// Applies Ninja Nerd cadence cues via utterance chunking + per-sentence rate.
// Provides approximate word-boundary events (browser support varies).

import type { NarrationPlan, NarrationCue, WordBoundary } from '../narrationPlan';

// ============================================================================
// Types
// ============================================================================

export interface WebSpeechOptions {
  /** Voice URI from speechSynthesis.getVoices() — null = browser default */
  voiceURI?: string | null;
  /** Global rate multiplier (applied on top of plan's baseRate) */
  rateMultiplier?: number; // 0.8 | 1.0 | 1.2
  /** Ninja Nerd cadence enabled */
  cadenceEnabled?: boolean;
  /** Callbacks */
  onWordBoundary?: (wb: WordBoundary, charOffset: number) => void;
  onSentenceEnd?: (charOffset: number) => void;
  onEnd?: () => void;
  onError?: (err: string) => void;
}

export interface WebSpeechSession {
  /** Start speaking from a given char offset in the plan's text */
  start: (fromChar?: number) => void;
  /** Pause/resume */
  pause: () => void;
  resume: () => void;
  /** Cancel immediately */
  cancel: () => void;
  /** True while speaking */
  readonly speaking: boolean;
}

// ============================================================================
// Sentence splitter — needed for chunked utterance approach
// ============================================================================

interface SentenceChunk {
  text: string;
  startChar: number;
  endChar: number;
  /** Pause BEFORE this chunk (ms) */
  prePause: number;
  /** Speaking rate for this chunk */
  rate: number;
  /** pitch -2..+2, mapped to browser 0..2 */
  pitch: number;
}

function splitSentences(text: string): { text: string; startChar: number; endChar: number }[] {
  const out: { text: string; startChar: number; endChar: number }[] = [];
  // Split at sentence-ending punctuation, keeping the punctuation
  const re = /[^.!?\n]+[.!?\n]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const s = m[0].trim();
    if (s.length > 0) {
      out.push({ text: s, startChar: m.index, endChar: m.index + m[0].length });
    }
  }
  if (out.length === 0 && text.trim().length > 0) {
    out.push({ text: text.trim(), startChar: 0, endChar: text.length });
  }
  return out;
}

function computeChunks(plan: NarrationPlan, rateMultiplier: number): SentenceChunk[] {
  const sentences = splitSentences(plan.text);

  return sentences.map(({ text, startChar, endChar }) => {
    // Find relevant cues for this sentence range
    const sentenceCues = plan.cues.filter(
      c => (c.atChar ?? 0) >= startChar && (c.atChar ?? 0) < endChar
    );

    // Compute per-sentence rate override (lowest rate cue wins for caution)
    const rateCues = sentenceCues.filter(c => c.t === 'rate' && typeof c.value === 'number');
    const rateOverride = rateCues.length > 0
      ? Math.min(...rateCues.map(c => c.value as number))
      : plan.baseRate;

    // Pause before this sentence = max of all 'pause' cues near the boundary
    const prePauseCues = plan.cues.filter(
      c => c.t === 'pause' && (c.atChar ?? 0) >= Math.max(0, startChar - 5) && (c.atChar ?? 0) <= startChar + 5
    );
    const prePause = prePauseCues.length > 0
      ? Math.max(...prePauseCues.map(c => c.ms ?? 0))
      : 0;

    // Pitch: use plan base pitch
    const pitchCues = sentenceCues.filter(c => c.t === 'pitch' && typeof c.value === 'number');
    const pitchOffset = pitchCues.length > 0
      ? (pitchCues[0].value as number)
      : plan.basePitch;
    // Map -2..+2 → browser pitch 0.5..2.0 (1.0 = neutral)
    const pitch = 1.0 + pitchOffset * 0.25;

    return {
      text,
      startChar,
      endChar,
      prePause,
      rate: rateOverride * rateMultiplier,
      pitch: Math.max(0.5, Math.min(2.0, pitch)),
    };
  });
}

// ============================================================================
// Approximate word-boundary via character counting
// ============================================================================

function approxWordBoundaryFromCharset(
  plan: NarrationPlan,
  charsSpoken: number,
  onWordBoundary: (wb: WordBoundary, charOffset: number) => void,
): void {
  // Find word boundaries that fall within the spoken range
  for (const wb of plan.wordBoundaries) {
    if (wb.startChar === charsSpoken) {
      onWordBoundary(wb, charsSpoken);
      return;
    }
  }
}

// ============================================================================
// Voice cache — speechSynthesis.getVoices() can be a slow synchronous browser
// call; cache the result and only refresh on the 'voiceschanged' event.
// ============================================================================

let cachedVoices: SpeechSynthesisVoice[] | null = null;

function getCachedVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  if (cachedVoices && cachedVoices.length > 0) return cachedVoices;

  cachedVoices = speechSynthesis.getVoices();

  if (cachedVoices.length === 0) {
    // Voices not loaded yet — refresh the cache once they arrive.
    speechSynthesis.addEventListener(
      'voiceschanged',
      () => { cachedVoices = speechSynthesis.getVoices(); },
      { once: true },
    );
  }

  return cachedVoices;
}

// ============================================================================
// Provider
// ============================================================================

export function createWebSpeechSession(
  plan: NarrationPlan,
  opts: WebSpeechOptions = {},
): WebSpeechSession {
  const {
    voiceURI = null,
    rateMultiplier = 1.0,
    cadenceEnabled = true,
    onWordBoundary,
    onSentenceEnd,
    onEnd,
    onError,
  } = opts;

  let _speaking = false;
  let cancelled = false;
  let paused = false;

  const chunks = cadenceEnabled
    ? computeChunks(plan, rateMultiplier)
    : [{ text: plan.text, startChar: 0, endChar: plan.text.length, prePause: 0, rate: plan.baseRate * rateMultiplier, pitch: 1.0 }];

  function getVoice(): SpeechSynthesisVoice | null {
    if (!voiceURI) return null;
    const voices = getCachedVoices();
    return voices.find(v => v.voiceURI === voiceURI) ?? null;
  }

  function speak(chunkIdx: number, fromChar: number): void {
    if (cancelled || chunkIdx >= chunks.length) {
      _speaking = false;
      if (!cancelled) onEnd?.();
      return;
    }

    const chunk = chunks[chunkIdx];

    // Skip chunks before fromChar when starting mid-paragraph
    if (chunk.endChar <= fromChar && chunkIdx < chunks.length - 1) {
      speak(chunkIdx + 1, fromChar);
      return;
    }

    // Apply pre-pause (use setTimeout for delay between utterances)
    const effectivePause = chunkIdx === 0 ? 0 : chunk.prePause;

    const doSpeak = () => {
      if (cancelled) return;

      // Trim chunk text if we're starting from a partial position
      let chunkText = chunk.text;
      let charBase = chunk.startChar;
      if (fromChar > chunk.startChar) {
        const offset = fromChar - chunk.startChar;
        chunkText = chunk.text.slice(offset);
        charBase = fromChar;
      }

      if (!chunkText.trim()) {
        speak(chunkIdx + 1, fromChar);
        return;
      }

      const utt = new SpeechSynthesisUtterance(chunkText);
      utt.rate = Math.max(0.1, Math.min(10, chunk.rate));
      utt.pitch = chunk.pitch;
      utt.volume = 1.0;

      const voice = getVoice();
      if (voice) utt.voice = voice;

      utt.onboundary = (ev) => {
        if (ev.name === 'word' && onWordBoundary) {
          const charOffset = charBase + (ev.charIndex ?? 0);
          const wb = plan.wordBoundaries.find(
            w => w.startChar <= charOffset && w.endChar > charOffset
          );
          if (wb) onWordBoundary(wb, charOffset);
        }
      };

      utt.onend = () => {
        if (cancelled) return;
        onSentenceEnd?.(chunk.endChar);
        speak(chunkIdx + 1, fromChar);
      };

      utt.onerror = (ev) => {
        if (ev.error !== 'interrupted') {
          onError?.(ev.error);
        }
      };

      speechSynthesis.speak(utt);
    };

    if (effectivePause > 0) {
      setTimeout(doSpeak, effectivePause);
    } else {
      doSpeak();
    }
  }

  return {
    start(fromChar = 0) {
      cancelled = false;
      paused = false;
      _speaking = true;
      speechSynthesis.cancel(); // clear any previous
      speak(0, fromChar);
    },

    pause() {
      if (_speaking && !paused) {
        speechSynthesis.pause();
        paused = true;
      }
    },

    resume() {
      if (_speaking && paused) {
        speechSynthesis.resume();
        paused = false;
      }
    },

    cancel() {
      cancelled = true;
      _speaking = false;
      paused = false;
      speechSynthesis.cancel();
    },

    get speaking() {
      return _speaking;
    },
  };
}

// ============================================================================
// Utility: list available voices
// ============================================================================

export function getWebSpeechVoices(): SpeechSynthesisVoice[] {
  return getCachedVoices();
}

export function isWebSpeechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}
