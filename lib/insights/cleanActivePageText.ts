// lib/insights/cleanActivePageText.ts
// Active-page text cleaner — text hygiene for synthesis input AND anchor grounding.
//
// The PDF text layer is extracted as a single space-joined string per page, so
// running headers/footers and page numbers end up glued to the front/back of the
// body text (e.g. "30 UNIT ONE The Chemistry of Life ..." or
// "The Chemical Context of Life 29 Just four elements..."). When that debris feeds
// the synthesizer it pollutes the Page Thesis; when it reaches anchor grounding it
// gets highlighted on the left panel as if it were a thesis sentence. This strips the
// common debris while KEEPING body paragraphs, section headings, and equation/math
// lines intact.
//
// Scope: synthesis input + left-panel anchor grounding. Does NOT touch the PDF viewer
// rendering, NoteLab, RecallLab, or Focus Cycle.

// Leading "page number + KEYWORD running header" pattern, e.g.:
//   "30 UNIT ONE The Chemistry of Life"  -> "The Chemistry of Life"
//   "412 CHAPTER 7 Cellular Respiration" -> "Cellular Respiration"
// Matches optional leading digits, then an all-caps or Title-case label keyword,
// lazily up to the first real Title-case body word (Upper + lower).
// NOTE: deliberately case-SENSITIVE — the `[A-Z][a-z]` lookahead must distinguish
// an ALL-CAPS header tail (e.g. "ONE") from the Title-case body start ("The"). An
// /i flag would make `[a-z]` match uppercase too and stop at the header tail.
const LEADING_RUNNING_HEADER_RE =
  /^\s*\d{0,4}\s*(?:UNIT|CHAPTER|SECTION|MODULE|PART|APPENDIX|LESSON|Unit|Chapter|Section|Module|Part|Appendix|Lesson)\b[^.]*?(?=[A-Z][a-z])/;

// Title-case running header WITHOUT a keyword, glued to the body via a page number, e.g.:
//   "The Chemical Context of Life 29 Just four elements..." -> "Just four elements..."
//   "Cellular Respiration 412 During glycolysis..."         -> "During glycolysis..."
// A run of Title-Case words (lowercase function words allowed between them), then a bare
// page number, then the body which starts with a Capital+lowercase word. The embedded
// page number is the decisive header signal — body prose does not wedge a standalone
// number between a title phrase and the next sentence.
const LEADING_TITLE_HEADER_PAGENUM_RE =
  /^\s*(?:(?:[A-Z][A-Za-z'’-]+|of|the|and|in|on|to|for|with|a|an|&)\s+){1,9}\d{1,4}\s+(?=[A-Z][a-z])/;

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
 * Clean a single active page's raw text for synthesis or anchor grounding.
 * Strips page numbers, UNIT/chapter/title running headers, and copyright/footer debris.
 * Keeps body paragraphs, section headings, and equation/math lines.
 *
 * @param raw   the raw extracted page text
 * @param tag   optional source tag for the [TEXT_CLEANED] log (e.g. "synth", "ground")
 */
export function cleanActivePageText(raw: string | undefined | null, tag?: string): string {
  if (!raw) return "";

  const original = raw;

  let t = raw
    .replace(/\u00A0/g, " ")  // non-breaking space
    .replace(/[ \t]+/g, " ")
    .trim();

  // Remove copyright/footer debris first (it can sit mid-string after joining).
  t = t.replace(FOOTER_DEBRIS_RE, " ");

  // Strip leading headers, longest/most-specific patterns first:
  //   1. keyword header ("UNIT ONE ...")
  //   2. title-case header glued via page number ("The Chemical Context of Life 29 ...")
  //   3. bare leading page number ("30 The cell ...")
  t = t.replace(LEADING_RUNNING_HEADER_RE, "");
  t = t.replace(LEADING_TITLE_HEADER_PAGENUM_RE, "");
  t = t.replace(LEADING_PAGE_NUMBER_RE, "");

  // Strip a trailing bare page number.
  t = t.replace(TRAILING_PAGE_NUMBER_RE, "");

  const cleaned = t.replace(/[ \t]+/g, " ").trim();

  if (tag && cleaned.length !== original.trim().length) {
    console.log("[TEXT_CLEANED]", {
      tag,
      removedChars: original.trim().length - cleaned.length,
      keptCharCount: cleaned.length,
      removedPreview: original.trim().slice(0, Math.max(0, original.trim().length - cleaned.length)).slice(0, 80) || null,
      preview: cleaned.slice(0, 100),
    });
  }

  return cleaned;
}

/**
 * Clean a short single-line value (thesis / objective) using the same rules.
 * Identical logic today, kept as a named export so call sites read clearly.
 */
export function cleanThesisLine(raw: string | undefined | null): string | undefined {
  const cleaned = cleanActivePageText(raw);
  return cleaned.length > 0 ? cleaned : undefined;
}

// ---------------------------------------------------------------------------
// Header / title-line detector — used by the anchor grounding layer to REJECT
// running-header / title / page-number lines as anchor candidates, so the left
// panel never highlights "The Chemical Context of Life 29" as a thesis.
// ---------------------------------------------------------------------------

const KEYWORD_HEADER_RE =
  /\b(?:CHAPTER|UNIT|SECTION|MODULE|PART|APPENDIX|LESSON)\b\s*\d/i;

/**
 * True when a candidate line/sentence looks like a running header, chapter/unit
 * title, page-number artifact, or title-only line rather than body prose.
 *
 * Heuristics (any one triggers):
 *  - explicit CHAPTER/UNIT/SECTION + number marker
 *  - title-case phrase with an embedded standalone page number ("Title Words 29 Body")
 *  - very short line dominated by Title-Case words with no sentence punctuation (title-only)
 *  - line is mostly digits / a bare page number
 */
export function isLikelyHeaderLine(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t) return true;

  if (KEYWORD_HEADER_RE.test(t)) return true;

  // Title phrase + embedded page number + body start, e.g. "Cellular Respiration 412 During..."
  if (/^(?:(?:[A-Z][A-Za-z'’-]+|of|the|and|in|on|to|for|with|a|an|&)\s+){1,9}\d{1,4}\s+[A-Z]/.test(t)) {
    return true;
  }

  // Bare page number or number-dominated fragment.
  const digits = (t.match(/\d/g) ?? []).length;
  if (digits > 0 && digits / t.replace(/\s/g, "").length > 0.4) return true;

  const words = t.split(/\s+/);
  const hasSentencePunct = /[.!?:;]/.test(t);

  // Title-only line: short, no sentence punctuation, mostly capitalized words.
  if (words.length >= 2 && words.length <= 8 && !hasSentencePunct) {
    const titleCase = words.filter((w) => /^[A-Z][A-Za-z'’-]*$/.test(w) || /^[A-Z]{2,}$/.test(w)).length;
    if (titleCase / words.length >= 0.7) return true;
  }

  return false;
}
