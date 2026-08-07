// lib/insights/segmentPageSentences.ts
// Deterministic sentence segmentation for the current page's RAW text (the
// same text lib/highlights/groundSurgeonQuotes.ts grounds against — see that
// file's header comment for why grounding must operate on raw, not cleaned,
// text). Each sentence gets a stable id (S001, S002, ...).
//
// Why this exists: asking the model to reproduce a page sentence byte-for-
// byte as `exactQuote` is fragile — even a small paraphrase (a dropped comma,
// "cannot" -> "can't") makes groundSurgeonQuotes correctly reject an
// otherwise-correct annotation ("no highlight is better than a wrong one").
// Segmenting the page ourselves and asking the model to pick a sentenceId
// instead removes that failure class entirely for full-sentence annotations:
// the returned id resolves to a guaranteed-exact substring of the same raw
// text geometry resolution will search, with no string-matching involved at
// all. See pages/api/page-annotation-plan.ts (prompt) and
// lib/highlights/groundSurgeonQuotes.ts (Stage 0 lookup) for the consumers.
//
// This module must be called with the IDENTICAL raw page text at both
// prompt-build time (lib/insights/buildSurgeonAnnotationInput.ts) and
// response-grounding time (groundSurgeonQuotes.ts) so the same id always
// resolves to the same text — it is a pure function, no randomness, no
// Date.now(), safe to call twice with the same input.

import { isLikelyHeaderLine } from "./cleanActivePageText";

export interface PageSentence {
  id: string;
  /** Exact substring of the raw page text passed in — never re-derived or
   *  normalized beyond trimming, so it can always be found via a plain
   *  indexOf() against that same raw text. */
  text: string;
}

const SENTENCE_END_CHARS = new Set([".", "!", "?", ";", ":"]);
const TRAILING_CLOSERS = new Set(["\"", "'", "”", "’", ")", "]"]);

const MIN_SENTENCE_LEN = 15;
const MAX_SENTENCE_LEN = 500;
/** Defensive cap — a very long/dense page still produces a manageably-sized
 *  prompt payload; the model is never shown more than this many candidates. */
const DEFAULT_MAX_SENTENCES = 80;

/**
 * Split rawPageText into an ordered list of ID'd sentence-like spans.
 * Skips spans that look like running headers/footers/page numbers/captions
 * (reusing the SAME heuristic cleanActivePageText.ts uses to reject header
 * lines from thesis/anchor candidates) and spans that are implausibly short
 * or long to be a real teaching-worthy sentence — those are simply omitted
 * from the numbered list, never merged into a neighboring sentence.
 */
export function segmentPageSentences(
  rawPageText: string | null | undefined,
  maxSentences: number = DEFAULT_MAX_SENTENCES,
): PageSentence[] {
  if (!rawPageText) return [];
  const n = rawPageText.length;
  const sentences: PageSentence[] = [];
  let cursor = 0;
  let seq = 0;

  while (cursor < n && sentences.length < maxSentences) {
    while (cursor < n && /\s/.test(rawPageText[cursor])) cursor++;
    if (cursor >= n) break;

    const start = cursor;
    let i = cursor;
    let end = n;
    while (i < n) {
      const ch = rawPageText[i];
      if (ch === "\n" && rawPageText[i + 1] === "\n") { end = i; break; }
      if (SENTENCE_END_CHARS.has(ch)) {
        i++;
        while (i < n && TRAILING_CLOSERS.has(rawPageText[i])) i++;
        end = i;
        break;
      }
      i++;
    }
    if (i >= n) end = n;
    cursor = end;

    const trimmed = rawPageText.slice(start, end).trim();
    if (trimmed.length < MIN_SENTENCE_LEN || trimmed.length > MAX_SENTENCE_LEN) continue;
    if (isLikelyHeaderLine(trimmed)) continue;

    seq++;
    sentences.push({ id: `S${String(seq).padStart(3, "0")}`, text: trimmed });
  }

  return sentences;
}

/** id -> exact text, for O(1) lookup at grounding time. */
export function sentencesById(sentences: PageSentence[]): Map<string, string> {
  return new Map(sentences.map((s) => [s.id, s.text]));
}

/** Formats the numbered list exactly as shown to the model — kept in one
 *  place so the prompt-building side and any debug/log output agree. */
export function formatSentenceList(sentences: PageSentence[]): string {
  return sentences.map((s) => `${s.id}: ${s.text}`).join("\n");
}
