// ---------------------------------------------------------------------------
// Semantic Polish Layer
// ---------------------------------------------------------------------------
// Final-stage cleanup applied to ALL extracted outputs before rendering.
// Fixes: OCR damage, broken grammar, fragmented clauses, academic padding,
// textbook artifacts, duplicated wording, and awkward prose.
//
// Rules enforced:
//  1. Every sentence must have a subject + action + meaning
//  2. Remove dangling phrases and textbook formatting artifacts
//  3. Strip repeated noun fragments
//  4. Convert passive constructions where natural
//  5. Prefer concise active voice
//  6. Never output malformed extraction literally

const ACADEMIC_PADDING_RE = /^(it is (interesting|important|worth|useful|necessary|essential|critical) (to note|to remember|to consider|that)|note that|keep in mind that|bear in mind that|it should be noted that|it must be noted that|it can be (seen|observed|noted) that|as (noted|mentioned|discussed|described|shown|illustrated|explained) (above|below|previously|earlier)[,:]?\s*|based on (this|these|the above)[,:]?\s*|from (this|the above)[,:]?\s*|in (this|the following) (section|chapter|example|case)[,:]?\s*|the purpose of (this|the following)[,:]?\s*|we (have|can|now|will|shall) (see|note|observe|examine|consider|demonstrate|show)[,:]?\s*)\s*/i;

const OCR_ARTIFACT_RE = /\b([A-Z]{4,})\b/g;  // ALL_CAPS OCR artifacts
const DUPLICATE_WORD_RE = /\b(\w{4,})\s+\1\b/gi; // Repeated words: "the the", "is is"
const BROKEN_HYPHEN_RE = /([a-z])-\s+([a-z])/g;  // OCR hyphenation across line break
const TRAILING_NOISE_RE = /[\s,;:]+$/;
const PAGE_NUM_RE = /\b\d{1,4}\s+(the|a|an|this|that|it|they|he|she|we)\b/; // "3 the mechanism"
// Strips book title injected mid-sentence by OCR: "patients may ART AND SCIENCE OF DIAGNOSIS remain"
const TITLE_INJECTION_RE = /\b(may|can|could|should|must|will|would|might)\b\s+([A-Z]{2,}(?:\s+[A-Z]{2,}){2,})\s*/g;

/**
 * Semantic polish pass: removes academic padding, fixes OCR artifacts, repairs
 * fragmented grammar. Returns a clean, operator-style sentence.
 * Applied AFTER extraction, BEFORE rendering.
 */
export function polishExtraction(input: string): string {
  if (!input || input.trim().length < 4) return input;

  let s = input.trim();

  // Strip book-title injections before other passes: "may ART AND SCIENCE OF DIAGNOSIS remain" → "may remain"
  s = s.replace(TITLE_INJECTION_RE, (_, modal) => modal + " ");
  s = s.replace(/\s{2,}/g, " ").trim();

  // Fix OCR hyphenation across line breaks
  s = s.replace(BROKEN_HYPHEN_RE, "$1$2");

  // Remove duplicate words
  s = s.replace(DUPLICATE_WORD_RE, "$1");

  // Strip leading page numbers that leaked into text ("3 The mechanism is...")
  if (PAGE_NUM_RE.test(s.slice(0, 10))) {
    s = s.replace(/^\d{1,4}\s+/, "");
  }

  // Strip academic padding openers (two passes for stacked patterns)
  for (let pass = 0; pass < 2; pass++) {
    const stripped = s.replace(ACADEMIC_PADDING_RE, "");
    if (stripped.length >= 15 && stripped.length < s.length) {
      s = stripped.trim();
    } else break;
  }

  // Strip ALL_CAPS OCR artifacts unless they look like acronyms (≤5 chars, known term)
  s = s.replace(OCR_ARTIFACT_RE, (match) => {
    // Keep known medical/science abbreviations
    if (/^(DNA|RNA|ATP|ADP|AMP|PCR|MRI|CT|ECG|EKG|HIV|ACE|ARB|NSAIDs?|CNS|PNS|GI|CV|HTN|DM|CHF|COPD|UTI|BUN|CBC|WBC|RBC|LDH|AST|ALT|TSH|PTH|FSH|LH|ADH|GFR|BMP|CMP|MRSA|SARS|COVID|BMI|MAP|SBP|DBP|pH)$/.test(match)) return match;
    // Likely OCR artifact — convert to title case
    return match.charAt(0) + match.slice(1).toLowerCase();
  });

  // Remove trailing noise
  s = s.replace(TRAILING_NOISE_RE, "");

  // Re-capitalize
  if (s.length > 0) s = s.charAt(0).toUpperCase() + s.slice(1);

  // Ensure sentence terminal
  if (s && !/[.!?]$/.test(s)) s += ".";

  return s;
}

