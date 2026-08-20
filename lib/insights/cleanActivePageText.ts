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
// [^.\n] (not just [^.]) so these never reach across a paragraph break inserted
// by the geometry-based page text reconstruction.
const FOOTER_DEBRIS_RE =
  /\b(?:Copyright\b[^.\n]*\.?|©\s*\d{0,4}[^.\n]*\.?|All rights reserved[^.\n]*\.?|Cengage Learning[^.\n]*\.?|Pearson Education[^.\n]*\.?|McGraw[-\s]?Hill[^.\n]*\.?|ISBN[-\s:]*[\dX\- ]+|Printed in (?:the )?U\.?S\.?A?\.?|No part of this (?:work|book)[^.\n]*\.?|may not be (?:copied|scanned|duplicated)[^.\n]*\.?)/gi;

// Figure / table caption fragments: "Figure 3.2 The ATP structure." — a number followed
// by an optional short title phrase. Only strips when followed by a terminal period so
// we don't accidentally eat mid-sentence "see Figure 3.2" references.
const FIGURE_CAPTION_RE =
  /\b(?:Figure|FIGURE|Fig\.|Table|TABLE|Photo|PHOTO|Illustration|ILLUSTRATION)\s+\d+[\.\-]?\d*(?:\s+[A-Z▲►][^.?!\n]{0,140})?[.]/g;

// Checkpoint / review section markers — these are section headings, NOT body prose.
const CHECKPOINT_MARKER_RE =
  /\b(?:Check(?:\s+Your)?\s+Understanding|Concept\s+Check|Review\s+Questions?|Chapter\s+(?:Summary|Review)|Self[\s-]?Test|Quick\s+Check|Think\s+About\s+It|Critical\s+Thinking|Did\s+You\s+Know\??)\b[^.\n]*\./gi;

// All-caps callout/sidebar labels that prefix a box element, not body prose.
const CALLOUT_LABEL_RE =
  /\b(?:KEY\s+CONCEPTS?|LEARNING\s+OBJECTIVES?|DID\s+YOU\s+KNOW|QUICK\s+CHECK|KEY\s+TERMS?|IMPORTANT\s+TERMS?)\b\s*/g;

/**
 * Merge PDF drop-cap OCR artifacts where a lone capital letter appears as its own
 * text span, separated from the rest of the word.
 * Example: "T he cell cycle" → "The cell cycle", "C ellular respiration" → "Cellular respiration"
 *
 * A genuine drop cap is only ever the ornamental FIRST letter of a paragraph/
 * sentence, extracted as its own text span — never a letter appearing mid-
 * sentence. Two safeguards keep this from colliding with ordinary prose that
 * happens to contain an isolated capital letter (previously a real bug: "A
 * patient with diabetes" -> "Apatient...", "Vitamin B complex" ->
 * "Vitamin Bcomplex", "Group A streptococcus" -> "Group Astreptococcus" —
 * these corrupted the text sent to the annotation model while grounding kept
 * checking the ORIGINAL raw text, so a faithfully-quoted annotation would
 * silently fail to ground and get dropped):
 *  1. "A" is never merged (matching the existing "I" exclusion) — it is
 *     already a complete, valid standalone word (the indefinite article)
 *     whether or not it was drop-capped, so merging it can only ever be
 *     wrong. This alone covers the article and the common classifier case
 *     ("Group A ...", "Type A ...", "Grade A ...").
 *  2. Every other letter is only merged at a genuine paragraph/sentence
 *     start — the start of the text, immediately after a newline, or
 *     immediately after sentence-ending punctuation — never after an
 *     ordinary preceding word. This is what keeps single-letter classifiers
 *     mid-sentence ("Vitamin B complex", "Type B diabetes", "Hepatitis C
 *     infection") untouched: those letters are preceded by a plain
 *     classifier word, not a sentence boundary.
 */
