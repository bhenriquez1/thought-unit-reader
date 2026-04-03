import {
  reconstructParagraphs,
  type RawLine,
  type ReconstructedParagraph,
} from "./reconstructParagraphs";
import { inferHeadings, type SemanticHeading } from "./inferHeadings";
import { detectHeadingCandidates, type HeadingCandidate } from "@/lib/toc/detectHeadingCandidates";

export type SemanticSentence = {
  id: string;
  text: string;
  paragraphId: string;
  startOffset: number;
  endOffset: number;
  confidence: number;
};

export type SemanticParagraph = ReconstructedParagraph & {
  sentences: SemanticSentence[];
};

export type SemanticPage = {
  pageNumber: number;
  headingCandidates: HeadingCandidate[];
  headings: SemanticHeading[];
  paragraphs: SemanticParagraph[];
  sentences: SemanticSentence[];
  discardedArtifacts: string[];
  extractionConfidence: number;
};

type BuildSemanticPageArgs = {
  pageNumber: number;
  rawLines: RawLine[];
  documentStats?: {
    avgParagraphFontSize?: number;
    dominantLeftX?: number;
    commonHeadingPatterns?: string[];
  };
  headingConfig?: {
    minScore?: number;
    maxLevels?: number;
  };
};

export function buildSemanticPage({
  pageNumber,
  rawLines,
  documentStats,
  headingConfig,
}: BuildSemanticPageArgs): SemanticPage {
  const { keptLines, discardedArtifacts } = normalizeRawLines(rawLines);

  const reconstructed = reconstructParagraphs(keptLines);

  const semanticParagraphs: SemanticParagraph[] = reconstructed.map((para) => {
    const sentences = reconstructSentences(para.text, para.id);
    return {
      ...para,
      sentences,
    };
  });

  const sentences = semanticParagraphs.flatMap((para) => para.sentences);

  const headingCandidates = detectHeadingCandidates({
    paragraphs: reconstructed,
    pageNumber,
    documentStats,
  });

  const headings = inferHeadings({
    candidates: headingCandidates,
    minScore: headingConfig?.minScore ?? 0.5,
    maxLevels: headingConfig?.maxLevels ?? 4,
  });

  return {
    pageNumber,
    headingCandidates,
    headings,
    paragraphs: semanticParagraphs,
    sentences,
    discardedArtifacts,
    extractionConfidence: estimatePageConfidence(
      semanticParagraphs,
      sentences,
      headings,
      discardedArtifacts,
      headingCandidates,
    ),
  };
}

function normalizeRawLines(rawLines: RawLine[]): {
  keptLines: RawLine[];
  discardedArtifacts: string[];
} {
  const discardedArtifacts: string[] = [];
  const lineCounts = new Map<string, number>();

  const prepared = rawLines.map((line, index) => {
    let text = line.text ?? "";

    text = text
      .replace(/\u00ad/g, "")
      .replace(/[\u2010-\u2013]/g, "-")
      .replace(/\s+/g, " ")
      .trim();

    return {
      ...line,
      id: line.id ?? `raw-${index}`,
      text,
    };
  });

  for (const line of prepared) {
    const norm = normalizeForRepeat(line.text);
    if (!norm) continue;
    lineCounts.set(norm, (lineCounts.get(norm) || 0) + 1);
  }

  const keptLines: RawLine[] = [];

  for (const line of prepared) {
    const text = line.text.trim();
    const norm = normalizeForRepeat(text);

    if (!text) continue;

    if (looksLikeArtifact(text)) {
      discardedArtifacts.push(text);
      continue;
    }

    if (norm && (lineCounts.get(norm) || 0) >= 4 && looksLikeRunningHeader(text)) {
      discardedArtifacts.push(text);
      continue;
    }

    keptLines.push(line);
  }

  return { keptLines, discardedArtifacts };
}

function reconstructSentences(
  paragraphText: string,
  paragraphId: string,
): SemanticSentence[] {
  const cleaned = paragraphText.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  const rawPieces = smartSentenceSplit(cleaned);
  const sentences: SemanticSentence[] = [];

  let cursor = 0;
  for (let i = 0; i < rawPieces.length; i += 1) {
    const piece = rawPieces[i].trim();
    const text = cleanupSentence(piece);
    if (!text) continue;

    const startOffset = cleaned.indexOf(piece, cursor);
    const safeStart = startOffset >= 0 ? startOffset : cursor;
    const endOffset = safeStart + text.length;
    cursor = endOffset;

    sentences.push({
      id: `${paragraphId}-sent-${sentences.length}`,
      text,
      paragraphId,
      startOffset: safeStart,
      endOffset,
      confidence: estimateSentenceConfidence(text),
    });
  }

  return mergeBrokenSentences(sentences);
}

