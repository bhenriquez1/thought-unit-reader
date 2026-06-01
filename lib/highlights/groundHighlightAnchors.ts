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

export type RawAnchor = {
  text: string;
  anchorType: string;
  reason: string;
  // Full concept span bounds — carried through grounding (via the ...anchor spread)
  // so multi-sentence highlighting survives to SmartPDFViewer.
  spanStart?: string | null;
  spanEnd?: string | null;
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

const ROLE_KEYWORDS: Record<string, RegExp> = {
  thesis:      /\b(fundamental|primary|key|main|central|governing|principle|about|defines?|characterizes?)\b/i,
  definition:  /\b(defined?|definition|means?|refers? to|known as|called|is the|are the|term)\b/i,
  mechanism:   /\b(causes?|leads? to|results? in|how|why|because|due to|process|pathway|step|mechanism)\b/i,
  application: /\b(example|clinical|used|used in|seen in|applied|real.world|case|patient|practice|treatment)\b/i,
  trap:        /\b(however|unlike|not\b|except|contrast|confusion|mistake|caution|but\b|differ|whereas|warning|common error)\b/i,
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
      if (wc < 5 || wc > 60 || s.length < 25) return false;
      // Body-only: never offer running headers / titles / page-number lines as
      // recovery candidates. This is what stops "The Chemical Context of Life 29"
      // from being selected as a thesis anchor.
      if (isLikelyHeaderLine(s)) {
        console.log("[ANCHOR_REJECTED_HEADER]", { text: s.slice(0, 80) });
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
  const grounded: GroundedAnchor[] = [];

  for (const anchor of anchors) {
    const normedAnchor = normText(anchor.text);
    const anchorIsHeader = isLikelyHeaderLine(anchor.text);

    // ── Stage 1: Exact substring match (case-sensitive) ──────────────────
    // Skip exact/normalized echo when the anchor text itself is a header artifact —
    // force semantic recovery to a clean body sentence instead.
    if (!anchorIsHeader && cleanedPage.includes(anchor.text)) {
      console.log("[ANCHOR_SELECTED_BODY]", { text: anchor.text.slice(0, 70), kind: anchor.anchorType, score: 1.0, method: "exact" });
      grounded.push({ ...anchor, groundedText: anchor.text, groundMethod: "exact", confidence: 1.0 });
      continue;
    }

    // ── Stage 2: Normalized match (ligatures, smart quotes, dashes, whitespace)
    if (!anchorIsHeader && normedAnchor.length >= 10 && normedPage.includes(normedAnchor)) {
      console.log("[ANCHOR_SELECTED_BODY]", { text: anchor.text.slice(0, 70), kind: anchor.anchorType, score: 0.95, method: "normalized" });
      // Keep anchor.text — SmartPDFViewer's normForMatch will find it via normalized comparison
      grounded.push({ ...anchor, groundedText: anchor.text, groundMethod: "normalized", confidence: 0.95 });
      continue;
    }

    if (anchorIsHeader) {
      console.log("[ANCHOR_REJECTED_HEADER]", { text: anchor.text.slice(0, 80), note: "anchor text is a header — recovering body sentence" });
    }

    // ── Stage 3: Semantic sentence recovery ──────────────────────────────
    // Find the best-scoring sentence from pageText that expresses the same idea.
    // Replace the semantic anchor with exact page text so SmartPDFViewer can locate it.
    let bestSentence: string | null = null;
    let bestScore = 0;

    for (const sentence of sentences) {
      const score = scoreSentenceMatch(anchor, sentence);
      if (score > bestScore) {
        bestScore = score;
        bestSentence = sentence;
      }
    }

    // Threshold: require strong evidence before accepting a recovered sentence.
    // 0.45 = at least ~45% key-term overlap plus structural bonus, or very high
    // term overlap alone. Tuned to accept "iodine deficiency causes goiter" → sentence
    // containing "iodine", "deficiency", "goiter" while rejecting weak matches.
    const RECOVERY_THRESHOLD = 0.45;

    // Final guard: never accept a recovered sentence that is itself a header.
    // (splitIntoSentences already filters these, but guard the result defensively.)
    if (bestSentence !== null && isLikelyHeaderLine(bestSentence)) {
      console.log("[ANCHOR_REJECTED_HEADER]", { text: bestSentence.slice(0, 80), note: "recovered candidate was a header" });
      bestSentence = null;
      bestScore = 0;
    }

    if (bestSentence !== null && bestScore >= RECOVERY_THRESHOLD) {
      console.log("[ANCHOR_SELECTED_BODY]", {
        text:   bestSentence.slice(0, 70),
        kind:   anchor.anchorType,
        score:  Math.round(bestScore * 100) / 100,
        method: "recovered",
        from:   anchor.text.slice(0, 50),
      });
      grounded.push({
        ...anchor,
        text:         bestSentence, // replace semantic text with grounded text
        groundedText: bestSentence,
        groundMethod: "recovered",
        confidence:   bestScore,
      });
    } else {
      console.log("[GROUND_ANCHOR_REJECTED]", {
        text:          anchor.text.slice(0, 70),
        bestScore:     Math.round(bestScore * 100) / 100,
        bestCandidate: bestSentence?.slice(0, 70) ?? "(none)",
      });
      // Drop — no highlight is better than a wrong highlight
    }
  }

  console.log("[GROUND_ANCHOR_FINAL]", {
    input:    anchors.length,
    grounded: grounded.length,
    rejected: anchors.length - grounded.length,
    methods:  grounded.map(a => a.groundMethod),
  });

  return grounded;
}
