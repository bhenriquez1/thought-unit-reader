// Current Page speech is a strict source-reading path. It may normalize
// whitespace so extracted PDF lines can be sent to TTS, and it strips page
// furniture (running headers/footers, page numbers, copyright/publisher
// debris, checkpoint/callout section labels) before segmenting — but it
// must not add, reorder, summarize, or paraphrase any surviving lexical
// content, and must never drop instructional content (body prose,
// equations, figure/table captions) just because it's adjacent to furniture.

import { cleanActivePageText } from "@/lib/insights/cleanActivePageText";

const ABBREVIATION_RE = /\b(Fig|No|vol|pp|cf|e\.g|i\.e|vs|Dr|Mr|Mrs|Ms|Prof|et\s+al|etc|approx|dept|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec|St|Avg|avg|max|min)\.\s*$/i;

export function normalizeSourceWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function splitOversizedSegment(segment: string, maxChars: number): string[] {
  if (segment.length <= maxChars) return [segment];

  const parts: string[] = [];
  let remaining = segment;
  while (remaining.length > maxChars) {
    const boundary = remaining.lastIndexOf(" ", maxChars);
    // A single source token must never be modified merely to satisfy a
    // provider limit. Keep it intact and let the provider report its limit.
    if (boundary <= 0) return [...parts, remaining];
    parts.push(remaining.slice(0, boundary));
    remaining = remaining.slice(boundary + 1);
  }
  if (remaining) parts.push(remaining);
  return parts;
}

/**
 * Builds ordered TTS segments for the whole current page.
 *
 * Invariant for ordinary extracted text:
 *   segments.join(" ") === normalizeSourceWhitespace(cleanActivePageText(source, undefined, { stripFigureCaptions: false }))
 *
 * The page furniture stripped here (running headers/footers, page numbers,
 * copyright/publisher debris, checkpoint/callout section labels — see
 * lib/insights/cleanActivePageText.ts) is the same stripping already used
 * for anchor grounding and synthesis input; this reuses it rather than
 * building a second matcher. Figure/table captions are deliberately KEPT —
 * they can carry real instructional content — and there is no AI/OCR
 * rewrite of anything that survives: every surviving word is spoken
 * verbatim, in source order.
 */
export function buildCurrentPageSpeechSegments(
  activePageText: string,
  maxChars = 3500,
): string[] {
  const cleaned = cleanActivePageText(activePageText, "current-page-speech", { stripFigureCaptions: false });
  const source = normalizeSourceWhitespace(cleaned);
  if (!source) return [];

  const chunks = source.split(/(?<=[.!?…])\s+/);
  const sentences: string[] = [];

  for (const chunk of chunks) {
    if (!chunk) continue;
    const previous = sentences[sentences.length - 1];
    const looksLikeContinuation = /^[a-z"'(0-9]/.test(chunk);
    if (previous && (ABBREVIATION_RE.test(previous) || looksLikeContinuation)) {
      sentences[sentences.length - 1] = `${previous} ${chunk}`;
    } else {
      sentences.push(chunk);
    }
  }

  return sentences.flatMap((sentence) => splitOversizedSegment(sentence, maxChars));
}
