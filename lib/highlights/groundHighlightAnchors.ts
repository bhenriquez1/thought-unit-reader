// lib/highlights/groundHighlightAnchors.ts
// Grounding layer: converts AI semantic anchors into exact PDF text spans.
//
// Problem: OpenAI often generates paraphrased anchors ("Iodine deficiency causes goiter")
// but the PDF overlay can only match text that exists verbatim in the page text layer.
// This layer bridges the gap — replacing semantic anchors with the exact source sentence.
//
// Pipeline per anchor:
//   1. Exact substring match   → keep anchor.text as-is
//   2. Normalized match        → keep anchor.text (SmartPDFViewer handles ligatures)
//   3. Semantic recovery       → replace with best scoring sentence from pageText
//   4. Reject                  → drop anchor entirely
//
// Universal — no subject hardcoding. Scoring uses term overlap, numbers, causal language,
// role keywords, and sentence quality signals.

import { cleanActivePageText, isLikelyHeaderLine } from "@/lib/insights/cleanActivePageText";

const DEV = process.env.NODE_ENV === "development";

export type RawAnchor = {
  text: string;
  anchorType: string;
  reason: string;
  // Full concept span bounds — carried through grounding (via the ...anchor spread)
  // so multi-sentence highlighting survives to SmartPDFViewer.
  spanStart?: string | null;
  spanEnd?: string | null;
  // AI-assigned per-anchor importance (1-5) and domain extraction category — carried
  // through grounding (via the ...anchor spread) for B4 visual-emphasis rendering.
  priorityTier?: number | null;
  domainCategory?: string | null;
};

export type GroundedAnchor = RawAnchor & {
  /** Exact text as it appears in the PDF page — guaranteed findable by SmartPDFViewer */
  groundedText: string;
  groundMethod: "exact" | "normalized" | "recovered";
  confidence: number;
};

// Same normalization used by SmartPDFViewer's normForMatch — keeps comparison consistent.
function normText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[­​]/g, '')               // zero-width / soft-hyphen
    .replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl')
    .replace(/ﬀ/g, 'ff').replace(/ﬃ/g, 'ffi').replace(/ﬄ/g, 'ffl')
    .replace(/['']/g, "'").replace(/[""]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP_WORDS = new Set([
  'the','a','an','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','must','shall',
  'can','to','of','in','on','at','by','for','with','from','into','and','or',
  'but','not','nor','so','yet','both','either','this','that','these','those',
  'it','its','they','their','we','our','you','your','he','she','his','her','him',
  'if','then','when','where','how','what','which','who','whom','as','than',
  'more','most','other','such','each','all','any','also','thus','therefore',
  'however','although','because','since','about','up','out','no','one','two',
]);

function extractKeyTerms(text: string): string[] {
  return normText(text)
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w));
}

function extractNumbers(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)?(?:\s*[%°])?/g) ?? []).map(n => n.replace(/\s/g, ''));
}

const CAUSAL_RE = /\b(causes?|caused by|leads? to|results? in|due to|because|therefore|thus|hence|produces?|triggers?|inhibits?|activates?|stimulates?|converts?|prevents?|depends? on|is responsible for|mediates?|underlies?|increases?|decreases?|promotes?|requires?)\b/i;

