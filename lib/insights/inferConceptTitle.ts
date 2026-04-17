// lib/insights/inferConceptTitle.ts
// Produces clean 2–7 word semantic labels from raw concept inputs.
// Rejects OCR artifacts, page numbers, sentence fragments, and bad openers.

// Leading OCR numbers: "80 ", "3.2 ", "1) ", etc.
const OCR_NUMBER_PREFIX = /^\d{1,4}[\s.):\-]+/;

// Clause/discourse starters — signal a fragment subordinate to something else, not a concept label
const BAD_OPENER_RE =
  /^(when |thus |however |rather than |although |whereas |while |unless |if |because |therefore |yet |but |except |so |now |and |or |also |since |as the |for the )/i;

function titleCase(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => (!w ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

function stripOcrPrefix(text: string): string {
  return text.replace(OCR_NUMBER_PREFIX, "").trim();
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).length;
}

function trimToLabel(text: string, maxWords = 6): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();
  return words.slice(0, maxWords).join(" ");
}

function isCleanLabel(text: string): boolean {
  const t = text.trim();
  const wc = wordCount(t);
  return (
    wc >= 2 &&
    wc <= 7 &&
    t.length >= 4 &&
    t.length <= 60 &&
    !BAD_OPENER_RE.test(t)
  );
}

function tryClean(raw: string): string | null {
  const stripped = stripOcrPrefix(raw.trim());
  if (isCleanLabel(stripped)) return stripped;

  // Strip bad opener and re-check
  if (BAD_OPENER_RE.test(stripped)) {
    const peeled = stripped.replace(BAD_OPENER_RE, "").trim();
    if (isCleanLabel(peeled)) return peeled;
    const trimmedPeeled = trimToLabel(peeled, 6);
    if (isCleanLabel(trimmedPeeled)) return trimmedPeeled;
  }

  // Too long — trim and re-check
  if (wordCount(stripped) > 7) {
    const trimmed = trimToLabel(stripped, 6);
    if (isCleanLabel(trimmed)) return trimmed;
  }

  return null;
}

function extractFromAnchor(anchorText: string): string | null {
  const t = anchorText.trim();

  // Colon prefix: "Keratinocytes: the surface cells of the epidermis"
  const colonMatch = t.match(/^([^:]{4,55}):/);
  if (colonMatch?.[1]) {
    const candidate = stripOcrPrefix(colonMatch[1].trim());
    if (isCleanLabel(candidate)) return candidate;
  }

  // First phrase before comma or semicolon
  const firstPhrase = t.split(/[,;]/)[0]?.trim();
  if (firstPhrase && firstPhrase.length >= 6 && !BAD_OPENER_RE.test(firstPhrase)) {
    const wc = wordCount(firstPhrase);
    if (wc >= 2 && wc <= 7) return firstPhrase;
    if (wc > 7) {
      const trimmed = trimToLabel(firstPhrase, 6);
      if (isCleanLabel(trimmed)) return trimmed;
    }
  }

  // First 5 words of anchor if no bad opener
  if (!BAD_OPENER_RE.test(t)) {
    const trimmed = trimToLabel(t, 5);
    if (isCleanLabel(trimmed)) return trimmed;
  }

  return null;
}

/**
 * Infers a clean 2–7 word concept label.
 *
 * Priority: headingText → cleaned anchor-derived phrases → "Key Concept" fallback.
 */
export function inferConceptTitle(
  anchorText: string,
  headingText?: string
): string {
  // 1. Heading is the strongest signal
  if (headingText?.trim()) {
    const fromHeading = tryClean(headingText.trim());
    if (fromHeading) return titleCase(fromHeading);
    // Heading exists but is long — trim aggressively
    const trimmedHeading = trimToLabel(stripOcrPrefix(headingText.trim()), 6);
    if (isCleanLabel(trimmedHeading)) return titleCase(trimmedHeading);
  }

  // 2. Derive from anchor sentence
  const fromAnchor = extractFromAnchor(anchorText);
  if (fromAnchor) return titleCase(fromAnchor);

  return "Key Concept";
}
