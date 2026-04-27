// lib/highlights/matchNeighborhoodMemberToText.ts

export type MatchConfidence = "exact" | "strong" | "approximate" | "weak" | "none";

export type NeighborhoodMemberKind =
  | "anchor"
  | "support"
  | "additional"
  | "trap";

export interface NeighborhoodMember {
  id: string;
  text: string;
  kind: NeighborhoodMemberKind;
  sentenceId?: string;
  paragraphId?: string;
  headingId?: string;
  startOffset?: number;
  endOffset?: number;
}

export interface PageSentenceRecord {
  id: string;
  text: string;
  normalizedText?: string;
  paragraphId?: string;
  headingId?: string;
  startOffset?: number;
  endOffset?: number;
}

export interface PageParagraphRecord {
  id: string;
  text: string;
  normalizedText?: string;
  headingId?: string;
  sentenceIds?: string[];
  startOffset?: number;
  endOffset?: number;
}

export interface PageTextRecord {
  rawText: string;
  normalizedText?: string;
  sentences?: PageSentenceRecord[];
  paragraphs?: PageParagraphRecord[];
}

export interface TextSpanCandidate {
  startOffset: number;
  endOffset: number;
  matchedText: string;
  normalizedMatchedText: string;
  confidence: MatchConfidence;
  score: number;
  strategy:
    | "sentence_id"
    | "exact_sentence_text"
    | "normalized_sentence_text"
    | "paragraph_local_exact"
    | "paragraph_local_normalized"
    | "token_window"
    | "offset_fallback"
    | "none";
  sentenceId?: string;
  paragraphId?: string;
}

export interface MatchNeighborhoodMemberResult {
  memberId: string;
  matched: boolean;
  best: TextSpanCandidate | null;
  candidates: TextSpanCandidate[];
}

/**
 * Main matcher:
 * tries exact sentence anchoring first, then normalized text matching,
 * then paragraph-local matching, then token-window recovery, then offset fallback.
 *
 * This is designed to work across many book types, including OCR-imperfect pages.
 */
export function matchNeighborhoodMemberToText(
  member: NeighborhoodMember,
  page: PageTextRecord
): MatchNeighborhoodMemberResult {
  const rawPageText = page.rawText || "";
  const normalizedPageText = page.normalizedText || normalizeText(rawPageText);

  const allCandidates: TextSpanCandidate[] = [];

  if (!member.text?.trim() || !rawPageText.trim()) {
    return {
      memberId: member.id,
      matched: false,
      best: null,
      candidates: [],
    };
  }

  const sentenceById = trySentenceIdMatch(member, page);
  if (sentenceById) allCandidates.push(sentenceById);

  const exactSentence = tryExactSentenceTextMatch(member, page);
  if (exactSentence) allCandidates.push(exactSentence);

  const normalizedSentence = tryNormalizedSentenceTextMatch(member, page);
  if (normalizedSentence) allCandidates.push(normalizedSentence);

  const paragraphLocalExact = tryParagraphLocalExactMatch(member, page);
  if (paragraphLocalExact) allCandidates.push(paragraphLocalExact);

  const paragraphLocalNormalized = tryParagraphLocalNormalizedMatch(member, page);
  if (paragraphLocalNormalized) allCandidates.push(paragraphLocalNormalized);

  const tokenWindow = tryTokenWindowMatch(member, rawPageText, normalizedPageText, page);
  if (tokenWindow) allCandidates.push(tokenWindow);

  const offsetFallback = tryOffsetFallback(member, page);
  if (offsetFallback) allCandidates.push(offsetFallback);

  const ranked = dedupeAndRankCandidates(allCandidates);
  const best = ranked[0] ?? null;

  return {
    memberId: member.id,
    matched: Boolean(best && best.confidence !== "none"),
    best,
    candidates: ranked,
  };
}

/* -------------------------------------------------------------------------- */
/*                                   MATCHERS                                 */
/* -------------------------------------------------------------------------- */

function trySentenceIdMatch(
  member: NeighborhoodMember,
  page: PageTextRecord
): TextSpanCandidate | null {
  if (!member.sentenceId || !page.sentences?.length) return null;

  const sentence = page.sentences.find((s) => s.id === member.sentenceId);
  if (!sentence?.text) return null;

  const startOffset =
    typeof sentence.startOffset === "number"
      ? sentence.startOffset
      : rawSearchOffset(page.rawText, sentence.text);

  if (startOffset < 0) return null;

  const endOffset =
    typeof sentence.endOffset === "number"
      ? sentence.endOffset
      : startOffset + sentence.text.length;

  return {
    startOffset,
    endOffset,
    matchedText: sliceText(page.rawText, startOffset, endOffset),
    normalizedMatchedText: normalizeText(sliceText(page.rawText, startOffset, endOffset)),
    confidence: "exact",
    score: 1,
    strategy: "sentence_id",
    sentenceId: sentence.id,
    paragraphId: sentence.paragraphId,
  };
}

