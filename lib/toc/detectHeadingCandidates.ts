import type { ReconstructedParagraph } from "@/lib/pdf/reconstructParagraphs";

export type HeadingCandidate = {
  id: string;
  text: string;
  pageNumber: number;
  paragraphId: string;
  lineIds: string[];
  startLineIndex: number;
  endLineIndex: number;
  avgX: number;
  avgFontSize: number;
  candidateLevelHint: number;
  score: number;
  reasonFlags: string[];
};

type DetectHeadingCandidatesArgs = {
  paragraphs: ReconstructedParagraph[];
  pageNumber: number;
  documentStats?: {
    avgParagraphFontSize?: number;
    dominantLeftX?: number;
  };
};

const CHAPTER_RE = /^(chapter|chap\.?)\s+\d+/i;
const SECTION_RE = /^\d+(\.\d+)+\b/;
const SIMPLE_NUM_RE = /^\d+\b/;
const ROMAN_RE = /^(?:[IVXLCDM]+)\.?\s+/i;
const APPENDIX_RE = /^(appendix|appendices)\b/i;
const CAPTION_RE = /^(figure|fig\.|table|box|plate)\s+\d+/i;
const BULLET_RE = /^([•▪◦‣⁃*-]|\d+[.)]|[A-Z][.)])\s+/;

export function detectHeadingCandidates({
  paragraphs,
  pageNumber,
  documentStats,
}: DetectHeadingCandidatesArgs): HeadingCandidate[] {
  const avgFont =
    documentStats?.avgParagraphFontSize ??
    average(paragraphs.map((p) => p.avgFontSize).filter((n) => Number.isFinite(n))) ??
    12;

  const dominantLeftX =
    documentStats?.dominantLeftX ??
    average(
      paragraphs
        .filter((p) => p.kind === "prose")
        .map((p) => p.avgX)
        .filter((n) => Number.isFinite(n)),
    ) ??
    0;

  const candidates: HeadingCandidate[] = [];

  for (const para of paragraphs) {
    const candidate = scoreHeadingCandidate(para, pageNumber, avgFont, dominantLeftX);
    if (!candidate) continue;
    candidates.push(candidate);
  }

  return dedupeCandidates(candidates).sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
    if (a.startLineIndex !== b.startLineIndex) return a.startLineIndex - b.startLineIndex;
    return b.score - a.score;
  });
}

function scoreHeadingCandidate(
  para: ReconstructedParagraph,
  pageNumber: number,
  avgFont: number,
  dominantLeftX: number,
): HeadingCandidate | null {
  const text = para.text.trim();
  if (!text) return null;

  const reasonFlags: string[] = [];
  let score = 0;

  // hard rejections
  if (CAPTION_RE.test(text)) return null;
  if (looksLikeRunningHeader(text)) return null;
  if (looksLikeCopyright(text)) return null;
  if (looksLikeLongSentence(text)) return null;
  if (para.kind === "table_like") return null;
  if (BULLET_RE.test(text)) return null;

  // baseline heuristics
  if (text.length <= 100) {
    score += 0.12;
    reasonFlags.push("short_line");
  }

  if (!/[.!?]$/.test(text)) {
    score += 0.12;
    reasonFlags.push("no_terminal_punctuation");
  }

  if (para.kind === "heading_like") {
    score += 0.22;
    reasonFlags.push("heading_like_block");
  }

  if (para.avgFontSize > avgFont + 1.5) {
    score += 0.18;
    reasonFlags.push("larger_font");
  }

  if (Math.abs(para.avgX - dominantLeftX) <= 6) {
    score += 0.05;
    reasonFlags.push("dominant_left_alignment");
  }

  if (para.avgX < dominantLeftX - 8) {
    score += 0.08;
    reasonFlags.push("outdented_left");
  }

  // numbering / structural patterns
  if (CHAPTER_RE.test(text)) {
    score += 0.3;
    reasonFlags.push("chapter_pattern");
  }

  if (APPENDIX_RE.test(text)) {
    score += 0.25;
    reasonFlags.push("appendix_pattern");
  }

  if (SECTION_RE.test(text)) {
    score += 0.24;
    reasonFlags.push("section_pattern");
  }

  if (ROMAN_RE.test(text)) {
    score += 0.12;
    reasonFlags.push("roman_pattern");
  }

  if (SIMPLE_NUM_RE.test(text) && text.length < 80) {
    score += 0.08;
    reasonFlags.push("simple_number_pattern");
  }

  // text-shape heuristics
  if (isMostlyTitleCase(text)) {
    score += 0.12;
    reasonFlags.push("title_case");
  }

  if (isMostlyUppercase(text)) {
    score += 0.1;
    reasonFlags.push("uppercase");
  }

  if (looksLikeHeadingPhrase(text)) {
    score += 0.12;
    reasonFlags.push("heading_phrase");
  }

  // penalties
  if (looksLikeArtifact(text)) {
    score -= 0.4;
    reasonFlags.push("artifact_penalty");
  }

  if (looksLikeReferenceEntry(text)) {
    score -= 0.25;
    reasonFlags.push("reference_penalty");
  }

  if (looksLikeEquationLine(text)) {
    score -= 0.25;
    reasonFlags.push("equation_penalty");
  }

  if (looksLikeOverlyDenseText(text)) {
    score -= 0.18;
    reasonFlags.push("dense_text_penalty");
  }

  const finalScore = clamp(score, 0, 1);
  if (finalScore < 0.45) return null;

  return {
    id: `candidate-${pageNumber}-${para.id}`,
    text,
    pageNumber,
    paragraphId: para.id,
    lineIds: para.lineIds,
    startLineIndex: para.startLineIndex,
    endLineIndex: para.endLineIndex,
    avgX: para.avgX,
    avgFontSize: para.avgFontSize,
    candidateLevelHint: inferCandidateLevelHint(text, para.avgFontSize, avgFont),
    score: finalScore,
    reasonFlags,
  };
}

