/**
 * textCleanup.ts
 *
 * Conservative text cleanup helpers for page-story v2.
 *
 * Goals:
 * - repair PDF/OCR line-wrap hyphen splits
 * - remove soft hyphens
 * - normalize whitespace
 * - reject obviously broken output
 * - preserve complete sentences only
 *
 * Important:
 * - prefer dropping weak text over emitting broken text
 * - do not aggressively rewrite content semantics
 */

const MIN_COMPLETE_SENTENCE_LENGTH = 20;

export function repairSoftHyphens(text: string): string {
  return text.replace(/\u00ad/g, "");
}

export function repairLineWrapHyphens(text: string): string {
  // Example:
  // "com-\nplete" -> "complete"
  // "diag- nostic" -> "diagnostic"
  return text.replace(/([A-Za-z])-\s+([A-Za-z])/g, "$1$2");
}

export function normalizeQuotes(text: string): string {
  return text
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'");
}

export function normalizeDashes(text: string): string {
  return text
    .replace(/[–—]/g, "-")
    .replace(/\s*-\s*/g, " - ");
}

export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function stripControlArtifacts(text: string): string {
  return text
    .replace(/\f/g, " ")
    .replace(/\r/g, " ")
    .replace(/\t/g, " ");
}

export function removeSpaceBeforePunctuation(text: string): string {
  return text.replace(/\s+([,.;:!?])/g, "$1");
}

export function normalizeParenthesisSpacing(text: string): string {
  return text
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")");
}

export function cleanBlockText(text: string): string {
  return collapseWhitespace(
    normalizeParenthesisSpacing(
      removeSpaceBeforePunctuation(
        normalizeDashes(
          normalizeQuotes(
            repairLineWrapHyphens(
              repairSoftHyphens(
                stripControlArtifacts(text)
              )
            )
          )
        )
      )
    )
  );
}

export function splitIntoSentences(text: string): string[] {
  const cleaned = cleanBlockText(text);
  if (!cleaned) return [];

  // Conservative split:
  // split after punctuation when next token likely starts a new sentence
  const parts = cleaned
    .split(/(?<=[.?!:])\s+(?=[A-Z0-9(\["'])/)
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length ? parts : [cleaned];
}

export function startsLikeSentence(text: string): boolean {
  const t = cleanBlockText(text);
  if (!t) return false;
  return /^[A-Z0-9(\["']/.test(t);
}

export function endsLikeSentence(text: string): boolean {
  const t = cleanBlockText(text);
  if (!t) return false;
  return /[.?!:]$/.test(t);
}

export function isCompleteSentence(text: string): boolean {
  const t = cleanBlockText(text);

  if (!t) return false;
  if (t.length < MIN_COMPLETE_SENTENCE_LENGTH) return false;
  if (!/[A-Za-z]/.test(t)) return false;
  if (!startsLikeSentence(t)) return false;
  if (!endsLikeSentence(t)) return false;

  return true;
}

export function completeSentenceOrNull(text: string): string | null {
  const cleaned = cleanBlockText(text);
  return isCompleteSentence(cleaned) ? cleaned : null;
}

export function uniqueNormalizedStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    const cleaned = cleanBlockText(value);
    if (!cleaned) continue;

    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(cleaned);
  }

  return out;
}

export function repairBrokenSentenceSequence(text: string): string {
  const cleaned = cleanBlockText(text);
  if (!cleaned) return "";

  // Joins likely accidental sentence fractures such as:
  // "This is important. because..." -> "This is important because..."
  return cleaned
    .replace(/([a-z0-9])\.\s+(because|which|that|who|where|when)\b/gi, "$1 $2")
    .replace(/([a-z0-9])\.\s+(and|but|or)\b/gi, "$1 $2");
}

export function extractCompleteSentences(text: string): string[] {
  return uniqueNormalizedStrings(
    splitIntoSentences(repairBrokenSentenceSequence(text)).filter(isCompleteSentence)
  );
}

// Intro/label sentence patterns — these appear at the start of merged blocks and
// carry structural labels ("Introduction:", "Note:", "Figure 1:") rather than
// substantive content. We skip them and prefer the first non-label sentence.
const INTRO_LABEL_PATTERN =
  /^(introduction|note|figure|table|box|example|summary|overview|recall|key|definition|background|objective|purpose|goal|concept)\b/i;
// Short label-colon form: "Signal: X" or "Rule: Y" where the tail is a short fragment
const SHORT_LABEL_COLON = /^[A-Za-z][A-Za-z\s]{1,20}:\s*\S/;

function isIntroLabel(sentence: string): boolean {
  if (INTRO_LABEL_PATTERN.test(sentence)) return true;
  // Short label-colon where the total sentence is under 60 chars — likely a heading fragment
  if (SHORT_LABEL_COLON.test(sentence) && sentence.length < 60) return true;
  return false;
}

export function bestCompleteSentence(text: string): string | null {
  const sentences = extractCompleteSentences(text);
  if (!sentences.length) return null;

  // Prefer the first substantive sentence (skip structural intro/label sentences).
  // Fall back to sentences[0] if every sentence looks like a label.
  const substantive = sentences.find((s) => s.length >= 30 && !isIntroLabel(s));
  return substantive ?? sentences[0];
}

export function isLikelyNoiseText(text: string): boolean {
  const t = cleanBlockText(text);
  if (!t) return true;
  if (t.length < 3) return true;

  // only symbols/numbers or near-empty artifacts
  if (/^[\W_]+$/.test(t)) return true;
  if (/^[\d\s\-–—.,;:()]+$/.test(t)) return true;

  // common frontmatter/noise lines
  if (/^(page\s+\d+)$/i.test(t)) return true;
  if (/^(all rights reserved)$/i.test(t)) return true;
  if (/^(copyright)$/i.test(t)) return true;

  return false;
}

export function sentenceSafeSupport(texts: string[], limit = 3): string[] {
  return uniqueNormalizedStrings(
    texts
      .map(bestCompleteSentence)
      .filter((value): value is string => Boolean(value))
      .slice(0, limit)
  );
}

export function canonicalTextKey(text: string): string {
  return cleanBlockText(text).toLowerCase();
}
