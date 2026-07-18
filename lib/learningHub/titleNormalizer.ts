// lib/learningHub/titleNormalizer.ts
// Universal title normalization for the Learning Hub.
//
// Problem: raw PDF headings contain page numbers, OCR fragments, ALL-CAPS text,
// broken formula strings, and duplicated chapter numbers. Students should see
// clean learner-friendly titles, never raw parser output.
//
// Pipeline:
//   raw PDF heading → strip garbage → fix casing → classify hierarchy →
//   generate short title → compute confidence → DisplayTitle
//
// Builds on lib/page-intelligence/titleResolution.ts (sanitizeTitle) but adds
// hierarchy classification, confidence scoring, and short-title generation.

/* ─── Types ─────────────────────────────────────────────────────────────────── */

export type DisplayTitleSource = "toc" | "heading" | "bookmark" | "inferred";

export type HierarchyLevel =
  | "part"
  | "unit"
  | "chapter"
  | "section"
  | "subsection"
  | "unknown";

export type DisplayTitle = {
  /** Raw input, preserved verbatim for traceability */
  originalTitle:  string;
  /** Cleaned, human-readable title */
  cleanedTitle:   string;
  /**
   * Short version for cards and breadcrumbs (≤ 40 chars).
   * e.g. "Water and Life" instead of "Chapter 3 — Water and Life"
   */
  shortTitle:     string;
  /** 0–1: how confident we are that cleanedTitle is accurate */
  confidence:     number;
  source:         DisplayTitleSource;
  /** Detected structural level */
  level:          HierarchyLevel;
  /** Standardized prefix extracted from title (e.g. "Chapter 3", "Unit 5") */
  prefix?:        string;
  /** True when confidence is too low to display the title (use safe fallback) */
  useFallback:    boolean;
};

/* ─── OCR / garbage detection ────────────────────────────────────────────────── */

// Patterns that identify OCR garbage or broken formula fragments
const OCR_GARBAGE_RE =
  /^[A-Z0-9₁₂₃₄₅₆₇₈₉₀²³\s+\-=→←↔↑↓·•°±×÷∑∏∫√∞≈≠≤≥…]{1,60}$/ ;

// Chemical formula fragments (e.g. "2 H 2 1 O 2 2 H 2 O")
const FORMULA_FRAGMENT_RE =
  /\b\d+\s+[A-Z][a-z]?\s+\d+|\b[A-Z][a-z]?\s*\d+\s*[A-Z][a-z]?\s*\d+\b/;

// Patterns that signal a broken/fragment title
const BROKEN_TITLE_PREFIXES_RE =
  /^(figure|table|box|note that|for example|such as|in fact|another|these are|this is|the following|it is|there are|there is|we can|we use|one of|reactants|products|reaction)\b/i;

/**
 * Returns true if the title looks like OCR garbage, a formula fragment,
 * or a broken sentence fragment — not a real heading.
 */
function isOcrGarbage(raw: string): boolean {
  const t = raw.trim();
  if (t.length < 2) return true;
  if (FORMULA_FRAGMENT_RE.test(t)) return true;
  if (BROKEN_TITLE_PREFIXES_RE.test(t)) return true;
  // All-digits or all-symbols
  if (/^[\d\s\W]+$/.test(t)) return true;
  // Very short all-uppercase with only 1-2 tokens (e.g. "CH 3")
  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length <= 2 && t === t.toUpperCase() && !/chapter|unit|part|section/i.test(t)) {
    // Allow known prefixes
    if (!/^(CH|SEC|PT|UN)\s*\d+$/i.test(t)) return false; // these get handled by prefix detection
  }
  return false;
}

/* ─── Page-number stripping ──────────────────────────────────────────────────── */

/** True when the string is ONLY a prefix+number (e.g. "CH 3", "CHAPTER 4", "UNIT 5") */
function isPrefixOnlyTitle(raw: string): boolean {
  return /^(?:CHAPTER|CHAP|CH|UNIT|UN|PART|PT|SECTION|SEC)\s*\d+[A-Z]?\s*$/i.test(raw.trim());
}

function stripPageNumbers(raw: string): string {
  // If the entire title is a prefix+number ("CH 3", "CHAPTER 4"), don't touch it —
  // stripping the trailing number would destroy the only useful information.
  if (isPrefixOnlyTitle(raw)) return raw.trim();

  return raw
    // Leading page number: "27 Unit 5 …" → "Unit 5 …"
    .replace(/^\d{1,4}\s+/, "")
    // Trailing page number: "… DIVERSITY 552" → "… DIVERSITY"
    .replace(/\s+\d{1,4}$/, "")
    // Inline "page N" / "pg N"
    .replace(/\b(page|pg\.?|p\.)\s*\d+\b/gi, "")
    // Trailing separators + digits: "Biology — 12" → "Biology"
    .replace(/[\s\-:|]+\d{1,4}\s*$/, "")
    .trim();
}

