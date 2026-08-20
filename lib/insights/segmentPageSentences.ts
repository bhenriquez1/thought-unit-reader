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
import { CanonicalPageMapRegistry } from "../pdf/canonicalPageMapRegistry";

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

/** A sentence-like span with its exact char offsets into the rawPageText it
 *  was found in — `rawPageText.slice(start, end) === text` always holds. */
export interface RawSentenceSpan {
  start: number;
  end: number;
  text: string;
}

/**
 * Walks rawPageText and returns EVERY sentence-like span in order, with NO
 * length/header filtering and no cap — the shared boundary-finding core both
 * segmentPageSentences() (candidate list for LLM grounding — filters and
 * ID's a SUBSET) and lib/pdf/canonicalPageMap.ts's buildCanonicalPageMap()
 * (retains and role-classifies EVERY span, filtering nothing) build on, so
 * the two callers can never silently disagree about where a sentence
 * boundary falls. Pure function, same input always produces the same spans.
 */
export function findSentenceSpans(rawPageText: string | null | undefined): RawSentenceSpan[] {
  if (!rawPageText) return [];
  const n = rawPageText.length;
  const spans: RawSentenceSpan[] = [];
  let cursor = 0;

  while (cursor < n) {
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

    // `start` already points past all leading whitespace (the skip-loop
    // above), so slice(start, end).trim() can only have shed TRAILING
    // whitespace — the trimmed text's own length is enough to compute its
    // real end offset without re-scanning.
    const raw = rawPageText.slice(start, end);
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    spans.push({ start, end: start + trimmed.length, text: trimmed });
  }

  return spans;
}

/**
 * Split rawPageText into an ordered list of ID'd sentence-like spans.
 * Skips spans that look like running headers/footers/page numbers/captions
 * (reusing the SAME heuristic cleanActivePageText.ts uses to reject header
 * lines from thesis/anchor candidates) and spans that are implausibly short
 * or long to be a real teaching-worthy sentence — those are simply omitted
 * from the numbered list, never merged into a neighboring sentence.
 *
 * Stabilization item 4C-3: when `pageIndex` is given AND
 * CanonicalPageMapRegistry already holds a map for that page whose OWN
 * `fullText` is an EXACT match for `rawPageText`, ids are read from that
 * cached, already-built enumeration instead of being recomputed from
 * scratch — the same filter (length bounds + isLikelyHeaderLine) is still
 * applied, so the CANDIDATE SET shown to the model is identical either way.
 * The exact-text check is the whole safety story: it is what guarantees
 * prompt-build time and grounding time (two separate calls, see this
 * file's header comment) agree on the SAME id -> sentence mapping even
 * across the canonical/fallback boundary, since both branches are pure
 * functions of rawPageText alone (fallback) or of rawPageText plus a
 * registry entry PROVEN to have been built from that exact rawPageText
 * (canonical) — never a stale or different-page entry silently reused.
 *
 * A consequence worth calling out: canonical-path ids reflect this
 * sentence's position in the FULL (unfiltered, furniture included)
 * per-page enumeration, so they are not guaranteed contiguous among just
 * the filtered candidates the model sees (e.g. S002, S004, S007 if S001/
 * S003/S005/S006 were headers/captions). This is harmless — every
 * consumer (sentencesById, formatSentenceList, groundSurgeonQuotes' Stage
 * 0) looks a sentence up BY its id string, never by assuming contiguity —
 * and is what makes the SAME sentence keep the SAME id across repeated
 * requeries of the same page (e.g. a domain/pack change), which the old
 * always-fresh-and-contiguous numbering could never guarantee.
 *
 * When no pageIndex is given, or the registry has nothing yet for that
 * page (extraction still running, or this is a test), or its fullText
 * doesn't match rawPageText (stale/different content) — falls back to
 * computing fresh via findSentenceSpans, exactly as before this PR.
 */
export function segmentPageSentences(
  rawPageText: string | null | undefined,
  maxSentences: number = DEFAULT_MAX_SENTENCES,
  pageIndex?: number,
): PageSentence[] {
  if (!rawPageText) return [];

  if (pageIndex !== undefined) {
    const canonical = CanonicalPageMapRegistry.get(pageIndex);
    if (canonical && canonical.fullText === rawPageText) {
      const sentences: PageSentence[] = [];
      for (const s of canonical.sentences) {
        if (sentences.length >= maxSentences) break;
        if (s.text.length < MIN_SENTENCE_LEN || s.text.length > MAX_SENTENCE_LEN) continue;
        if (isLikelyHeaderLine(s.text)) continue;
        sentences.push({ id: s.id, text: s.text });
      }
      return sentences;
    }
  }

  const sentences: PageSentence[] = [];
  let seq = 0;

  for (const span of findSentenceSpans(rawPageText)) {
    if (sentences.length >= maxSentences) break;
    if (span.text.length < MIN_SENTENCE_LEN || span.text.length > MAX_SENTENCE_LEN) continue;
    if (isLikelyHeaderLine(span.text)) continue;

    seq++;
    sentences.push({ id: `S${String(seq).padStart(3, "0")}`, text: span.text });
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
