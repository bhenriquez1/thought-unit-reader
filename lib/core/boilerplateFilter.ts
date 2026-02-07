/**
 * Boilerplate Filter
 *
 * Drops paragraphs that contain publisher metadata, copyright info,
 * ISBN/ISSN, Library of Congress data, and other non-content text
 * before Core extraction receives them.
 */

// ============================================================================
// Boilerplate Phrase Patterns
// ============================================================================

const BOILERPLATE_PATTERNS: RegExp[] = [
  // ISBN / ISSN
  /\bISBN[\s:-]*[\d\-Xx]{10,17}\b/i,
  /\bISSN[\s:-]*[\d\-]{7,9}\b/i,
  // Library of Congress
  /Library\s+of\s+Congress/i,
  /Cataloging[\s-]+in[\s-]+Publication/i,
  /\bLCCN[\s:]?\d/i,
  // Copyright
  /copyright\s*©/i,
  /©\s*\d{4}/,
  /\ball\s+rights\s+reserved\b/i,
  // Publisher boilerplate
  /\bprinted\s+in\b/i,
  /\bpublished\s+by\b/i,
  /\bpublisher[\s:]/i,
  // Addresses / contact info
  /\b\d{5}[\s-]?\d{0,4}\b.*(?:Street|Avenue|Blvd|Road|Drive|Suite)\b/i,
  // URLs and emails
  /https?:\/\/[^\s]+/i,
  /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/,
  // Edition / printing info
  /\b(?:first|second|third|\d+(?:st|nd|rd|th))\s+(?:edition|printing|impression)\b/i,
  // Typesetting / design
  /\btypeset(?:ting)?\s+(?:in|by)\b/i,
  /\bcover\s+design\b/i,
  /\bbook\s+design\b/i,
];

// Tokens that, if they constitute >30% of the paragraph, mark it as boilerplate
const BOILERPLATE_TOKENS = new Set([
  'isbn', 'issn', 'copyright', 'reserved', 'published', 'publisher',
  'edition', 'printing', 'printed', 'cataloging', 'publication',
  'library', 'congress', 'permission', 'reproduced', 'transmitted',
  'retrieval', 'typeset', 'manufactured',
]);

// ============================================================================
// Core Filter Function
// ============================================================================

/**
 * Check if a single paragraph is boilerplate.
 */
export function isBoilerplate(text: string): boolean {
  // Quick check: phrase match
  for (const pattern of BOILERPLATE_PATTERNS) {
    if (pattern.test(text)) return true;
  }

  // Token density check: if >30% of tokens are boilerplate keywords
  const tokens = text.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  if (tokens.length === 0) return false;

  let boilerplateCount = 0;
  for (const token of tokens) {
    const cleaned = token.replace(/[^a-z]/g, '');
    if (BOILERPLATE_TOKENS.has(cleaned)) {
      boilerplateCount++;
    }
  }

  return (boilerplateCount / tokens.length) > 0.3;
}

/**
 * Filter out boilerplate paragraphs from a list.
 * Returns only content paragraphs suitable for Core extraction.
 */
export function filterBoilerplate<T extends { text: string }>(
  paragraphs: T[]
): T[] {
  return paragraphs.filter(p => !isBoilerplate(p.text));
}

/**
 * Filter boilerplate from raw text split into paragraphs.
 * Returns cleaned text with boilerplate paragraphs removed.
 */
export function filterBoilerplateText(text: string): string {
  const paragraphs = text.split(/\n\s*\n/);
  const cleaned = paragraphs.filter(p => {
    const trimmed = p.trim();
    return trimmed.length > 0 && !isBoilerplate(trimmed);
  });
  return cleaned.join('\n\n');
}
