// lib/insights/inferConceptTitle.ts
// Produces clean 2–7 word semantic labels from raw concept inputs.
// Rejects OCR artifacts, page numbers, sentence fragments, and bad openers.

// Leading OCR numbers: "80 ", "3.2 ", "1) ", etc.
const OCR_NUMBER_PREFIX = /^\d{1,4}[\s.):\-]+/;

// Clause/discourse starters — signal a fragment subordinate to something else, not a concept label
const BAD_OPENER_RE =
  /^(when |thus |however |rather than |although |whereas |while |unless |if |because |therefore |yet |but |except |so |now |and |or |also |since |as the |for the |in fact |in other words |as such |moreover |furthermore |in addition |additionally |consequently |nevertheless )/i;

// Trailing function words that create dangling prepositions or articles at end of label
const TRAILING_FUNCTION_RE =
  /\s+(of|a|an|the|with|for|in|to|and|or|by|from|on|at|as|that|which|this|these|those|its|their|into|about|between|within|through|during)$/i;

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

/**
 * Strip trailing prepositions/articles recursively, then stop before any
 * gerund that introduces a direct object ("Story Conducting A…" → "Story").
 * This prevents truncated sentence fragments from ending with dangling words.
 */
function cleanTrimmedLabel(text: string): string {
  // Recursive trailing function-word strip
  let result = text.trim();
  const seen = new Set<string>();
  while (!seen.has(result)) {
    seen.add(result);
    result = result.replace(TRAILING_FUNCTION_RE, "").trim();
  }
  // Stop before a gerund that takes a determiner object: "X Conducting A…" → "X"
  const gerundCut = result.match(/^(.*?\w)\s+\w+ing\s+(?:a|an|the|this|these|those)\b/i);
  if (gerundCut?.[1] && wordCount(gerundCut[1]) >= 2) {
    result = gerundCut[1].trim();
  }
  return result;
}

// Structural noise words that should never be the main word in a concept label
const STRUCTURAL_NOISE_RE = /^(example|figure|fig|table|box|section|chapter|exercise|problem|solution|introduction|key concept|the function|case \d)/i;

// Content-poor second words that produce semantically empty 2-word combos ("Water Another")
const CONTENT_POOR_SECOND_WORD_RE = /^(another|other|such|certain|various|more|less|former|latter|fact|also|only|many|much|few|some|both|each|every|either|neither)$/i;

function isCleanLabel(text: string): boolean {
  const t = text.trim();
  const wc = wordCount(t);
  if (wc < 2 || wc > 7) return false;
  if (t.length < 4 || t.length > 60) return false;
  if (BAD_OPENER_RE.test(t)) return false;
  // OCR artifact: multiple isolated uppercase single letters ("The Function R S N D")
  if ((t.match(/\b[A-Z]\b/g) ?? []).length >= 2) return false;
  // Structural noise labels that are never semantic concepts
  if (STRUCTURAL_NOISE_RE.test(t)) return false;
  // Reject 2-word titles where second word is content-poor ("Water Another", "Process Various")
  if (wc === 2) {
    const secondWord = t.trim().split(/\s+/)[1] ?? "";
    if (CONTENT_POOR_SECOND_WORD_RE.test(secondWord)) return false;
  }
  return true;
}

function tryClean(raw: string): string | null {
  const stripped = stripOcrPrefix(raw.trim());
  if (isCleanLabel(stripped)) return stripped;

  // Strip bad opener and re-check
  if (BAD_OPENER_RE.test(stripped)) {
    const peeled = stripped.replace(BAD_OPENER_RE, "").trim();
    if (isCleanLabel(peeled)) return peeled;
    const trimmedPeeled = cleanTrimmedLabel(trimToLabel(peeled, 6));
    if (isCleanLabel(trimmedPeeled)) return trimmedPeeled;
  }

  // Too long — trim and clean
  if (wordCount(stripped) > 7) {
    const trimmed = cleanTrimmedLabel(trimToLabel(stripped, 6));
    if (isCleanLabel(trimmed)) return trimmed;
  }

  return null;
}