function smartSentenceSplit(text: string): string[] {
  const parts: string[] = [];
  let current = "";

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1] || "";

    current += char;

    const isTerminal = /[.!?]/.test(char);
    const looksLikeAbbrev = /\b(?:Fig|Dr|Mr|Mrs|Ms|Prof|Eq|No|vs)\.$/i.test(current);
    const decimalNumber = /\d\.$/.test(current) && /\d/.test(next);

    if (isTerminal && !looksLikeAbbrev && !decimalNumber) {
      if (!next || /\s|["')\]]/.test(next)) {
        parts.push(current.trim());
        current = "";
      }
    }
  }

  if (current.trim()) parts.push(current.trim());

  return parts.length ? parts : [text];
}

function mergeBrokenSentences(sentences: SemanticSentence[]): SemanticSentence[] {
  if (!sentences.length) return [];

  const merged: SemanticSentence[] = [];
  let current = { ...sentences[0] };

  for (let i = 1; i < sentences.length; i += 1) {
    const next = sentences[i];

    if (shouldMergeSentences(current.text, next.text)) {
      current = {
        ...current,
        text: `${current.text.replace(/[.]$/, "")} ${next.text}`.trim(),
        endOffset: next.endOffset,
        confidence: Math.min(current.confidence, next.confidence),
      };
      continue;
    }

    merged.push(current);
    current = { ...next };
  }

  merged.push(current);
  return merged;
}

function shouldMergeSentences(prev: string, next: string): boolean {
  if (!prev || !next) return false;
  if (prev.split(/\s+/).length < 4) return true;
  if (/^(and|or|but|so|because|which|that|whereas|while)\b/i.test(next)) return true;
  if (/^[a-z(]/.test(next)) return true;
  return false;
}

function cleanupSentence(text: string): string {
  let s = text
    .replace(/\s+/g, " ")
    .replace(/(\w)- (\w)/g, "$1$2")
    .trim();

  s = s.replace(/^(and|or|but|so|because|whereas)\s+/i, "");

  if (!s) return "";

  s = s.charAt(0).toUpperCase() + s.slice(1);

  if (!/[.!?]$/.test(s)) {
    s += ".";
  }

  return s;
}

function estimateSentenceConfidence(text: string): number {
  let score = 0.5;
  if (text.length > 20) score += 0.15;
  if (/[.!?]$/.test(text)) score += 0.1;
  if (!looksLikeArtifact(text)) score += 0.1;
  if (/\b(is|are|was|were|has|have|can|may|will|should)\b/i.test(text)) {
    score += 0.1;
  }
  return clamp(score, 0, 1);
}

function estimatePageConfidence(
  paragraphs: SemanticParagraph[],
  sentences: SemanticSentence[],
  headings: SemanticHeading[],
  discardedArtifacts: string[],
  headingCandidates: HeadingCandidate[],
): number {
  let score = 0.35;

  if (paragraphs.length >= 2) score += 0.15;
  if (sentences.length >= 4) score += 0.15;
  if (headingCandidates.length >= 1) score += 0.08;
  if (headings.length >= 1) score += 0.1;
  if (discardedArtifacts.length <= Math.max(2, paragraphs.length)) score += 0.07;

  const avgSentenceConfidence =
    sentences.length > 0
      ? sentences.reduce((sum, s) => sum + s.confidence, 0) / sentences.length
      : 0.4;

  const avgHeadingScore =
    headings.length > 0
      ? headings.reduce((sum, h) => sum + h.score, 0) / headings.length
      : 0.35;

  score += (avgSentenceConfidence - 0.5) * 0.35;
  score += (avgHeadingScore - 0.35) * 0.25;

  return clamp(score, 0, 1);
}

function normalizeForRepeat(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function looksLikeArtifact(text: string): boolean {
  if (!text) return true;
  if (/^\d+$/.test(text)) return true;
  if (/^page\s+\d+$/i.test(text)) return true;
  if (/^[^\w]{3,}$/.test(text)) return true;
  if (text.length <= 2) return true;
  return false;
}

function looksLikeRunningHeader(text: string): boolean {
  return (
    text.length < 80 &&
    /chapter\s+\d+|appendix|copyright|all rights reserved|printed in|edition/i.test(text)
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
