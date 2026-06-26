// Word-level karaoke sync for Natural Reading. Two timing sources feed the same
// word index: browser SpeechSynthesisUtterance `onboundary` events (exact
// charIndex) and OpenAI-TTS <audio> playback (no timing metadata — estimated
// from audio.currentTime/duration distributed across words by relative length).

export interface SyncWord {
  word: string;
  start: number; // char offset into the source text, inclusive
  end: number;   // char offset into the source text, exclusive
}

/** Splits text on whitespace, keeping each word's character offsets into `text`. */
export function tokenizeWords(text: string): SyncWord[] {
  const words: SyncWord[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    words.push({ word: m[0], start: m.index, end: m.index + m[0].length });
  }
  return words;
}

/**
 * Cumulative fraction (0..1) of total utterance duration at which each word is
 * expected to *start* — weighted by word length, with extra weight after
 * trailing punctuation to mirror the pause every TTS engine adds there.
 */
export function estimateWordWeights(words: SyncWord[]): number[] {
  if (words.length === 0) return [];
  const raw = words.map((w) => {
    const punctuationPause = /[.!?,;:]$/.test(w.word) ? 3 : 0;
    return Math.max(1, w.word.length) + punctuationPause;
  });
  const total = raw.reduce((sum, n) => sum + n, 0);
  const cumulative: number[] = [];
  let acc = 0;
  for (const n of raw) {
    cumulative.push(acc / total);
    acc += n;
  }
  return cumulative;
}

/** Finds the index of the word whose cumulative-start-fraction is at or before `frac`. */
export function wordIndexForFraction(cumulativeWeights: number[], frac: number): number {
  if (cumulativeWeights.length === 0) return 0;
  let idx = 0;
  for (let i = 0; i < cumulativeWeights.length; i++) {
    if (cumulativeWeights[i] <= frac) idx = i;
    else break;
  }
  return idx;
}

/** Finds the index of the word whose [start,end) range contains `charIndex`. */
export function wordIndexForCharIndex(words: SyncWord[], charIndex: number): number {
  if (words.length === 0) return 0;
  for (let i = 0; i < words.length; i++) {
    if (charIndex < words[i].end) return i;
  }
  return words.length - 1;
}

/** Proportionally remaps an index from one list length to another (e.g. spoken-text word
 *  index → displayed-text word index, when formula normalization changes word count). */
export function scaleIndex(idx: number, fromCount: number, toCount: number): number {
  if (toCount <= 0) return 0;
  if (fromCount <= 1) return 0;
  const scaled = Math.round((idx / (fromCount - 1)) * (toCount - 1));
  return Math.min(Math.max(scaled, 0), toCount - 1);
}
