// lib/toc/boilerplateFilter.ts
// Rejects strings that should never appear as book titles or chapter titles.
//
// The extraction pipeline often picks up publisher footers, addresses,
// copyright statements, ISBN lines, and repeated running-header artifacts.
// This module provides deterministic, pattern-based rejection so those
// strings never surface in the TOC or Learning Hub.
//
// Usage:
//   isBoilerplate("3251 Riverport Lane")  → true  (publisher address)
//   isBoilerplate("Chapter 1 — Diagnosis") → false (valid title)

// ---------------------------------------------------------------------------
// Rejection patterns
// ---------------------------------------------------------------------------

/** Street-address indicators: "3251 Riverport Lane", "1600 Amphitheatre Pkwy" */
const ADDRESS_RE = /\b\d{2,6}\s+[A-Z][a-zA-Z]+\s+(Lane|Ave(?:nue)?|Blvd|Boulevard|Drive|Dr|Road|Rd|Street|St|Way|Pkwy|Parkway|Circle|Ct|Court|Place|Pl|Suite|Floor|Room)\b/i;

/** US state + zip: "St. Louis, Missouri 63043" */
const STATE_ZIP_RE = /\b(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming)\s*\d{5}\b/i;

/** PO Box */
const PO_BOX_RE = /\bP\.?O\.?\s+Box\s+\d+/i;

/** ISBN-10 / ISBN-13 (including short fragments like "ISBN 978-0") */
const ISBN_RE = /\bISBN[-–]?(10|13)?:?\s*[\d\-X]{4,17}/i;

/** Common copyright / legal boilerplate */
const COPYRIGHT_RE = /©|\bAll rights reserved\b|\bCopyright\b/i;

/** URL patterns */
const URL_RE = /https?:\/\/|www\.[a-z0-9]/i;

/** Publisher contact / helpdesk lines */
const PUBLISHER_CONTACT_RE =
  /\b(permissions@|rights@|elsevier\.com|mosby\.com|saunders\.com|wolters\s*kluwer|lippincott|mcgraw.?hill|wiley\.com|springer\.com|thieme\.com|lww\.com|oup\.com)\b/i;

/** Repeated footer text patterns (partial list; extended by frequency analysis) */
const FOOTER_KEYWORD_RE =
  /\b(downloaded from|printed by|all reproduction rights|for personal use only|not for commercial|permissions may be sought|permission from the publisher|republication or redistribution|uncorrected proof|advance access publication)\b/i;

/** Pure page numbers / running headers that are just numerals */
const PAGE_NUMBER_ONLY_RE = /^\d+$/;

/** Lines that are clearly bibliographic / reference list entries */
const REFERENCE_RE = /^\d+\.\s+[A-Z][a-z]+,?\s+[A-Z][\w.]+[\s,]/;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/** Minimum meaningful character count for any title */
const MIN_TITLE_LENGTH = 3;
/** Maximum — very long strings are usually paragraphs, not titles */
const MAX_TITLE_LENGTH = 200;

/**
 * Returns true when the string is a boilerplate artifact that should be
 * rejected as a book title or chapter title candidate.
 */
export function isBoilerplate(text: string): boolean {
  const t = text.trim();
  if (t.length < MIN_TITLE_LENGTH) return true;
  if (t.length > MAX_TITLE_LENGTH) return true;

  if (PAGE_NUMBER_ONLY_RE.test(t)) return true;
  if (ADDRESS_RE.test(t))          return true;
  if (STATE_ZIP_RE.test(t))        return true;
  if (PO_BOX_RE.test(t))           return true;
  if (ISBN_RE.test(t))             return true;
  if (COPYRIGHT_RE.test(t))        return true;
  if (URL_RE.test(t))              return true;
  if (PUBLISHER_CONTACT_RE.test(t)) return true;
  if (FOOTER_KEYWORD_RE.test(t))   return true;
  if (REFERENCE_RE.test(t))        return true;

  return false;
}

// ---------------------------------------------------------------------------
// Book-title candidate scoring
// ---------------------------------------------------------------------------

/**
 * Scores a candidate string for likelihood of being a real book title.
 * Higher = more likely a genuine title. Returns 0 for anything that passes
 * `isBoilerplate`.
 *
 * Scale: 0 (reject) → 10 (very confident)
 */
export function scoreTitleCandidate(text: string): number {
  if (isBoilerplate(text)) return 0;
  const t = text.trim();
  let score = 5; // baseline

  // Boost: looks like a structured title (Title Case or ALL CAPS short)
  const words = t.split(/\s+/);
  const titleCaseWords = words.filter((w) => /^[A-Z][a-z]/.test(w)).length;
  if (titleCaseWords / words.length >= 0.6) score += 2;
  if (/^[A-Z0-9\s:,\-'().]+$/.test(t) && t.length <= 80) score += 1;

  // Boost: common book-title patterns
  if (/^(Essentials?|Fundamentals?|Principles?|Clinical|Review|Atlas|Manual|Introduction|Guide|Handbook)\b/i.test(t)) score += 2;
  if (/\b(Edition|Vol\.|Volume|Textbook)\b/i.test(t)) score -= 1; // edition lines are metadata, not titles

  // Penalise: suspiciously short OR suspiciously long
  if (t.length < 10) score -= 2;
  if (t.length > 120) score -= 3;

  // Penalise: looks like a sentence (verb + object)
  if (words.length > 12) score -= 1;

  return Math.max(0, Math.min(10, score));
}

// ---------------------------------------------------------------------------
// Filter arrays
// ---------------------------------------------------------------------------

/**
 * Remove boilerplate entries from a list of title candidates, returning the
 * survivors in their original order.
 */
export function filterBoilerplate(candidates: string[]): string[] {
  return candidates.filter((c) => !isBoilerplate(c));
}

/**
 * Pick the best book-title candidate from a scored list.
 * Returns null if no candidate passes the boilerplate check.
 */
export function pickBestTitle(candidates: string[]): string | null {
  const scored = candidates
    .map((c) => ({ text: c, score: scoreTitleCandidate(c) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.text ?? null;
}
