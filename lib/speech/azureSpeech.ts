// lib/speech/azureSpeech.ts
// Azure Cognitive Services Speech SDK — word-boundary + click-to-start
//
// Uses the microsoft-cognitiveservices-speech-sdk package for real-time
// word boundary events. Falls back to a no-op stub if the SDK is unavailable.
//
// Install: npm i microsoft-cognitiveservices-speech-sdk
// Env vars: NEXT_PUBLIC_AZURE_SPEECH_KEY, NEXT_PUBLIC_AZURE_SPEECH_REGION

// ============================================================================
// Types
// ============================================================================

export interface WordBoundaryEvent {
  word: string;         // spoken word text
  audioOffset: number;  // ticks (100ns units) from start of audio
  duration?: number;    // ticks
  textOffset: number;   // char index in the utterance text
  wordLength: number;   // char length of the word
}

export interface SpeakParams {
  text: string;
  onWord: (e: WordBoundaryEvent) => void;
  onDone?: () => void;
  onError?: (err: string) => void;
}

export interface SentenceToken {
  text: string;
  startChar: number;
  endChar: number;
}

export interface WordToken {
  text: string;
  startChar: number; // absolute char offset in paragraph
  endChar: number;
  sentenceIndex: number;
}

// ============================================================================
// Tokenization helpers (used for click-to-start + highlight alignment)
// ============================================================================

/**
 * Split text into sentences using basic punctuation boundaries.
 */
export function tokenizeSentences(text: string): SentenceToken[] {
  const sentences: SentenceToken[] = [];
  let cursor = 0;
  // Split on ". ", "? ", "! " or end of string
  const parts = text.split(/(?<=[.?!])\s+/);
  for (const part of parts) {
    if (!part.trim()) { cursor += part.length + 1; continue; }
    sentences.push({ text: part, startChar: cursor, endChar: cursor + part.length });
    cursor += part.length + 1; // +1 for the space consumed
  }
  return sentences;
}

/**
 * Tokenize sentences into word spans with absolute char offsets.
 * Returns WordToken[] ordered by startChar.
 */
export function tokenizeWords(text: string): WordToken[] {
  const sentences = tokenizeSentences(text);
  const words: WordToken[] = [];
  for (let si = 0; si < sentences.length; si++) {
    const { text: sent, startChar: base } = sentences[si];
    let wCursor = 0;
    for (const match of sent.matchAll(/\S+/g)) {
      if (match.index === undefined) continue;
      words.push({
        text: match[0],
        startChar: base + match.index,
        endChar: base + match.index + match[0].length,
        sentenceIndex: si,
      });
    }
    void wCursor;
  }
  return words;
}

/**
 * Given a clicked char offset in the paragraph, find which sentence contains it
 * and return the text to speak (from that sentence onward) plus the baseline
 * char offset so highlight events can be aligned.
 */
export function buildSpeakFromOffset(
  text: string,
  clickedCharOffset: number,
): { textToSpeak: string; baseCharOffset: number; sentenceIndex: number } {
  const sentences = tokenizeSentences(text);
  let sentenceIndex = 0;
  for (let i = 0; i < sentences.length; i++) {
    if (sentences[i].startChar <= clickedCharOffset) {
      sentenceIndex = i;
    } else {
      break;
    }
  }
  const from = sentences[sentenceIndex];
  const remainingSentences = sentences.slice(sentenceIndex);
  const textToSpeak = remainingSentences.map(s => s.text).join(' ');
  return { textToSpeak, baseCharOffset: from.startChar, sentenceIndex };
}

// ============================================================================
// Azure SDK synthesizer factory + speakWithWordBoundaries
//
// The SDK is imported dynamically so the file compiles even without the
// package installed; it only fails at runtime if Azure speech is invoked.
// ============================================================================
// Client-side-only SDK loader
// The Azure Speech SDK uses browser APIs (AudioContext, WebSocket, etc.)
// and MUST NOT be imported at module level or during SSR.
// We gate on `typeof window !== "undefined"` before any import.
// ============================================================================

