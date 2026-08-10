// Current Page speech is a strict source-reading path. It may normalize
// whitespace so extracted PDF lines can be sent to TTS, but it must not add,
// remove, reorder, or paraphrase lexical content.

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
 *   segments.join(" ") === normalizeSourceWhitespace(source)
 *
 * There is deliberately no heading/footer/caption heuristic and no AI/OCR
 * repair here. Structured extraction may omit a block before it reaches this
 * function only when that block is explicitly classified as non-reading.
 */
export function buildCurrentPageSpeechSegments(
  activePageText: string,
  maxChars = 3500,
): string[] {
  const source = normalizeSourceWhitespace(activePageText);
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