function inferCandidateLevelHint(text: string, fontSize: number, avgFont: number): number {
  if (CHAPTER_RE.test(text) || APPENDIX_RE.test(text)) return 1;

  if (SECTION_RE.test(text)) {
    const dots = (text.match(/\./g) || []).length;
    return clamp(dots + 1, 2, 5);
  }

  if (fontSize > avgFont + 3) return 1;
  if (fontSize > avgFont + 1.5) return 2;
  if (SIMPLE_NUM_RE.test(text)) return 2;
  return 3;
}

function dedupeCandidates(candidates: HeadingCandidate[]): HeadingCandidate[] {
  const seen = new Set<string>();
  const result: HeadingCandidate[] = [];

  for (const candidate of candidates) {
    const key = `${candidate.pageNumber}::${canonicalize(candidate.text)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }

  return result;
}

function looksLikeHeadingPhrase(text: string): boolean {
  return (
    /\b(introduction|overview|summary|discussion|conclusion|methods?|results?|analysis|diagnosis|treatment|management|pathogenesis|etiology|classification|clinical features|radiographic features|references)\b/i.test(
      text,
    ) && text.length < 90
  );
}

function looksLikeRunningHeader(text: string): boolean {
  return (
    text.length < 80 &&
    /chapter\s+\d+|appendix|copyright|all rights reserved|printed in|edition/i.test(text)
  );
}

function looksLikeCopyright(text: string): boolean {
  return /copyright|all rights reserved|isbn|library of congress/i.test(text);
}

function looksLikeLongSentence(text: string): boolean {
  return text.length > 140 && /\b(is|are|was|were|has|have|had|can|may)\b/i.test(text);
}

function looksLikeReferenceEntry(text: string): boolean {
  return /\b(et al\.|doi:|vol\.|pp\.|journal|edition)\b/i.test(text);
}

function looksLikeEquationLine(text: string): boolean {
  const operators = (text.match(/[=+\-/*<>]/g) || []).length;
  return operators >= 3 && /\d/.test(text);
}

function looksLikeOverlyDenseText(text: string): boolean {
  const words = text.split(/\s+/).filter(Boolean);
  return words.length > 18;
}

function looksLikeArtifact(text: string): boolean {
  if (!text) return true;
  if (text.length <= 2) return true;
  if (/^\d+$/.test(text)) return true;
  if (/^[^\w]{3,}$/.test(text)) return true;
  return false;
}

function isMostlyUppercase(text: string): boolean {
  const letters = text.replace(/[^A-Za-z]/g, "");
  if (!letters.length) return false;
  const upper = letters.replace(/[^A-Z]/g, "").length;
  return upper / letters.length > 0.7;
}

function isMostlyTitleCase(text: string): boolean {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 14) return false;

  let titleish = 0;
  for (const word of words) {
    if (/^[A-Z][a-z]+/.test(word) || /^\d/.test(word)) titleish += 1;
  }

  return titleish / words.length > 0.6;
}

function canonicalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