/* ─── Hierarchy prefix detection ─────────────────────────────────────────────── */

type PrefixMatch = {
  kind:  HierarchyLevel;
  num:   string;      // e.g. "3", "5A", "II"
  label: string;      // e.g. "Chapter 3"
  rest:  string;      // remainder after the prefix
};

// Separator characters (space, colon, hyphen, en-dash, em-dash) consumed after prefix
const SEP_RE = /^[\s–—:–\-]+/;

const PREFIX_PATTERNS: Array<{ re: RegExp; kind: HierarchyLevel; label: (m: RegExpMatchArray) => string }> = [
  { re: /^(?:PART|PT\.?)\s*([0-9IVX]+)\b/i,    kind: "part",       label: m => `Part ${m[1]}`    },
  { re: /^(?:UNIT|UN\.?)\s*([0-9IVX]+)\b/i,    kind: "unit",       label: m => `Unit ${m[1]}`    },
  { re: /^(?:CHAPTER|CHAP\.?|CH\.?)\s*([0-9]+[A-Z]?)\b/i, kind: "chapter", label: m => `Chapter ${m[1]}` },
  { re: /^([0-9]+\.[0-9]+)\s/,                  kind: "subsection", label: m => `${m[1]}`         },
  { re: /^([0-9]+)\.\s+/,                       kind: "section",    label: m => `Section ${m[1]}` },
  { re: /^SECTION\s*([0-9]+)\b/i,               kind: "section",    label: m => `Section ${m[1]}` },
];

function detectPrefix(cleaned: string): PrefixMatch | null {
  for (const { re, kind, label } of PREFIX_PATTERNS) {
    const m = cleaned.match(re);
    if (m) {
      // Strip the matched prefix + any following separator characters
      const afterPrefix = cleaned.slice(m[0].length).replace(SEP_RE, "").trim();
      return {
        kind,
        num:   m[1] ?? "",
        label: label(m),
        rest:  afterPrefix,
      };
    }
  }
  return null;
}

/** True when `rest` looks like noise rather than a real topic */
function isNoisyRest(rest: string): boolean {
  if (!rest) return false;
  // Very short, uppercase-only abbreviation (e.g. "CH" left over after dedup)
  return rest.length <= 3 && rest === rest.toUpperCase() && /^[A-Z]+$/.test(rest);
}

/* ─── ALL-CAPS normalization ─────────────────────────────────────────────────── */

