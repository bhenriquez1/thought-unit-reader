// lib/examEngine/questionGrounding.ts
// X2 — the strict provenance/rejection gate for generated exam questions.
// Mirrors the quote-grounding pattern already proven in
// lib/whiteboard/professorTldrawAgent.ts's isGroundedLabelText: the model is
// required to cite a literal quote from its source text, and the server
// verifies that quote actually appears there before the question ships.
// Unlike a question's stem (which is deliberately paraphrased/synthesized —
// "Generate ORIGINAL exam questions"), the cited quote is NOT meant to be
// original; it is exactly what makes the question auditable.

export const QUESTION_GENERATOR_VERSION = 1;

/** Minimum normalized length for a quote to count as real evidence — short
 *  enough that any question could trivially "match" it, given exam prose is
 *  full of common short phrases. */
const MIN_QUOTE_LENGTH = 20;

export function normalizeForGrounding(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9%+\-/() ]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * True when `quote` (as claimed by the model) is a real, verifiable
 * substring of the source concept text — the rejection gate's core check.
 * Both sides are normalized identically so whitespace/punctuation/case
 * drift between the model's citation and the source text doesn't cause a
 * false rejection, while still requiring the SAME underlying words.
 */
export function isGroundedQuote(quote: string, conceptTextBlob: string): boolean {
  const normalizedQuote = normalizeForGrounding(quote);
  if (normalizedQuote.length < MIN_QUOTE_LENGTH) return false;
  return conceptTextBlob.includes(normalizedQuote);
}
