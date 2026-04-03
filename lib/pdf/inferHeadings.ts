import type { HeadingCandidate } from "@/lib/toc/detectHeadingCandidates";

export type SemanticHeading = {
  id: string;
  text: string;
  level: number;
  pageNumber: number;
  paragraphId: string;
  score: number;
  reasonFlags: string[];
};

type InferHeadingsArgs = {
  candidates: HeadingCandidate[];
  minScore?: number;
  maxLevels?: number;
};

export function inferHeadings({
  candidates,
  minScore = 0.5,
  maxLevels = 4,
}: InferHeadingsArgs): SemanticHeading[] {
  const filtered = candidates
    .filter((candidate) => candidate.score >= minScore)
    .filter((candidate) => !looksLikeRejectedHeading(candidate.text))
    .sort((a, b) => {
      if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
      if (a.startLineIndex !== b.startLineIndex) return a.startLineIndex - b.startLineIndex;
      return b.score - a.score;
    });

  const normalized = filtered.map((candidate, index) =>
    toSemanticHeading(candidate, index, maxLevels),
  );

  const deduped = dedupeSemanticHeadings(normalized);
  return normalizeLevels(deduped, maxLevels);
}

function toSemanticHeading(
  candidate: HeadingCandidate,
  index: number,
  maxLevels: number,
): SemanticHeading {
  const level = inferFinalLevel(candidate, maxLevels);

  return {
    id: candidate.id || `semantic-heading-${candidate.pageNumber}-${index}`,
    text: normalizeHeadingText(candidate.text),
    level,
    pageNumber: candidate.pageNumber,
    paragraphId: candidate.paragraphId,
    score: clamp(candidate.score, 0, 1),
    reasonFlags: [...candidate.reasonFlags],
  };
}

function inferFinalLevel(candidate: HeadingCandidate, maxLevels: number): number {
  const text = candidate.text.trim();
  const score = candidate.score;
  const hinted = clamp(candidate.candidateLevelHint || 2, 1, maxLevels);

  if (/^(chapter|chap\.?)\s+\d+/i.test(text)) return 1;
  if (/^(appendix|appendices)\b/i.test(text)) return 1;

  if (/^\d+(\.\d+)+\b/.test(text)) {
    const depth = (text.match(/\./g) || []).length + 1;
    return clamp(depth, 2, maxLevels);
  }

  if (/^\d+\b/.test(text) && hinted > 2) {
    return clamp(hinted, 1, maxLevels);
  }

  if (score >= 0.88) return 1;
  if (score >= 0.72) return clamp(Math.min(hinted, 2), 1, maxLevels);
  if (score >= 0.58) return clamp(Math.max(hinted, 2), 1, maxLevels);

  return clamp(hinted, 1, maxLevels);
}

function dedupeSemanticHeadings(headings: SemanticHeading[]): SemanticHeading[] {
  const seen = new Map<string, SemanticHeading>();

  for (const heading of headings) {
    const key = [heading.pageNumber, heading.level, canonicalize(heading.text)].join("::");

    const existing = seen.get(key);
    if (!existing || heading.score > existing.score) {
      seen.set(key, heading);
    }
  }

  return Array.from(seen.values()).sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
    if (a.level !== b.level) return a.level - b.level;
    return a.text.localeCompare(b.text);
  });
}

function normalizeLevels(headings: SemanticHeading[], maxLevels: number): SemanticHeading[] {
  if (!headings.length) return headings;

  const uniqueLevels = Array.from(
    new Set(headings.map((heading) => heading.level).sort((a, b) => a - b)),
  );

  const levelMap = new Map<number, number>();
  uniqueLevels.forEach((level, index) => {
    levelMap.set(level, clamp(index + 1, 1, maxLevels));
  });

  return headings.map((heading) => ({
    ...heading,
    level: levelMap.get(heading.level) || heading.level,
  }));
}

function normalizeHeadingText(text: string): string {
  return text
    .replace(/\u00ad/g, "")
    .replace(/[‐\u2010-\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\s+([:;,.!?])/g, "$1")
    .trim();
}

function looksLikeRejectedHeading(text: string): boolean {
  if (!text) return true;
  if (/^page\s+\d+$/i.test(text)) return true;
  if (/^\d+$/.test(text)) return true;
  if (/^(figure|fig\.|table|box|plate)\s+\d+/i.test(text)) return true;
  if (/copyright|all rights reserved|isbn/i.test(text)) return true;
  if (text.length > 160) return true;
  return false;
}

function canonicalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