// VisualAnchorRole keys are the current contract; the legacy AI anchorType keys
// (thesis/definition/application/trap) are kept as aliases for back-compat.
const ROLE_KEYWORDS: Record<string, RegExp> = {
  // Current VisualAnchorRole names
  coreIdea:        /\b(fundamental|primary|key|main|central|governing|principle|about|defines?|characterizes?)\b/i,
  keyDetail:       /\b(defined?|definition|means?|refers? to|known as|called|is the|are the|term|detail|specific|value|amount|formula)\b/i,
  mechanism:       /\b(causes?|leads? to|results? in|how|why|because|due to|process|pathway|step|mechanism)\b/i,
  exampleEvidence: /\b(example|clinical|used|used in|seen in|applied|real.world|case|patient|practice|treatment)\b/i,
  confusionTrap:   /\b(however|unlike|not\b|except|contrast|confusion|mistake|caution|but\b|differ|whereas|warning|common error)\b/i,
  datFact:         /\b(exam|high.yield|test|board|key fact|important fact|remember|must know)\b/i,
  definition:      /\b(defined?|definition|means?|refers? to|known as|called|is the|are the|term)\b/i,
  clinicalPearl:   /\b(pearl|clinically|in practice|tip|insight|experienced|seasoned)\b/i,
  memoryHook:      /\b(think of|remember|mnemonic|analogy|like a|imagine|hook)\b/i,
  keyAnatomy:      /\b(located|sits|connects? to|anatomy|structure|adjacent|borders?|attaches? to)\b/i,

  // Legacy AI anchorType aliases — grounding may still receive these from older callers.
  thesis:        /\b(fundamental|primary|key|main|central|governing|principle|about|defines?|characterizes?)\b/i,
  application:   /\b(example|clinical|used|used in|seen in|applied|real.world|case|patient|practice|treatment)\b/i,
  trap:          /\b(however|unlike|not\b|except|contrast|confusion|mistake|caution|but\b|differ|whereas|warning|common error)\b/i,
  clinical_pearl: /\b(pearl|clinically|in practice|tip|insight|experienced|seasoned)\b/i,
  memory_hook:    /\b(think of|remember|mnemonic|analogy|like a|imagine|hook)\b/i,
  anatomy:        /\b(located|sits|connects? to|anatomy|structure|adjacent|borders?|attaches? to)\b/i,
};

