/**
 * Sentence integrity utilities for buildPageStoryV2.
 *
 * These are distinct from sentenceCleanup.ts (which handles operator note
 * compression for display).  This module focuses exclusively on repairing
 * broken PDF extraction artefacts so no fragment ever enters story synthesis.
 */

export function repairSoftHyphens(text: string): string {
  return text.replace(/\u00ad/g, "");
}

/**
 * Repair hard line-wrap hyphen splits produced by PDF text extraction:
 *   "com-\nplete" → "complete"
 *   "descrip-  tive" → "descriptive"
 */
export function repairLineWrapHyphens(text: string): string {
  // Hyphen followed by optional whitespace and a lowercase continuation
  return text.replace(/([A-Za-z])-\s+([a-z])/g, "$1$2");
}

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function cleanBlockText(text: string): string {
  return normalizeWhitespace(repairLineWrapHyphens(repairSoftHyphens(text)));
}

/**
 * A text block is a complete sentence when:
 *   - At least 20 characters
 *   - Ends with a sentence-terminating punctuation mark
 *   - Contains at least one alphabetic character
 *
 * This is intentionally strict: a null block is always better than a
 * broken or partial sentence in story output.
 */
export function isCompleteSentence(text: string): boolean {
  const t = cleanBlockText(text);
  if (t.length < 20) return false;
  if (!/[.?!:]$/.test(t)) return false;
  return /[A-Za-z]/.test(t);
}