export function normalizeDropCaps(text: string): string {
  if (!text) return text;
  // Capital (not A, not I) + space + 2+ lowercase chars, only at a paragraph/
  // sentence-start position, that together form a word.
  return text.replace(
    /(?<=^|\n|[.!?]["'’”]?\s)([B-HJ-Z]) ([a-z]{2,})(?![a-z])/g,
    (_, letter, rest) => letter + rest,
  );
}

export interface CleanActivePageTextOptions {
  /**
   * Strip Figure/Table/Photo/Illustration caption fragments. Default true —
   * the existing behavior for synthesis input and left-panel anchor
   * grounding, where a caption fragment surfacing as a "thesis" would be
   * wrong. Current Page speech passes false: a figure or table caption can
   * carry real instructional content (a clinically relevant description, a
   * data table) and should be read aloud, not silently dropped just
   * because it's structurally a caption.
   */
  stripFigureCaptions?: boolean;
}

/**
 * Clean a single active page's raw text for synthesis, anchor grounding, or
 * read-aloud. Strips page numbers, UNIT/chapter/title running headers, and
 * copyright/footer debris. Keeps body paragraphs, section headings, and
 * equation/math lines.
 *
 * @param raw     the raw extracted page text
 * @param tag     optional source tag for the [TEXT_CLEANED] log (e.g. "synth", "ground")
 * @param options see CleanActivePageTextOptions
 */
export function cleanActivePageText(
  raw: string | undefined | null,
  tag?: string,
  options: CleanActivePageTextOptions = {},
): string {
  if (!raw) return "";
  const { stripFigureCaptions = true } = options;

  const original = raw;

  let t = raw
    .replace(/\u00A0/g, " ")  // non-breaking space
    .replace(/[ \t]+/g, " ")
    .trim();

  // Merge PDF drop-cap OCR artifacts before any other processing
  t = normalizeDropCaps(t);

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

  // \u2500\u2500 Second pass: non-instructional fragments \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  // Strip figure/table captions, checkpoint markers, and callout labels that
  // appear inline after PDF text joining. Collect removed spans for diagnostics.
  const rejectedFragments: Array<{ reason: string; fragment: string }> = [];

  if (stripFigureCaptions) {
    t = t.replace(FIGURE_CAPTION_RE, (match) => {
      rejectedFragments.push({ reason: "figure/table caption", fragment: match.slice(0, 80) });
      return " ";
    });
  }

  t = t.replace(CHECKPOINT_MARKER_RE, (match) => {
    rejectedFragments.push({ reason: "checkpoint/review marker", fragment: match.slice(0, 80) });
    return " ";
  });

  t = t.replace(CALLOUT_LABEL_RE, (match) => {
    rejectedFragments.push({ reason: "callout/sidebar label", fragment: match.slice(0, 60) });
    return " ";
  });

  if (tag && rejectedFragments.length > 0) {
    console.log("[RP_REJECTED_SOURCE]", {
      tag,
      count: rejectedFragments.length,
      fragments: rejectedFragments,
    });
  }

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

// Section-number heading: "2.1 Limits of Sequences", "3.1.2 The Chain Rule"
// These are section titles — the heading itself should not be a highlight anchor;
// the body text below it should be.
const SECTION_NUMBER_HEADING_RE = /^\d+\.\d+(\.\d+)?\s+[A-Z]/;

// Concept/Example/Definition/Theorem label lines: "Concept 2.2", "Example 3.1", "Figure 4.2"
// These are structural labels, never body evidence.
const STRUCTURAL_LABEL_RE =
  /^(?:Concept|Example|Definition|Theorem|Lemma|Corollary|Proposition|Figure|Table|Box|Exhibit|Case|Step)\s+\d+/i;

// Copyright / footer fragment that somehow survived earlier stripping
const FOOTER_LINE_RE =
  /all rights reserved|copyright\s*©?|\bisbn\b|published by|printed in|access for free|openstax\.org|cengage\.|mcgraw.?hill|pearson|www\.\S+\.\w{2,}/i;

/**
 * True when a candidate line/sentence looks like a running header, chapter/unit
 * title, section number, structural label, page-number artifact, footer line, or
 * title-only line rather than body prose.
 *
 * Heuristics (any one triggers):
 *  - explicit CHAPTER/UNIT/SECTION + number marker
 *  - section number heading ("2.1 Limits of Sequences")
 *  - structural label ("Concept 2.2", "Example 3.1", "Figure 4.2")
 *  - footer/copyright fragment
 *  - title-case phrase with an embedded standalone page number ("Title Words 29 Body")
 *  - very short line dominated by Title-Case words with no sentence punctuation
 *  - line is mostly digits / a bare page number
 */
export function isLikelyHeaderLine(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t) return true;

  if (KEYWORD_HEADER_RE.test(t)) return true;
  if (SECTION_NUMBER_HEADING_RE.test(t)) return true;
  if (STRUCTURAL_LABEL_RE.test(t)) return true;
  if (FOOTER_LINE_RE.test(t)) return true;

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

// ---------------------------------------------------------------------------
// Region-role classification — stabilization item 4C-1 (Canonical Page Map
// foundation). Everything above this point answers "keep or strip" (binary).
// classifyLineRole() answers "what IS this line" for a per-sentence span,
// so a caller can retain non-body spans (tagged, not deleted) instead of
// silently dropping them — exactly what lib/pdf/canonicalPageMap.ts needs to
// enumerate a full page (a future Highlight Coverage Auditor must be able to
// say "this sentence is a figure caption, correctly not highlighted," not
// just "this sentence disappeared somewhere").
//
// Reuses the SAME regexes above rather than inventing a second taxonomy —
// this is a naming/retention pass over already-proven detection logic, not
// new heuristics. FIGURE_CAPTION_RE/CHECKPOINT_MARKER_RE/CALLOUT_LABEL_RE/
// FOOTER_DEBRIS_RE all carry the `g` flag (needed for their original
// replace() use above) — RegExp.test() on a `g`-flagged regex is STATEFUL
// (it advances lastIndex and resumes from there on the next call), so
// reusing those exact objects for repeated per-sentence test() calls would
// silently give wrong answers after the first match. Each gets a
// non-global clone, built once at module load from the same .source, so
// there is exactly one place that ever needs to change if the pattern does.
// ---------------------------------------------------------------------------

function nonGlobal(re: RegExp): RegExp {
  return new RegExp(re.source, re.flags.replace("g", ""));
}

const FIGURE_CAPTION_TEST_RE = nonGlobal(FIGURE_CAPTION_RE);
const CHECKPOINT_MARKER_TEST_RE = nonGlobal(CHECKPOINT_MARKER_RE);
const CALLOUT_LABEL_TEST_RE = nonGlobal(CALLOUT_LABEL_RE);

export type RegionRole =
  | "body"
  | "heading"
  | "figure-table-caption"
  | "checkpoint-review"
  | "callout-label"
  | "page-furniture";

/**
 * Classifies a single sentence-like span (trimmed text, no surrounding
 * context) into a RegionRole. Order matters: the more specific, distinctly-
 * tagged categories are checked before the coarser isLikelyHeaderLine
 * catch-all, so e.g. a full "Figure 4.2 The ATP structure." caption is
 * tagged figure-table-caption rather than falling into the generic
 * "heading" bucket merely because a bare structural-label pattern would
 * also match its "Figure 4.2" prefix.
 *
 * Page-level classification (is this WHOLE PAGE a table of contents / front
 * matter?) is a different granularity and already has its own AI-assigned
 * system (InstructionalPageRole in lib/insights/pageAnnotationPlan.ts) —
 * out of scope here by design, not an oversight.
 */
export function classifyLineRole(text: string): RegionRole {
  const t = (text ?? "").trim();
  if (!t) return "page-furniture";

  if (CHECKPOINT_MARKER_TEST_RE.test(t)) return "checkpoint-review";
  if (CALLOUT_LABEL_TEST_RE.test(t)) return "callout-label";
  if (FIGURE_CAPTION_TEST_RE.test(t)) return "figure-table-caption";
  if (KEYWORD_HEADER_RE.test(t) || SECTION_NUMBER_HEADING_RE.test(t) || STRUCTURAL_LABEL_RE.test(t)) return "heading";
  if (isLikelyHeaderLine(t)) return "page-furniture";
  return "body";
}