function toTitleCase(str: string): string {
  // Short words that stay lower-case (unless first)
  const LOWER = new Set([
    "a","an","the","and","but","or","nor","for","so","yet",
    "at","by","in","of","on","to","up","via","as","vs","vs.",
  ]);
  return str
    .toLowerCase()
    .replace(/[^\s-]+/g, (word, idx) => {
      if (idx === 0) return word.charAt(0).toUpperCase() + word.slice(1);
      if (LOWER.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    });
}

function fixCasing(str: string): string {
  if (!str) return str;
  // If it's entirely upper-case and has 2+ words, convert to title case
  const words = str.trim().split(/\s+/);
  const upperWords = words.filter(w => /^[A-Z]+$/.test(w) && w.length > 1);
  if (upperWords.length >= Math.ceil(words.length * 0.6)) {
    return toTitleCase(str);
  }
  return str;
}

/* ─── Duplicate-token removal ────────────────────────────────────────────────── */

function deduplicateTokens(str: string): string {
  // Remove immediately repeated word groups: "CH 3 CH 3" → "CH 3"
  return str.replace(/\b([A-Za-z0-9]+(?:\s+[A-Za-z0-9]+){0,3})\s+\1\b/gi, "$1").trim();
}

/* ─── Short title generation ─────────────────────────────────────────────────── */

function generateShortTitle(cleanedTitle: string, prefix: PrefixMatch | null): string {
  // If there's a prefix, the short title is the remainder (the topic part)
  const topic = prefix?.rest || cleanedTitle;
  if (!topic) return prefix?.label ?? cleanedTitle;
  // Trim to 40 chars at a word boundary
  if (topic.length <= 40) return topic;
  const words = topic.split(/\s+/);
  let short = "";
  for (const word of words) {
    if ((short + " " + word).trim().length > 40) break;
    short = (short + " " + word).trim();
  }
  return short || topic.slice(0, 40).trim();
}

/* ─── Confidence scoring ─────────────────────────────────────────────────────── */

function scoreConfidence(
  originalTitle:  string,
  cleanedTitle:   string,
  wasGarbage:     boolean,
  prefix:         PrefixMatch | null,
  hadNoisyRest:   boolean = false,
): number {
  if (wasGarbage) return 0.1;

  let score = 1.0;

  // Penalize when noisy garbage was found after the prefix (e.g. "CH 3 CH 3")
  if (hadNoisyRest) score -= 0.5;

  // Penalize for heavy stripping
  const orig = originalTitle.length;
  const cleaned = cleanedTitle.length;
  if (orig > 0 && (orig - cleaned) > orig * 0.5) score -= 0.3;

  // Penalize for very short result
  if (cleanedTitle.length < 5) score -= 0.4;

  // Penalize for no recognizable topic after prefix (prefix-only title)
  if (prefix && !prefix.rest) score -= 0.15;

  // Boost for known prefix (we know the hierarchy level)
  if (prefix) score += 0.05;

  // Penalize for remaining digits in topic text
  const rest = prefix?.rest ?? cleanedTitle;
  if (rest && /\d/.test(rest)) score -= 0.1;

  return Math.max(0, Math.min(1, score));
}

/* ─── Main normalizer ────────────────────────────────────────────────────────── */

export interface NormalizeTitleOptions {
  source?:        DisplayTitleSource;
  /** Safe label used when confidence < FALLBACK_THRESHOLD (e.g. "Chapter 3") */
  safeFallback?:  string;
}

/** Confidence below this threshold triggers useFallback = true */
const FALLBACK_THRESHOLD = 0.3;

/**
 * Normalize a raw PDF heading into a learner-friendly DisplayTitle.
 *
 * @param raw        The raw heading string from PDF bookmark, TOC, or heading detection
 * @param options    Source type and optional safe fallback label
 */
export function normalizeDisplayTitle(
  raw:     string,
  options: NormalizeTitleOptions = {},
): DisplayTitle {
  const source      = options.source ?? "heading";
  const originalTitle = raw;

  // 1. Check for OCR garbage
  const wasGarbage  = isOcrGarbage(raw);

  // 2. Strip page numbers (skips stripping if the title is purely a prefix+number like "CH 3")
  let cleaned = stripPageNumbers(raw);

  // 3. Remove duplicate tokens
  cleaned = deduplicateTokens(cleaned);

  // 4. Detect hierarchy prefix on the cleaned string
  const prefix = detectPrefix(cleaned);

  // 5. Fix ALL-CAPS casing on the full cleaned string
  cleaned = fixCasing(cleaned);

  // 6. Re-detect prefix after case fix — use the pre-case prefix if already found
  let prefixAfterCase = prefix ?? detectPrefix(cleaned);

  // 7. If noisy rest (e.g. "CH" leftover from dedup), treat prefix as title-only
  if (prefixAfterCase && isNoisyRest(prefixAfterCase.rest)) {
    prefixAfterCase = { ...prefixAfterCase, rest: "" };
  }

  // 8. Build full cleaned title
  let cleanedTitle: string;
  if (prefixAfterCase?.rest) {
    cleanedTitle = `${prefixAfterCase.label} — ${prefixAfterCase.rest}`;
  } else if (prefixAfterCase?.label) {
    cleanedTitle = prefixAfterCase.label;
  } else {
    cleanedTitle = cleaned;
  }

  // 9. Final trim and length guard
  cleanedTitle = cleanedTitle.replace(/\s+/g, " ").trim();

  // 10. Short title
  const shortTitle = generateShortTitle(cleanedTitle, prefixAfterCase);

  // 11. Confidence — penalize when noisy rest was detected and cleared
  const hadNoisyRest = prefix && isNoisyRest(prefix.rest);
  const confidence = scoreConfidence(
    originalTitle,
    cleanedTitle,
    wasGarbage,
    prefixAfterCase,
    hadNoisyRest ?? false,
  );

  // 12. Hierarchy level
  const level: HierarchyLevel = prefixAfterCase?.kind ?? "unknown";

  // 13. Safe fallback when confidence is too low
  const useFallback  = confidence < FALLBACK_THRESHOLD || wasGarbage;
  const safeLabel    = options.safeFallback ?? (prefixAfterCase?.label ?? "Section");

  return {
    originalTitle,
    cleanedTitle:  useFallback ? safeLabel : cleanedTitle,
    shortTitle:    useFallback ? safeLabel : shortTitle,
    confidence,
    source,
    level,
    prefix:        prefixAfterCase?.label,
    useFallback,
  };
}

/**
 * Normalize a list of raw titles, deduplicating identical cleaned results.
 * Duplicate cleaned titles get a "(2)", "(3)" suffix to remain distinct.
 */
export function normalizeDisplayTitles(
  raws:    string[],
  options: NormalizeTitleOptions = {},
): DisplayTitle[] {
  const seen = new Map<string, number>();
  return raws.map(raw => {
    const dt  = normalizeDisplayTitle(raw, options);
    const key = dt.cleanedTitle.toLowerCase();
    const n   = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (n > 1) {
      return { ...dt, cleanedTitle: `${dt.cleanedTitle} (${n})`, shortTitle: `${dt.shortTitle} (${n})` };
    }
    return dt;
  });
}
