// lib/insights/cleanActivePageText.ts
// Minimal active-page text cleaner for synthesis input.
//
// The PDF text layer is extracted as a single space-joined string per page, so
// running headers/footers and page numbers end up glued to the front/back of the
// body text (e.g. "30 UNIT ONE The Chemistry of Life ..."). When that debris feeds
// the synthesizer it pollutes the Page Thesis. This strips the common debris while
// KEEPING body paragraphs, section headings, and equation/math lines intact.
//
// Scope: synthesis input only. Does NOT touch highlights, the PDF viewer, NoteLab,
// RecallLab, or Focus Cycle.

// Leading "page number + running header" pattern, e.g.:
//   "30 UNIT ONE The Chemistry of Life"  -> "The Chemistry of Life"
//   "412 CHAPTER 7 Cellular Respiration" -> "Cellular Respiration"
// Matches optional leading digits, then an all-caps or Title-case label keyword,
// lazily up to the first real Title-case body word (Upper + lower).
// NOTE: deliberately case-SENSITIVE — the `[A-Z][a-z]` lookahead must distinguish
// an ALL-CAPS header tail (e.g. "ONE") from the Title-case body start ("The"). An
// /i flag would make `[a-z]` match uppercase too and stop at the header tail.
const LEADING_RUNNING_HEADER_RE =
  /^\s*\d{0,4}\s*(?:UNIT|CHAPTER|SECTION|MODULE|PART|APPENDIX|LESSON|Unit|Chapter|Section|Module|Part|Appendix|Lesson)\b[^.]*?(?=[A-Z][a-z])/;

// A bare leading page number sitting in front of the body ("30 The cell ...").
const LEADING_PAGE_NUMBER_RE = /^\s*\d{1,4}\s+(?=[A-Z])/;

// Trailing bare page number ("... end of the section. 31").
const TRAILING_PAGE_NUMBER_RE = /\s+\d{1,4}\s*$/;

// Copyright / publisher / footer debris that can appear anywhere on the page.
// Each alternative is anchored to its keyword and consumes to the end of its
// sentence (the next period, inclusive) so it strips the whole footer clause.
const FOOTER_DEBRIS_RE =
  /\b(?:Copyright\b[^.]*\.?|©\s*\d{0,4}[^.]*\.?|All rights reserved[^.]*\.?|Cengage Learning[^.]*\.?|Pearson Education[^.]*\.?|McGraw[-\s]?Hill[^.]*\.?|ISBN[-\s:]*[\dX\- ]+|Printed in (?:the )?U\.?S\.?A?\.?|No part of this (?:work|book)[^.]*\.?|may not be (?:copied|scanned|duplicated)[^.]*\.?)/gi;

/**
 * Clean a single active page's raw text for synthesis.
 * Strips page numbers, UNIT/chapter running headers, and copyright/footer debris.
 * Keeps body paragraphs, section headings, and equation/math lines.
 */
export function cleanActivePageText(raw: string | undefined | null): string {
  if (!raw) return "";

  let t = raw
    .replace(/ /g, " ")  // non-breaking space
    .replace(/[ \t]+/g, " ")
    .trim();

  // Remove copyright/footer debris first (it can sit mid-string after joining).
  t = t.replace(FOOTER_DEBRIS_RE, " ");

  // Strip a leading page-number + running header, then a bare leading page number.
  t = t.replace(LEADING_RUNNING_HEADER_RE, "");
  t = t.replace(LEADING_PAGE_NUMBER_RE, "");

  // Strip a trailing bare page number.
  t = t.replace(TRAILING_PAGE_NUMBER_RE, "");

  return t.replace(/[ \t]+/g, " ").trim();
}

/**
 * Clean a short single-line value (thesis / objective) using the same rules.
 * Identical logic today, kept as a named export so call sites read clearly.
 */
export function cleanThesisLine(raw: string | undefined | null): string | undefined {
  const cleaned = cleanActivePageText(raw);
  return cleaned.length > 0 ? cleaned : undefined;
}
