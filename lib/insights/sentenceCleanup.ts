export function cleanSentence(input: string): string {
  if (!input) return "";

  let sentence = input;
  sentence = sentence.replace(/\n+/g, " ");
  sentence = sentence.replace(/(\w+)-\s+(\w+)/g, "$1$2");
  sentence = sentence.replace(/\s+/g, " ").trim();
  sentence = sentence.replace(/^(and|or|but|so|because|whereas)\s+/i, "");

  if (sentence.length > 0) {
    sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
  }

  if (sentence && !/[.!?]$/.test(sentence)) {
    sentence += ".";
  }

  return sentence;
}

export function completeFragment(input: string): string {
  const sentence = cleanSentence(input);
  if (!sentence) return "";

  const tooShort = sentence.split(" ").length < 5;
  const noVerb = !/(is|are|was|were|may|can|will|should|reveals?|indicates?|shows?|suggests?|means?|requires?)/i.test(sentence);

  if (tooShort || noVerb) {
    return `This indicates that ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}`;
  }

  return sentence;
}

export function roleSentence(input: string, role: "general" | "operator" | "expert"): string {
  const base = completeFragment(input);

  switch (role) {
    case "general":
      return base;
    case "operator":
      return cleanSentence(base.replace(/^This indicates that\s*/i, ""));
    case "expert":
      return cleanSentence(base.replace(/^This indicates that\s*/i, "").replace(/\bthe\b\s*/gi, "").trim());
    default:
      return base;
  }
}

export const toGeneralSentence = (input: string) => roleSentence(input, "general");
export const toOperatorSentence = (input: string) => roleSentence(input, "operator");
export const toExpertSentence = (input: string) => roleSentence(input, "expert");

// ---------------------------------------------------------------------------
// Operator note compression
// ---------------------------------------------------------------------------
// Applied at display time to convert verbose PDF prose into tighter operator
// notes. Filler is stripped, imperative clauses are extracted per note kind,
// and output is capped at 110 chars.

const FILLER_OPENERS: RegExp[] = [
  // Page/section references
  /^(this page|the page|this section|this chapter|in this chapter|in this section)\b[,]?\s*/i,
  // Meta-commentary
  /^(note that|it (should|must) be noted that|it is important (to note|to remember|that)|keep in mind that|remember that)\s*/i,
  // Back-references
  /^(as (mentioned|discussed|noted|described|shown|illustrated|explained)( (above|below|previously|earlier))?)[,:]?\s*/i,
  // General summary starters
  /^(in general,?|generally (speaking,?)?|overall,?|in summary,?|to summarize,?|in conclusion,?|broadly speaking,?)\s*/i,
  // Additive transitions
  /^(additionally,?|furthermore,?|moreover,?|also,?)\s*/i,
  // Numeric list starters
  /^(first,?|second,?|third,?|finally,?|next,?)\s*/i,
  // "The concept/idea/process of X is..."
  /^the (concept|idea|notion|principle|process|fact|importance|role|purpose) (of|that|is)\s+/i,
  // Impersonal constructions
  /^it is (important|necessary|essential|critical|imperative) (that|to note that|to remember that|to)\s+/i,
  /^it (should|must) (be noted|be remembered|be emphasized) (that\s+)?/i,
  // This means / suggests
  /^(this means|this suggests|this indicates|this implies|this demonstrates|this shows|this confirms)\s+(that\s+)?/i,
  // Based on / from this
  /^(based on (this|these|the above)[,]?|from (this|the above)[,]?|from these findings?[,]?)\s*/i,
  // Directed-at-reader
  /^(one should|students? (should|must)|the reader should|the clinician should|the practitioner should)\s*/i,
  // In the case of
  /^(in (such|these|this) cases?[,]?|in the case of|in the context of)\s*/i,
  // According to
  /^(according to (this|the above|these)[,]?)\s*/i,
];

/**
 * Compresses a full PDF sentence into a tight operator note.
 *
 * kind controls per-role extraction:
 *   "signal"    — strip preamble, keep core assertion
 *   "rule"      — extract should/must/requires clause
 *   "mechanism" — extract causal clause (because / leads to / therefore)
 *   "action"    — same as "rule" but skips causal extraction
 *   "trap"      — strip hedging, keep warning
 *   ""          — filler strip + length cap only
 *
 * Output is always ≤110 chars and ends with punctuation.
 */
export function compressToNote(input: string, kind = ""): string {
  if (!input) return "";

  // Already compact — just normalize.
  if (input.length <= 70) return cleanSentence(input);

  let s = input.trim();

  // ── 1. Strip filler openers (two passes for stacked patterns) ────────────
  for (let pass = 0; pass < 2; pass++) {
    for (const pattern of FILLER_OPENERS) {
      const stripped = s.replace(pattern, "");
      // Only accept the strip if meaningful content remains.
      if (stripped.length >= 20 && stripped.length < s.length) {
        s = stripped.trim();
      }
    }
    if (s.length <= 70) break;
  }
  // Re-capitalize after stripping.
  if (s.length > 0) s = s.charAt(0).toUpperCase() + s.slice(1);

  // ── 2. Kind-specific extraction ──────────────────────────────────────────
  const lk = kind.toLowerCase();

  if (lk === "rule" || lk === "action") {
    // Pull the imperative clause starting with should/must/requires/etc.
    const imp = s.match(
      /\b(should|must|need to|needs to|required to|requires?\s+\w|is required to|is necessary to)\b[^.!?]{8,100}/i,
    );
    if (imp) {
      const frag = imp[0].trim();
      s = frag.charAt(0).toUpperCase() + frag.slice(1);
    } else {
      // Strip impersonal frames: "It is required that X" → "X"
      s = s
        .replace(/^it is (required|necessary|important|recommended|essential)\s+that\s+/i, "")
        .replace(/^there (is|are)\s+a?\s*(need|requirement|necessity)\s+(to|for)\s+/i, "")
        .trim();
      if (s.length > 0) s = s.charAt(0).toUpperCase() + s.slice(1);
    }
  }

  if (lk === "mechanism") {
    // Prefer the causal clause when clearly shorter than the full sentence.
    const causal = s.match(
      /\b(because|since|this is because|the reason is|leads? to|results? in|causes?|therefore|thus)\b[^.!?]{12,100}/i,
    );
    if (causal && causal[0].length < s.length * 0.75) {
      s = causal[0].trim();
      s = s.charAt(0).toUpperCase() + s.slice(1);
    }
  }

  if (lk === "trap") {
    // Remove hedging frames common in trap descriptions.
    s = s
      .replace(/\b(a common mistake is to|a frequent error is to|students? often (make the mistake of|incorrectly)\s+)/i, "")
      .replace(/\b(do not confuse|avoid confusing)\s+/i, "Do not confuse ")
      .trim();
    if (s.length > 0) s = s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ── 3. Length cap at 110 chars ───────────────────────────────────────────
  if (s.length > 110) {
    // Try to break at an inner sentence boundary.
    const innerEnd = s.slice(0, 108).search(/[.!?;]\s/);
    if (innerEnd > 25) {
      s = s.slice(0, innerEnd + 1);
    } else {
      // Break at the last word boundary before 108.
      const wordBreak = s.slice(0, 107).lastIndexOf(" ");
      s = (wordBreak > 20 ? s.slice(0, wordBreak) : s.slice(0, 107)) + "…";
    }
  }

  // ── 4. Final normalize ───────────────────────────────────────────────────
  s = s.trim();
  if (!s) return "";
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (!/[.!?…]$/.test(s)) s += ".";

  return s;
}