type AzureSynthesizer = {
  wordBoundary: ((sender: unknown, e: unknown) => void) | null;
  speakTextAsync: (
    text: string,
    cb: (result: unknown) => void,
    errCb: (err: string) => void,
  ) => void;
  close: () => void;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _sdkCache: any = null;

/**
 * Lazily load the Azure Speech SDK — client side only.
 * Returns null on the server (SSR/build time) so the module never breaks SSR.
 * Typed as `any` to avoid TS resolving the module path at build/SSR time.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getSpeechSDK(): Promise<any> {
  if (typeof window === 'undefined') return null; // SSR guard
  if (_sdkCache) return _sdkCache;
  try {
    _sdkCache = await import('microsoft-cognitiveservices-speech-sdk');
  } catch (e) {
    console.warn('[azureSpeech] SDK not available:', e);
    return null;
  }
  return _sdkCache;
}

/**
 * Create an Azure Speech synthesizer using env-supplied credentials.
 * Must only be called in a browser context.
 * Throws if invoked during SSR or if credentials are missing.
 */
export async function createAzureSynthesizer(overrides?: {
  voiceName?: string;
  subscriptionKey?: string;
  region?: string;
}): Promise<AzureSynthesizer> {
  const SDK = await getSpeechSDK();
  if (!SDK) throw new Error('Azure Speech SDK unavailable on server');

  const key    = overrides?.subscriptionKey ?? process.env.NEXT_PUBLIC_AZURE_SPEECH_KEY ?? '';
  const region = overrides?.region          ?? process.env.NEXT_PUBLIC_AZURE_SPEECH_REGION ?? '';
  const voice  = overrides?.voiceName ?? 'en-US-JennyNeural';

  if (!key || !region) {
    throw new Error(
      'Azure Speech credentials missing. Set NEXT_PUBLIC_AZURE_SPEECH_KEY and NEXT_PUBLIC_AZURE_SPEECH_REGION.'
    );
  }

  const speechConfig = SDK.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechSynthesisVoiceName = voice;
  speechConfig.speechSynthesisOutputFormat =
    SDK.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3;

  const audioConfig = SDK.AudioConfig.fromDefaultSpeakerOutput();
  return new SDK.SpeechSynthesizer(speechConfig, audioConfig) as unknown as AzureSynthesizer;
}

/**
 * Speak text with word boundary callbacks for live highlighting.
 *
 * @param params.text         The text to speak
 * @param params.onWord       Called for each spoken word with char offset
 * @param params.onDone       Called when utterance completes
 * @param params.onError      Called on synthesis error
 */
export async function speakWithWordBoundaries(params: SpeakParams): Promise<void> {
  const synth = await createAzureSynthesizer();

  // Subscribe to word boundary events
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  synth.wordBoundary = (_sender: unknown, e: any) => {
    params.onWord({
      word: params.text.slice(e.textOffset, e.textOffset + e.wordLength),
      audioOffset: e.audioOffset,
      duration: e.duration,
      textOffset: e.textOffset,
      wordLength: e.wordLength,
    });
  };

  return new Promise<void>((resolve, reject) => {
    synth.speakTextAsync(
      params.text,
      (_result: unknown) => {
        synth.close();
        params.onDone?.();
        resolve();
      },
      (err: string) => {
        synth.close();
        params.onError?.(String(err));
        reject(new Error(String(err)));
      },
    );
  });
}

// ============================================================================
// SpeechController — manages paragraph/sentence/word state
// ============================================================================

export interface SpeechControllerState {
  currentParagraphId: string | null;
  currentSentenceIndex: number;
  /** Absolute char offset of the word currently being spoken */
  currentWordCharOffset: number;
  /** Range being highlighted: [startChar, endChar] in paragraph text */
  currentSpokenRange: [number, number] | null;
}

export class SpeechController {
  private state: SpeechControllerState = {
    currentParagraphId: null,
    currentSentenceIndex: 0,
    currentWordCharOffset: 0,
    currentSpokenRange: null,
  };

  private abortController: AbortController | null = null;

  getState(): Readonly<SpeechControllerState> {
    return { ...this.state };
  }

  /** Stop any ongoing speech */
  stop(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.state.currentSpokenRange = null;
  }

  /**
   * Speak a paragraph from the beginning.
   */
  async speakParagraph(
    paragraphId: string,
    text: string,
    onRange: (range: [number, number] | null) => void,
    onDone?: () => void,
  ): Promise<void> {
    this.stop();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    this.state.currentParagraphId = paragraphId;
    this.state.currentSentenceIndex = 0;
    this.state.currentWordCharOffset = 0;

    await speakWithWordBoundaries({
      text,
      onWord: (e) => {
        if (signal.aborted) return;
        const start = e.textOffset;
        const end   = e.textOffset + e.wordLength;
        this.state.currentWordCharOffset = start;
        this.state.currentSpokenRange    = [start, end];
        onRange([start, end]);
      },
      onDone: () => {
        if (!signal.aborted) {
          this.state.currentSpokenRange = null;
          onRange(null);
          onDone?.();
        }
      },
      onError: (err) => {
        console.error('[SpeechController] Azure error:', err);
        onRange(null);
      },
    });
  }

  /**
   * Speak a paragraph starting from a clicked char offset.
   * Finds the sentence containing the offset and speaks from there.
   */
  async speakFromCharOffset(
    paragraphId: string,
    fullText: string,
    clickedCharOffset: number,
    onRange: (range: [number, number] | null) => void,
    onDone?: () => void,
  ): Promise<void> {
    this.stop();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    const { textToSpeak, baseCharOffset, sentenceIndex } = buildSpeakFromOffset(
      fullText,
      clickedCharOffset,
    );

    this.state.currentParagraphId    = paragraphId;
    this.state.currentSentenceIndex  = sentenceIndex;
    this.state.currentWordCharOffset = baseCharOffset;

    await speakWithWordBoundaries({
      text: textToSpeak,
      onWord: (e) => {
        if (signal.aborted) return;
        // Align to absolute char offsets in the original paragraph
        const absStart = baseCharOffset + e.textOffset;
        const absEnd   = absStart + e.wordLength;
        this.state.currentWordCharOffset = absStart;
        this.state.currentSpokenRange    = [absStart, absEnd];
        onRange([absStart, absEnd]);
      },
      onDone: () => {
        if (!signal.aborted) {
          this.state.currentSpokenRange = null;
          onRange(null);
          onDone?.();
        }
      },
      onError: (err) => {
        console.error('[SpeechController] Azure error:', err);
        onRange(null);
      },
    });
  }
}