function tryExactSentenceTextMatch(
  member: NeighborhoodMember,
  page: PageTextRecord
): TextSpanCandidate | null {
  if (!page.sentences?.length) return null;

  const target = cleanMemberText(member.text);
  const targetNorm = normalizeText(target);

  let best: TextSpanCandidate | null = null;

  for (const sentence of page.sentences) {
    const sentenceText = cleanMemberText(sentence.text);
    if (!sentenceText) continue;

    if (sentenceText === target) {
      const startOffset =
        typeof sentence.startOffset === "number"
          ? sentence.startOffset
          : rawSearchOffset(page.rawText, sentenceText);

      if (startOffset < 0) continue;
      const endOffset =
        typeof sentence.endOffset === "number"
          ? sentence.endOffset
          : startOffset + sentenceText.length;

      best = {
        startOffset,
        endOffset,
        matchedText: sentenceText,
        normalizedMatchedText: targetNorm,
        confidence: "exact",
        score: 0.98,
        strategy: "exact_sentence_text",
        sentenceId: sentence.id,
        paragraphId: sentence.paragraphId,
      };
      break;
    }
  }

  return best;
}

function tryNormalizedSentenceTextMatch(
  member: NeighborhoodMember,
  page: PageTextRecord
): TextSpanCandidate | null {
  if (!page.sentences?.length) return null;

  const target = cleanMemberText(member.text);
  const targetNorm = normalizeText(target);
  if (!targetNorm) return null;

  let bestSentence: PageSentenceRecord | null = null;
  let bestScore = 0;

  for (const sentence of page.sentences) {
    const normalizedSentence = sentence.normalizedText || normalizeText(sentence.text);
    if (!normalizedSentence) continue;

    const sim = tokenSetSimilarity(targetNorm, normalizedSentence);
    if (sim > bestScore) {
      bestScore = sim;
      bestSentence = sentence;
    }
  }

  if (!bestSentence || bestScore < 0.65) return null;

  const sentenceText = cleanMemberText(bestSentence.text);
  const startOffset =
    typeof bestSentence.startOffset === "number"
      ? bestSentence.startOffset
      : rawSearchOffset(page.rawText, sentenceText);

  if (startOffset < 0) return null;

  const endOffset =
    typeof bestSentence.endOffset === "number"
      ? bestSentence.endOffset
      : startOffset + sentenceText.length;

  return {
    startOffset,
    endOffset,
    matchedText: sentenceText,
    normalizedMatchedText: normalizeText(sentenceText),
    confidence: bestScore > 0.92 ? "strong" : "approximate",
    score: 0.72 + bestScore * 0.2,
    strategy: "normalized_sentence_text",
    sentenceId: bestSentence.id,
    paragraphId: bestSentence.paragraphId,
  };
}

function tryParagraphLocalExactMatch(
  member: NeighborhoodMember,
  page: PageTextRecord
): TextSpanCandidate | null {
  if (!member.paragraphId || !page.paragraphs?.length) return null;

  const paragraph = page.paragraphs.find((p) => p.id === member.paragraphId);
  if (!paragraph?.text) return null;

  const target = cleanMemberText(member.text);
  if (!target) return null;

  const localIndex = paragraph.text.indexOf(target);
  if (localIndex < 0) return null;

  const paragraphStart =
    typeof paragraph.startOffset === "number"
      ? paragraph.startOffset
      : rawSearchOffset(page.rawText, paragraph.text);

  if (paragraphStart < 0) return null;

  const startOffset = paragraphStart + localIndex;
  const endOffset = startOffset + target.length;

  return {
    startOffset,
    endOffset,
    matchedText: sliceText(page.rawText, startOffset, endOffset),
    normalizedMatchedText: normalizeText(sliceText(page.rawText, startOffset, endOffset)),
    confidence: "strong",
    score: 0.88,
    strategy: "paragraph_local_exact",
    paragraphId: paragraph.id,
  };
}