export function normalizeAppositive(text: string): string {
  return text
    .replace(/,\s+(another|a|an|one|this|that|the\s+same)\s+[a-z]+(?:\s+[a-z]+)?,/gi, ",")
    .replace(/,\s+(another|a|an|one)\s+[a-z]+(?:\s+[a-z]+)?\.?$/i, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function cleanSentence(input: string): string {
  if (!input) return "";

  let sentence = normalizeAppositive(input);
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
// Cognitive Readability Layer
// ---------------------------------------------------------------------------
// Called AFTER all extraction and compression, BEFORE render.
// Guards against broken fragments, converts passive/verbose to active/concise,
// and enforces per-domain dyslexia-safe sentence constraints.

const ORPHAN_ARROW_RE = /,\s*→|^\s*→\s+\w/;
const DANGLING_PREDICATE_RE = /^(therefore|thus|hence|so|consequently)\s+(consists?\s+of|is\s+an?\s+\w|are\s+the\s+\w|was\s+)/i;
const TRAILING_COMMA_RE = /[,;]\s*[.!?]?$/;

// "The clinician identifies X" → "Identify X"
const AGENT_SUBJECT_RE =
  /^(?:the\s+)?(?:clinician|physician|provider|nurse|practitioner|student|reader|patient)\s+(?:should\s+|must\s+|can\s+|will\s+)?(identifies?|assesses?|evaluates?|performs?|considers?|examines?|determines?|uses?|applies?|recognizes?|orders?|collects?|gathers?|measures?|monitors?|reviews?|documents?|calculates?|observes?|detects?|manages?|treats?|diagnoses?|prescribes?)\s+/i;

// Math: "when n becomes large" → "as n → ∞"
const MATH_LARGE_N_RE =
  /\b(?:when|as|for(?:\s+large)?)\s+n\s+(?:becomes?|gets?|grows?|tends?\s+to|goes?\s+to|approaches?|is\s+very)\s+(?:very\s+)?(?:large|big|great|huge|positive infinity|infinity|∞)/gi;

/**
 * Returns false if the text is a broken fragment that must not be rendered:
 * dangling commas, orphan arrows, dangling predicates, or too few content words.
 */
export function isFieldRenderable(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.trim();
  if (t.length < 8) return false;
  if (ORPHAN_ARROW_RE.test(t)) return false;
  if (TRAILING_COMMA_RE.test(t.replace(/[.!?]$/, ""))) return false;
  if (DANGLING_PREDICATE_RE.test(t)) return false;
  const contentWords = t
    .split(/\s+/)
    .filter(
      (w) =>
        w.length > 3 &&
        !/^(the|a|an|is|are|was|were|of|to|in|and|or|but|for|with|from|that|this|it|its|also|then|thus|when|where|been|have|has)$/i.test(w),
    );
  if (contentWords.length < 2) return false;
  return true;
}

/**
 * Stabilizes output text for cognitive readability:
 * - Strips broken arrow fragments
 * - Converts agent-subject to imperative (clinical)
 * - Normalizes math "when n becomes large" → "as n → ∞"
 * - Clips at clause boundary if > 14 words (non-math)
 *
 * Returns "" when the text is irreparably broken (caller should skip or use fallback).
 */
export function stabilizeOutput(text: string, domain?: string): string {
  if (!text) return "";
  let s = text.trim();

  // 1. Strip broken arrow fragment: ", → cause" → remove the arrow phrase
  if (ORPHAN_ARROW_RE.test(s)) {
    s = s.replace(/,\s*→[^.!?]*/g, "").replace(/^\s*→\s*[^.!?]*/, "").trim();
    if (!isFieldRenderable(s)) return "";
  }

  // 2. Clinical/general: convert agent-subject to imperative
  if (!domain || domain === "clinical" || domain === "general") {
    s = s.replace(AGENT_SUBJECT_RE, (_, verb: string) => {
      const imp = verb
        .replace(/ies$/i, "y")
        .replace(/(?<![aeiou])es$/i, "e")
        .replace(/(?<=[aeiou])s$/i, "")
        .replace(/s$/i, "");
      return imp.charAt(0).toUpperCase() + imp.slice(1).toLowerCase() + " ";
    });
  }

  // 3. Math: normalize verbose "when n becomes large" → "as n → ∞"
  if (domain === "math") {
    s = s.replace(MATH_LARGE_N_RE, "as n → ∞");
    s = s.replace(/\bas\s+n\s+→\s+(?:infinity|∞)\b/gi, "as n → ∞");
  }

  // 4. Strip trailing dangling clause (≤4 words after last comma that isn't a list)
  const lastComma = s.lastIndexOf(",");
  if (lastComma > s.length * 0.65) {
    const trailing = s.slice(lastComma + 1).trim();
    const trailingWords = trailing.replace(/[.!?]$/, "").split(/\s+/).filter(Boolean);
    if (trailingWords.length <= 3 && !/\band\b|\bor\b|\bbut\b/i.test(trailing)) {
      s = s.slice(0, lastComma).trim();
    }
  }

  // 5. Word-count cap: ≤ 14 words for non-math (clip at clause boundary)
  if (domain !== "math") {
    const words = s.split(/\s+/);
    if (words.length > 14) {
      const clauseMatch = s.match(/^(.{20,90}?)(?:[;]\s+|\s+(?:because|which|where|that)\s)/);
      if (clauseMatch && clauseMatch[1].split(/\s+/).length <= 14) {
        s = clauseMatch[1].trim();
      } else {
        s = words.slice(0, 14).join(" ");
      }
    }
  }

  if (!s) return "";
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (!/[.!?…]$/.test(s)) s += ".";
  return s;
}

/**
 * Compresses text to a ≤ 12-word operator-style one-liner.
 * Used for "One-line Summary" / page thesis displays.
 */
export function compressToOneLine(text: string, domain?: string): string {
  if (!text) return "";
  const stabilized = stabilizeOutput(text, domain);
  if (!stabilized) return "";
  const words = stabilized.split(/\s+/);
  if (words.length <= 12) return stabilized;
  const compressed = compressToNote(stabilized, "signal");
  if (compressed && compressed.split(/\s+/).length <= 14) return compressed;
  return words.slice(0, 10).join(" ").replace(/[,;]$/, "") + ".";
}

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