function extractFromAnchor(anchorText: string): string | null {
  const t = anchorText.trim();

  // Colon prefix: "Keratinocytes: the surface cells of the epidermis"
  const colonMatch = t.match(/^([^:]{4,55}):/);
  if (colonMatch?.[1]) {
    const candidate = cleanTrimmedLabel(stripOcrPrefix(colonMatch[1].trim()));
    if (isCleanLabel(candidate)) return candidate;
  }

  // First phrase before comma or semicolon — most reliable boundary
  const firstPhrase = t.split(/[,;]/)[0]?.trim();
  if (firstPhrase && firstPhrase.length >= 6 && !BAD_OPENER_RE.test(firstPhrase)) {
    const wc = wordCount(firstPhrase);
    if (wc >= 2 && wc <= 7) {
      const cleaned = cleanTrimmedLabel(firstPhrase);
      if (isCleanLabel(cleaned)) return cleaned;
    }
    if (wc > 7) {
      const trimmed = cleanTrimmedLabel(trimToLabel(firstPhrase, 6));
      if (isCleanLabel(trimmed)) return trimmed;
    }
  }

  // First 5 words of anchor if no bad opener
  if (!BAD_OPENER_RE.test(t)) {
    const trimmed = cleanTrimmedLabel(trimToLabel(t, 5));
    if (isCleanLabel(trimmed)) return trimmed;
  }

  return null;
}

/**
 * Infers a clean 2–7 word concept label.
 *
 * Priority: headingText → definition-subject extraction → cleaned anchor phrases → null fallback.
 */
export function inferConceptTitle(
  anchorText: string,
  headingText?: string
): string {
  // 1. Heading is the strongest signal
  if (headingText?.trim()) {
    const fromHeading = tryClean(headingText.trim());
    if (fromHeading) return titleCase(fromHeading);
    // Heading exists but is long — trim and clean aggressively
    const trimmedHeading = cleanTrimmedLabel(trimToLabel(stripOcrPrefix(headingText.trim()), 6));
    if (isCleanLabel(trimmedHeading)) return titleCase(trimmedHeading);
  }

  // 2. Definition-subject pattern: "Atomic number is the number of protons" → "Atomic Number"
  // Matches: capitalized term (1–4 words) immediately followed by a linking verb.
  // This fires for biology/chemistry/physics definitional sentences before falling back
  // to generic phrase extraction which tends to grab clause fragments.
  const defSubject = extractDefinitionSubject(anchorText);
  if (defSubject) return titleCase(defSubject);

  // 3. Derive from anchor sentence (generic phrase extraction)
  const fromAnchor = extractFromAnchor(anchorText);
  if (fromAnchor) return titleCase(fromAnchor);

  // 4. Last resort: extract the first 2 meaningful words from the anchor
  // Apply cleanTrimmedLabel + content-poor check to avoid garbage like "Water Another".
  const meaningfulWords = anchorText.trim().split(/\s+/).filter((w) => w.length >= 4);
  const firstMeaningfulWords = cleanTrimmedLabel(meaningfulWords.slice(0, 2).join(" "));
  if (isCleanLabel(firstMeaningfulWords)) return titleCase(firstMeaningfulWords);

  return "Core Idea";
}

/**
 * Extracts the grammatical subject from a "Subject is/are/refers to..." sentence.
 * Returns null if the pattern doesn't match cleanly.
 *
 * Examples:
 *   "Atomic number is the count of protons"  → "Atomic Number"
 *   "Isotopes are variants of an element"    → "Isotopes"
 *   "Mass number equals protons plus neutrons" → "Mass Number"
 */
function extractDefinitionSubject(text: string): string | null {
  const t = text.trim();

  // Comma-relative pattern: "osmosis, which is..." → "Osmosis"
  const commaRel = t.match(/^([A-Za-z][a-zA-Z\s-]{2,30}),\s+which\s+(?:is\b|are\b|was\b|were\b)/);
  if (commaRel) {
    const subj = commaRel[1].trim();
    if (wordCount(subj) >= 1 && wordCount(subj) <= 4 && !BAD_OPENER_RE.test(subj)
        && !/^(the|a|an|this|that|these|those|it|they|he|she|we|you|i)$/i.test(subj)) {
      return subj;
    }
  }

  // Match up to 4 capitalized/lowercase words before a copular verb
  const m = t.match(
    /^([A-Za-z][a-zA-Z]*(?:\s+[a-zA-Z][a-zA-Z]*){0,3})\s+(?:is\b|are\b|was\b|were\b|refers?\s+to\b|equals?\b|means?\b|defined\s+as\b|describes?\b)/
  );
  if (!m) return null;
  const subject = m[1].trim();
  const wc = wordCount(subject);
  // Accept 1–3 word subjects; lowercase allowed if short and non-pronoun
  if (wc < 1 || wc > 4) return null;
  if (wc === 1 && /^[a-z]/.test(subject) && subject.length < 5) return null; // too short to be meaningful
  if (BAD_OPENER_RE.test(subject)) return null;
  // Reject plain pronouns and articles
  if (/^(the|a|an|this|that|these|those|it|they|he|she|we|you|i)$/i.test(subject)) return null;
  return subject;
}