function tryParagraphLocalNormalizedMatch(
  member: NeighborhoodMember,
  page: PageTextRecord
): TextSpanCandidate | null {
  if (!member.paragraphId || !page.paragraphs?.length) return null;

  const paragraph = page.paragraphs.find((p) => p.id === member.paragraphId);
  if (!paragraph?.text) return null;

  const targetNorm = normalizeText(member.text);
  const paragraphNorm = paragraph.normalizedText || normalizeText(paragraph.text);

  if (!targetNorm || !paragraphNorm) return null;

  const sim = tokenSetSimilarity(targetNorm, paragraphNorm);
  if (sim < 0.42) return null;

  const tokenCandidate = tokenWindowSearch(
    targetNorm,
    paragraph.text,
    paragraphNorm
  );
  if (!tokenCandidate) return null;

  const paragraphStart =
    typeof paragraph.startOffset === "number"
      ? paragraph.startOffset
      : rawSearchOffset(page.rawText, paragraph.text);

  if (paragraphStart < 0) return null;

  const startOffset = paragraphStart + tokenCandidate.localStart;
  const endOffset = paragraphStart + tokenCandidate.localEnd;

  return {
    startOffset,
    endOffset,
    matchedText: sliceText(page.rawText, startOffset, endOffset),
    normalizedMatchedText: normalizeText(sliceText(page.rawText, startOffset, endOffset)),
    confidence: sim > 0.7 ? "strong" : "approximate",
    score: 0.56 + sim * 0.2,
    strategy: "paragraph_local_normalized",
    paragraphId: paragraph.id,
  };
}

function tryTokenWindowMatch(
  member: NeighborhoodMember,
  rawPageText: string,
  normalizedPageText: string,
  page: PageTextRecord
): TextSpanCandidate | null {
  const targetNorm = normalizeText(member.text);
  if (!targetNorm) return null;

  const best = tokenWindowSearch(targetNorm, rawPageText, normalizedPageText);
  if (!best) return null;

  const confidence: MatchConfidence =
    best.score > 0.9 ? "strong" : best.score > 0.72 ? "approximate" : "weak";

  const maybeSentence = findSentenceForOffsets(best.localStart, best.localEnd, page.sentences);

  return {
    startOffset: best.localStart,
    endOffset: best.localEnd,
    matchedText: sliceText(rawPageText, best.localStart, best.localEnd),
    normalizedMatchedText: normalizeText(sliceText(rawPageText, best.localStart, best.localEnd)),
    confidence,
    score: best.score,
    strategy: "token_window",
    sentenceId: maybeSentence?.id,
    paragraphId: maybeSentence?.paragraphId,
  };
}

function tryOffsetFallback(
  member: NeighborhoodMember,
  page: PageTextRecord
): TextSpanCandidate | null {
  if (
    typeof member.startOffset !== "number" ||
    typeof member.endOffset !== "number" ||
    member.endOffset <= member.startOffset
  ) {
    return null;
  }

  const matchedText = sliceText(page.rawText, member.startOffset, member.endOffset);
  if (!matchedText.trim()) return null;

  const maybeSentence = findSentenceForOffsets(
    member.startOffset,
    member.endOffset,
    page.sentences
  );

  return {
    startOffset: member.startOffset,
    endOffset: member.endOffset,
    matchedText,
    normalizedMatchedText: normalizeText(matchedText),
    confidence: "weak",
    score: 0.35,
    strategy: "offset_fallback",
    sentenceId: maybeSentence?.id,
    paragraphId: maybeSentence?.paragraphId,
  };
}

/* -------------------------------------------------------------------------- */
/*                              TOKEN WINDOW SEARCH                           */
/* -------------------------------------------------------------------------- */

function tokenWindowSearch(
  targetNorm: string,
  rawScopeText: string,
  normalizedScopeText: string
): { localStart: number; localEnd: number; score: number } | null {
  const targetTokens = tokenize(targetNorm);
  const scopeTokens = tokenize(normalizedScopeText);

  if (!targetTokens.length || !scopeTokens.length) return null;

  let best:
    | { localStart: number; localEnd: number; score: number }
    | null = null;

  const maxWindow = Math.min(scopeTokens.length, Math.max(targetTokens.length + 8, 14));

  for (let start = 0; start < scopeTokens.length; start += 1) {
    for (
      let end = start + Math.max(3, targetTokens.length - 2);
      end <= Math.min(scopeTokens.length, start + maxWindow);
      end += 1
    ) {
      const windowTokens = scopeTokens.slice(start, end);
      const score = tokenArraySimilarity(targetTokens, windowTokens);

      if (!best || score > best.score) {
        const phrase = windowTokens.join(" ");
        const rawOffsets = approximateRawOffsetsFromNormalizedPhrase(rawScopeText, phrase);

        if (rawOffsets) {
          best = {
            localStart: rawOffsets.start,
            localEnd: rawOffsets.end,
            score,
          };
        }
      }
    }
  }

  if (!best || best.score < 0.58) return null;
  return best;
}