// Split page text into candidate sentences for semantic recovery.
// Handles period-delimited sentences and newline-separated clauses common in PDF layout.
function splitIntoSentences(text: string): string[] {
  const candidates = text
    // Primary: sentence-ending punctuation + whitespace + capital letter
    .split(/(?<=[.!?])\s+(?=[A-Z"'])/gm)
    .flatMap(chunk =>
      // Secondary: newline + capital (PDF layout often omits terminal periods on headings)
      chunk.split(/\n+(?=[A-Z])/gm)
    )
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => {
      const wc = s.split(/\s+/).length;
      if (wc < 5 || wc > 30 || s.length < 25) return false;
      // Body-only: never offer running headers / titles / page-number lines as
      // recovery candidates. This is what stops "The Chemical Context of Life 29"
      // from being selected as a thesis anchor.
      if (isLikelyHeaderLine(s)) {
        DEV && console.log("[ANCHOR_REJECTED_HEADER]", { text: s.slice(0, 80) });
        return false;
      }
      return true;
    });

  return candidates;
}

function scoreSentenceMatch(anchor: RawAnchor, sentence: string): number {
  let score = 0;
  const anchorTerms = extractKeyTerms(anchor.text);
  const sentTermsSet = new Set(extractKeyTerms(sentence));
  const anchorNums = extractNumbers(anchor.text);
  const sentNumsSet = new Set(extractNumbers(sentence));

  // Key term overlap — primary signal (up to 0.55)
  if (anchorTerms.length > 0) {
    const matched = anchorTerms.filter(t => sentTermsSet.has(t)).length;
    score += (matched / anchorTerms.length) * 0.55;
  }

  // Number / formula exact match — high-precision signal (up to 0.20)
  if (anchorNums.length > 0) {
    const matched = anchorNums.filter(n => sentNumsSet.has(n)).length;
    score += (matched / anchorNums.length) * 0.20;
  }

  // Causal language alignment — structural signal (up to 0.10)
  if (CAUSAL_RE.test(anchor.text) && CAUSAL_RE.test(sentence)) score += 0.10;

  // Role keyword match — semantic alignment bonus (up to 0.08)
  const roleRe = ROLE_KEYWORDS[anchor.anchorType];
  if (roleRe?.test(sentence)) score += 0.08;

  // Sentence quality signals
  const wc = sentence.split(/\s+/).length;
  if (wc > 45) score -= 0.08;  // overly broad → less specific
  if (wc < 8)  score -= 0.10;  // too short → likely a heading or fragment

  // Discard sentences that are structurally chapter openers or captions
  if (/^(in this |this chapter |this section |we will |the following |see (figure|table)|figure \d|table \d)/i.test(sentence)) {
    score -= 0.25;
  }

  return Math.max(0, score);
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function firstWords(s: string, n: number): string {
  return s.split(/\s+/).filter(Boolean).slice(0, n).join(' ');
}

function lastWords(s: string, n: number): string {
  const words = s.split(/\s+/).filter(Boolean);
  return words.slice(Math.max(0, words.length - n)).join(' ');
}

// Ratio of the smaller sentence's key terms that also appear in the other sentence —
// used to decide whether a neighboring sentence continues the same thought.
function termOverlapRatio(a: string, b: string): number {
  const termsA = new Set(extractKeyTerms(a));
  const termsB = extractKeyTerms(b);
  if (termsA.size === 0 || termsB.length === 0) return 0;
  const matched = termsB.filter(t => termsA.has(t)).length;
  return matched / Math.min(termsA.size, termsB.length);
}

// Split the page (already structured into "\n\n"-separated paragraphs by
// buildStructuredPageText) into paragraph-level text blocks for thought-unit spans.
function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n+/)
    .map(p => p.replace(/\s+/g, ' ').trim())
    .filter(p => p.length > 0);
}

// Cap on "reasonable thought-unit size" — shared by paragraph-level expansion and
// the chained-neighbor merge below, so both expansion paths agree on what counts
// as a coherent unit vs. an over-broad span. Kept small: the goal is the minimum
// text necessary to understand the page, not a full sentence by default.
const THOUGHT_UNIT_MAX_WORDS = 14;

// A matched span at or above this length already reads as a complete thought
// (e.g. "ethanol + oxygen yields acetic acid") — no further expansion needed.
const MIN_STANDALONE_WORDS = 5;

// Roles whose causal/explanatory language can genuinely span an entire sentence —
// only these may expand past their immediate clause (and only when the causal
// marker spans the whole sentence, not just the matched fragment).
const NEEDS_FULL_SENTENCE_TYPES = new Set(["mechanism"]);

// Roles that may justify a multi-sentence paragraph span (worked examples, applied
// procedures, high-yield fact blocks) — paragraphSpanFor is opt-in to these roles
// only, never the universal default.
const ALLOWS_PARAGRAPH_SPAN_TYPES = new Set(["exampleEvidence", "application", "datFact"]);

// Clause-level delimiters — commas, semicolons, colons, em/en dashes, and
// coordinating conjunctions surrounded by whitespace — finer-grained than sentence
// boundaries, used to pad a short matched span only as far as its own clause.
const CLAUSE_SPLIT_RE = /,|;|:|—|–|\s(?:and|but|or|so|yet|nor|because|since|while|whereas|although|though)\s/i;

function splitIntoClauses(sentence: string): string[] {
  return sentence
    .split(CLAUSE_SPLIT_RE)
    .map(c => c.replace(/\s+/g, ' ').trim())
    .filter(c => c.length > 0);
}

// Pad a short match just enough to read as a complete clause — never the whole
// sentence — falling back to the full sentence only when it has no internal
// clause structure to pad to (e.g. a short sentence with no punctuation at all).
function clauseSpanFor(matchedText: string, core: string): string {
  const clauses = splitIntoClauses(core);
  if (clauses.length <= 1) return core;
  const normedMatch = normText(matchedText);
  const containing = clauses.find(c => normText(c).includes(normedMatch));
  return containing ?? core;
}

// If `core`'s containing paragraph is a reasonable "thought unit" size — bigger than
// the sentence itself but not the whole page — span the highlight across the full
// paragraph. Returns undefined when no such paragraph is found (e.g. the page text
// has no recovered paragraph breaks) or the paragraph is too large to highlight whole.
function paragraphSpanFor(
  core: string,
  paragraphs: string[],
): { spanStart: string; spanEnd: string } | undefined {
  // A single "paragraph" means no real "\n\n" breaks were recovered for this page
  // (e.g. geometry was too uniform to detect them) — the whole page text would be
  // an unreliable, overly broad span, so skip paragraph-level expansion entirely.
  if (paragraphs.length <= 1) return undefined;

  const normedCore = normText(core);
  const para = paragraphs.find(p => normText(p).includes(normedCore));
  if (!para) return undefined;

  const paraWords = wordCount(para);
  if (paraWords <= wordCount(core)) return undefined;          // paragraph IS the sentence
  if (paraWords > THOUGHT_UNIT_MAX_WORDS) return undefined;    // too large — avoid over-highlighting

  return { spanStart: firstWords(para, 5), spanEnd: lastWords(para, 5) };
}

// If `core` (at `sentences[idx]`) is short, chain in adjacent, topically-related
// sentences (high key-term overlap with the core) so a highlight reads as a complete
// thought unit — e.g. a mechanism step + its example + its result — rather than one
// clipped line or a single bolted-on neighbor. Walks outward in both directions while
// overlap with the core holds and the running word count stays under the cap. Returns
// spanStart/spanEnd covering the full chained range, or undefined when no neighbor
// qualifies at all.
function mergeWithNeighbor(
  sentences: string[],
  idx: number,
): { spanStart: string; spanEnd: string } | undefined {
  const core = sentences[idx];
  if (wordCount(core) > 14) return undefined;

  let startIdx = idx;
  let endIdx = idx;
  let totalWords = wordCount(core);

  while (endIdx + 1 < sentences.length) {
    const candidate = sentences[endIdx + 1];
    if (termOverlapRatio(core, candidate) < 0.2) break;
    const nextTotal = totalWords + wordCount(candidate);
    if (nextTotal > THOUGHT_UNIT_MAX_WORDS) break;
    endIdx++;
    totalWords = nextTotal;
  }

  while (startIdx - 1 >= 0) {
    const candidate = sentences[startIdx - 1];
    if (termOverlapRatio(core, candidate) < 0.2) break;
    const nextTotal = totalWords + wordCount(candidate);
    if (nextTotal > THOUGHT_UNIT_MAX_WORDS) break;
    startIdx--;
    totalWords = nextTotal;
  }

  if (startIdx === idx && endIdx === idx) return undefined;

  return { spanStart: firstWords(sentences[startIdx], 5), spanEnd: lastWords(sentences[endIdx], 5) };
}

// Multi-sentence span for a sentence already identified as the "core" highlight —
// only reached for roles that are explicitly allowed a block (paragraph) or a
// chained neighbor (causal mechanisms); everything else stays within its sentence.
function thoughtUnitSpan(
  anchorType: string,
  core: string,
  sentences: string[],
  idx: number,
  paragraphs: string[],
): { spanStart: string; spanEnd: string } | undefined {
  if (ALLOWS_PARAGRAPH_SPAN_TYPES.has(anchorType)) {
    const paraSpan = paragraphSpanFor(core, paragraphs);
    if (paraSpan) return paraSpan;
  }
  if (NEEDS_FULL_SENTENCE_TYPES.has(anchorType)) {
    return mergeWithNeighbor(sentences, idx);
  }
  return undefined;
}

/**
 * Expand a verbatim-matched span to the minimum text needed to read as a complete
 * thought — never more. A match that's already a complete short phrase (>=
 * MIN_STANDALONE_WORDS, e.g. "ethanol + oxygen yields acetic acid") is returned
 * as-is. A short fragment (e.g. "Diagnosis") is padded only to its own clause
 * boundary, never the whole sentence. Only causal-mechanism anchors may expand to
 * a full sentence (or one chained neighbor), and only when the causal language
 * genuinely spans the whole sentence rather than just the matched clause.
 * Worked-example/procedure/fact-block roles may expand to a full paragraph.
 *
 * Returns the matched text unchanged when no containing sentence can be found
 * (e.g. the match spans multiple sentences already) or when the match already
 * covers most of its sentence.
 */
function expandToThoughtUnit(
  matchedText: string,
  anchorType: string,
  sentences: string[],
  paragraphs: string[],
): { groundedText: string; spanStart?: string; spanEnd?: string } {
  const normedMatch = normText(matchedText);
  const idx = sentences.findIndex(s => normText(s).includes(normedMatch));

  if (idx === -1) return { groundedText: matchedText };

  const core = sentences[idx];

  // Match already covers (most of) the sentence — nothing to expand.
  if (wordCount(matchedText) >= wordCount(core) * 0.9) {
    return { groundedText: matchedText };
  }

  // Already reads as a complete thought on its own — the minimum text necessary.
  if (wordCount(matchedText) >= MIN_STANDALONE_WORDS) {
    return { groundedText: matchedText };
  }

  if (NEEDS_FULL_SENTENCE_TYPES.has(anchorType) && CAUSAL_RE.test(core)) {
    const span = thoughtUnitSpan(anchorType, core, sentences, idx, paragraphs);
    return span ? { groundedText: core, ...span } : { groundedText: core };
  }

  const clause = clauseSpanFor(matchedText, core);
  if (ALLOWS_PARAGRAPH_SPAN_TYPES.has(anchorType)) {
    const span = thoughtUnitSpan(anchorType, core, sentences, idx, paragraphs);
    if (span) return { groundedText: clause, ...span };
  }
  return { groundedText: clause };
}

/**
 * Ground AI-generated anchors against the current page's raw text.
 *
 * Returns only anchors whose text (or a semantically recovered equivalent) is
 * findable in pageText. Rejected anchors are dropped — wrong highlights are
 * worse than no highlights.
 *
 * When pageText is not yet available, returns anchors unmodified so that the
 * existing pageText validation in effectiveHighlightTargets acts as the guard.
 */
export function groundHighlightAnchors(
  anchors: RawAnchor[],
  pageText: string,
): GroundedAnchor[] {
  if (!pageText || pageText.length < 30) {
    // Page text not loaded yet — pass through, downstream validation guards
    return anchors.map(a => ({ ...a, groundedText: a.text, groundMethod: "exact" as const, confidence: 1.0 }));
  }

  // Text hygiene FIRST: strip the leading running header / title + page-number prefix
  // ("The Chemical Context of Life 29 ...") before splitting into candidate sentences.
  // Cleaning before the split keeps the body sentence intact ("Just four elements...")
  // rather than rejecting the whole header+body sentence wholesale. The body text is
  // still verbatim in the real PDF layer, so SmartPDFViewer can locate the highlight.
  const cleanedPage = cleanActivePageText(pageText, "ground");
  const normedPage = normText(cleanedPage);
  const sentences = splitIntoSentences(cleanedPage);
  const paragraphs = splitIntoParagraphs(cleanedPage);
  const grounded: GroundedAnchor[] = [];

  for (const anchor of anchors) {
    const normedAnchor = normText(anchor.text);
    const anchorIsHeader = isLikelyHeaderLine(anchor.text);

    DEV && console.log("[LEFT_PANEL_GROUND_ATTEMPT]", { text: anchor.text.slice(0, 80), role: anchor.anchorType });

    // ── Stage 1: Exact substring match (case-sensitive) ──────────────────
    // Skip exact/normalized echo when the anchor text itself is a header artifact —
    // force semantic recovery to a clean body sentence instead.
    // Anchors that already carry an explicit AI-provided span are trusted as-is —
    // don't second-guess a multi-sentence span the model already chose.
    const hasExplicitSpan = !!(anchor.spanStart && anchor.spanEnd);

    if (!anchorIsHeader && cleanedPage.includes(anchor.text)) {
      const expansion = hasExplicitSpan
        ? { groundedText: anchor.text }
        : expandToThoughtUnit(anchor.text, anchor.anchorType, sentences, paragraphs);
      DEV && console.log("[ANCHOR_SELECTED_BODY]", { text: expansion.groundedText.slice(0, 70), kind: anchor.anchorType, score: 1.0, method: "exact" });
      DEV && console.log("[LEFT_PANEL_GROUND_SUCCESS]", { text: expansion.groundedText.slice(0, 80), role: anchor.anchorType, method: "exact" });
      grounded.push({
        ...anchor,
        ...(expansion.spanStart ? { spanStart: expansion.spanStart, spanEnd: expansion.spanEnd } : {}),
        groundedText: expansion.groundedText,
        groundMethod: "exact",
        confidence: 1.0,
      });
      continue;
    }

    // ── Stage 2: Normalized match (ligatures, smart quotes, dashes, whitespace)
    if (!anchorIsHeader && normedAnchor.length >= 10 && normedPage.includes(normedAnchor)) {
      const expansion = hasExplicitSpan
        ? { groundedText: anchor.text }
        : expandToThoughtUnit(anchor.text, anchor.anchorType, sentences, paragraphs);
      DEV && console.log("[ANCHOR_SELECTED_BODY]", { text: expansion.groundedText.slice(0, 70), kind: anchor.anchorType, score: 0.95, method: "normalized" });
      DEV && console.log("[LEFT_PANEL_GROUND_SUCCESS]", { text: expansion.groundedText.slice(0, 80), role: anchor.anchorType, method: "normalized" });
      // Keep anchor.text (or its expanded sentence) — SmartPDFViewer's normForMatch
      // will find it via normalized comparison
      grounded.push({
        ...anchor,
        ...(expansion.spanStart ? { spanStart: expansion.spanStart, spanEnd: expansion.spanEnd } : {}),
        groundedText: expansion.groundedText,
        groundMethod: "normalized",
        confidence: 0.95,
      });
      continue;
    }

    if (anchorIsHeader) {
      DEV && console.log("[ANCHOR_REJECTED_HEADER]", { text: anchor.text.slice(0, 80), note: "anchor text is a header — recovering body sentence" });
    }

    // ── Stage 3: Semantic sentence recovery ──────────────────────────────
    // Find the best-scoring sentence from pageText that expresses the same idea.
    // Replace the semantic anchor with exact page text so SmartPDFViewer can locate it.

    // Score every candidate in a single pass, then apply a two-step selection:
    //   1. Primary: highest score wins.
    //   2. Tie-break (when anchor carries a spanStart position hint): among sentences
    //      within EPSILON of the top score, prefer the one whose char offset in
    //      cleanedPage is closest to anchor.spanStart. This resolves duplicate-concept
    //      cases (e.g., same sentence appears in a chapter intro and the main body).
    const RECOVERY_THRESHOLD = 0.55;
    const EPSILON = 0.04;

    // Filter body-only candidates first so the header guard doesn't need post-mutation.
    const scored = sentences
      .filter(s => !isLikelyHeaderLine(s))
      .map(s => ({ sentence: s, score: scoreSentenceMatch(anchor, s) }));

    const maxScore = scored.reduce((m, s) => Math.max(m, s.score), 0);
    const topCandidates = scored.filter(s => s.score >= maxScore - EPSILON);

    let bestEntry = topCandidates[0] ?? null;
    // Proximity tie-break: anchor.spanStart is a string char-offset hint from the AI.
    const spanHint = anchor.spanStart != null ? parseInt(anchor.spanStart as string, 10) : NaN;
    if (bestEntry && topCandidates.length > 1 && !Number.isNaN(spanHint)) {
      for (const entry of topCandidates) {
        const off = cleanedPage.indexOf(entry.sentence);
        const curOff = cleanedPage.indexOf(bestEntry.sentence);
        if (off >= 0 && (curOff < 0 || Math.abs(off - spanHint) < Math.abs(curOff - spanHint))) {
          bestEntry = entry;
        }
      }
    }

    const bestSentence = bestEntry?.sentence ?? null;
    const bestScore = bestEntry?.score ?? 0;

    if (bestSentence !== null && bestScore >= RECOVERY_THRESHOLD) {
      DEV && console.log("[ANCHOR_SELECTED_BODY]", {
        text:   bestSentence.slice(0, 70),
        kind:   anchor.anchorType,
        score:  Math.round(bestScore * 100) / 100,
        method: "recovered",
        from:   anchor.text.slice(0, 50),
      });
      DEV && console.log("[LEFT_PANEL_GROUND_SUCCESS]", { text: bestSentence.slice(0, 80), role: anchor.anchorType, method: "recovered", from: anchor.text.slice(0, 50) });
      const bestIdx = sentences.indexOf(bestSentence);
      const span = !(anchor.spanStart && anchor.spanEnd) && bestIdx !== -1
        ? thoughtUnitSpan(anchor.anchorType, bestSentence, sentences, bestIdx, paragraphs)
        : undefined;
      grounded.push({
        ...anchor,
        ...(span ? { spanStart: span.spanStart, spanEnd: span.spanEnd } : {}),
        text:         bestSentence, // replace semantic text with grounded text
        groundedText: bestSentence,
        groundMethod: "recovered",
        confidence:   bestScore,
      });
    } else {
      DEV && console.log("[GROUND_ANCHOR_REJECTED]", {
        text:          anchor.text.slice(0, 70),
        bestScore:     Math.round(bestScore * 100) / 100,
        bestCandidate: bestSentence?.slice(0, 70) ?? "(none)",
      });
      DEV && console.log("[LEFT_PANEL_GROUND_FAILED]", { text: anchor.text.slice(0, 80), role: anchor.anchorType, bestScore: Math.round(bestScore * 100) / 100 });
      // Drop — no highlight is better than a wrong highlight
    }
  }

  DEV && console.log("[GROUND_ANCHOR_FINAL]", {
    input:    anchors.length,
    grounded: grounded.length,
    rejected: anchors.length - grounded.length,
    methods:  grounded.map(a => a.groundMethod),
  });

  return grounded;
}
