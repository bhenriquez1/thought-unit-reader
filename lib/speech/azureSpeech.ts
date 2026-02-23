// lib/speech/azureSpeech.ts
// Azure Speech integration — TEMPORARILY DISABLED
// The microsoft-cognitiveservices-speech-sdk is not installed in this
// environment. All exports are safe no-op stubs.
// Re-enable by setting FEATURES.AZURE_SPEECH = true in lib/config/features.ts
// and restoring the full implementation.

export interface WordBoundaryEvent {
  word: string;
  audioOffset: number;
  duration?: number;
  textOffset: number;
  wordLength: number;
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
  startChar: number;
  endChar: number;
  sentenceIndex: number;
}

export interface SpeechControllerState {
  currentParagraphId: string | null;
  currentSentenceIndex: number;
  currentWordCharOffset: number;
  currentSpokenRange: [number, number] | null;
}

// ============================================================================
// Tokenization helpers — kept active (no SDK dependency)
// ============================================================================

export function tokenizeSentences(text: string): SentenceToken[] {
  const sentences: SentenceToken[] = [];
  let cursor = 0;
  const parts = text.split(/(?<=[.?!])\s+/);
  for (const part of parts) {
    if (!part.trim()) { cursor += part.length + 1; continue; }
    sentences.push({ text: part, startChar: cursor, endChar: cursor + part.length });
    cursor += part.length + 1;
  }
  return sentences;
}

export function tokenizeWords(text: string): WordToken[] {
  const sentences = tokenizeSentences(text);
  const words: WordToken[] = [];
  for (let si = 0; si < sentences.length; si++) {
    const { text: sent, startChar: base } = sentences[si];
    for (const match of sent.matchAll(/\S+/g)) {
      if (match.index === undefined) continue;
      words.push({
        text: match[0],
        startChar: base + match.index,
        endChar: base + match.index + match[0].length,
        sentenceIndex: si,
      });
    }
  }
  return words;
}

export function buildSpeakFromOffset(
  text: string,
  clickedCharOffset: number,
): { textToSpeak: string; baseCharOffset: number; sentenceIndex: number } {
  const sentences = tokenizeSentences(text);
  let sentenceIndex = 0;
  for (let i = 0; i < sentences.length; i++) {
    if (sentences[i].startChar <= clickedCharOffset) sentenceIndex = i;
    else break;
  }
  const from = sentences[sentenceIndex];
  const textToSpeak = sentences.slice(sentenceIndex).map(s => s.text).join(' ');
  return { textToSpeak, baseCharOffset: from.startChar, sentenceIndex };
}

// ============================================================================
// Disabled stubs — SDK removed until FEATURES.AZURE_SPEECH is re-enabled
// ============================================================================

export async function createAzureSynthesizer(): Promise<null> {
  console.warn('[azureSpeech] Azure Speech is temporarily disabled. Set FEATURES.AZURE_SPEECH = true to re-enable.');
  return null;
}

export async function speakWithWordBoundaries(_params: SpeakParams): Promise<void> {
  console.warn('[azureSpeech] Azure Speech is temporarily disabled.');
  _params.onError?.('Azure Speech temporarily disabled.');
}

export class SpeechController {
  getState(): Readonly<SpeechControllerState> {
    return {
      currentParagraphId: null,
      currentSentenceIndex: 0,
      currentWordCharOffset: 0,
      currentSpokenRange: null,
    };
  }

  stop(): void { /* no-op */ }

  async speakParagraph(
    _paragraphId: string,
    _text: string,
    onRange: (range: [number, number] | null) => void,
    _onDone?: () => void,
  ): Promise<void> {
    console.warn('[azureSpeech] Azure Speech temporarily disabled.');
    onRange(null);
  }

  async speakFromCharOffset(
    _paragraphId: string,
    _fullText: string,
    _clickedCharOffset: number,
    onRange: (range: [number, number] | null) => void,
    _onDone?: () => void,
  ): Promise<void> {
    console.warn('[azureSpeech] Azure Speech temporarily disabled.');
    onRange(null);
  }
}