/* -------------------------------------------------------------------------- */
/*                                  HELPERS                                   */
/* -------------------------------------------------------------------------- */

function dedupeAndRankCandidates(
  candidates: TextSpanCandidate[]
): TextSpanCandidate[] {
  const byKey = new Map<string, TextSpanCandidate>();

  for (const c of candidates) {
    const key = `${c.startOffset}:${c.endOffset}:${c.strategy}`;
    const existing = byKey.get(key);
    if (!existing || c.score > existing.score) {
      byKey.set(key, c);
    }
  }

  return Array.from(byKey.values()).sort((a, b) => {
    const confCmp = confidenceRank(b.confidence) - confidenceRank(a.confidence);
    if (confCmp !== 0) return confCmp;
    return b.score - a.score;
  });
}

function confidenceRank(confidence: MatchConfidence): number {
  switch (confidence) {
    case "exact":
      return 5;
    case "strong":
      return 4;
    case "approximate":
      return 3;
    case "weak":
      return 2;
    default:
      return 1;
  }
}

function cleanMemberText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/[^\w\s\-=+*/^]/g, " ")  // preserve math operators so formula text matches
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return text
    .split(" ")
    .map((t) => t.trim())
    .filter(Boolean);
}

function tokenSetSimilarity(a: string, b: string): number {
  const aSet = new Set(tokenize(a));
  const bSet = new Set(tokenize(b));

  if (!aSet.size || !bSet.size) return 0;

  let overlap = 0;
  for (const token of aSet) {
    if (bSet.has(token)) overlap += 1;
  }

  const union = new Set([...aSet, ...bSet]).size || 1;
  return overlap / union;
}

function tokenArraySimilarity(aTokens: string[], bTokens: string[]): number {
  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);

  let overlap = 0;
  for (const token of aSet) {
    if (bSet.has(token)) overlap += 1;
  }

  const union = new Set([...aSet, ...bSet]).size || 1;
  return overlap / union;
}

function rawSearchOffset(rawText: string, exactText: string): number {
  if (!rawText || !exactText) return -1;
  return rawText.indexOf(exactText);
}

function sliceText(text: string, start: number, end: number): string {
  return text.slice(Math.max(0, start), Math.max(start, end));
}

function findSentenceForOffsets(
  start: number,
  end: number,
  sentences?: PageSentenceRecord[]
): PageSentenceRecord | undefined {
  if (!sentences?.length) return undefined;

  return sentences.find((s) => {
    if (typeof s.startOffset !== "number" || typeof s.endOffset !== "number") {
      return false;
    }
    return overlaps(start, end, s.startOffset, s.endOffset);
  });
}

function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Attempts to recover raw offsets of a normalized phrase inside raw text.
 * This is approximate but works well for OCR-imperfect line normalization.
 */
function approximateRawOffsetsFromNormalizedPhrase(
  rawText: string,
  normalizedPhrase: string
): { start: number; end: number } | null {
  const normalizedRaw = normalizeText(rawText);
  const phrase = normalizeText(normalizedPhrase);
  const normIndex = normalizedRaw.indexOf(phrase);
  if (normIndex < 0) return null;

  const mapping = buildNormalizedToRawIndexMap(rawText);
  const rawStart = mapping[normIndex];
  const rawEnd = mapping[Math.min(normIndex + phrase.length - 1, mapping.length - 1)] + 1;

  if (typeof rawStart !== "number" || typeof rawEnd !== "number") return null;

  return {
    start: rawStart,
    end: rawEnd,
  };
}

function buildNormalizedToRawIndexMap(rawText: string): number[] {
  const map: number[] = [];
  let normalized = "";

  for (let i = 0; i < rawText.length; i += 1) {
    const originalChar = rawText[i];
    const normalizedChunk = normalizeText(originalChar);

    if (!normalizedChunk) {
      // preserve a single space mapping if whitespace-ish
      if (/\s/.test(originalChar)) {
        if (!normalized.endsWith(" ")) {
          normalized += " ";
          map.push(i);
        }
      }
      continue;
    }

    for (const char of normalizedChunk) {
      normalized += char;
      map.push(i);
    }
  }

  return map;
}
