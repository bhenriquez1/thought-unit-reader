import type { NormalizedPageBlock, RawPageBlock } from "./types";
import { cleanBlockText } from "./textCleanup";

function repairSoftHyphens(text: string): string {
  return text.replace(/\u00ad/g, "");
}

function repairLineWrapHyphens(text: string): string {
  return text.replace(/([A-Za-z])-\s+([a-z])/g, "$1$2");
}

function normalizeWS(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function cleanText(text: string): string {
  return normalizeWS(repairLineWrapHyphens(repairSoftHyphens(text)));
}

/**
 * Split a normalized block into individual sentences.
 * Uses sentence-boundary detection (capital-following punctuation).
 */
function splitSentences(text: string): string[] {
  const cleaned = cleanText(text);
  if (!cleaned) return [];
  // Split at ". " or "! " or "? " followed by a capital letter or digit
  const parts = cleaned
    .split(/(?<=[.?!:])\s+(?=[A-Z0-9])/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts : [cleaned];
}

function isLikelyNoise(text: string): boolean {
  const t = cleanText(text);
  if (!t || t.length < 3) return true;
  if (/^[\W_]+$/.test(t)) return true;
  if (/^(page\s+\d+|copyright|\u00a9|all rights reserved)$/i.test(t)) return true;
  return false;
}

function isCompleteBlock(text: string, sentences: string[]): boolean {
  const t = cleanText(text);
  if (!t || sentences.length === 0) return false;
  if (t.length < 20) return false;
  if (/[.?!:]$/.test(t)) return true;
  // Headings / form labels may not end in punctuation but are still complete
  if (t.length > 80) return true;
  return false;
}

function scoreBlock(block: RawPageBlock, text: string, sentences: string[]): number {
  let score = 0;
  if (!isLikelyNoise(text)) score += 2;
  if (text.length >= 40)    score += 2;
  if (text.length >= 100)   score += 1;
  if (sentences.length >= 1) score += 1;
  if (block.kind === "heading")    score += 2;
  if (block.kind === "caption")    score += 1;
  if (block.kind === "form_field") score += 2;
  if (block.kind === "table_row")  score += 1;
  return score;
}

export function normalizePageBlocks(blocks: RawPageBlock[]): NormalizedPageBlock[] {
  return blocks.map((block) => {
    const text = cleanText(block.text);
    const sentences = splitSentences(text);
    const isNoise = isLikelyNoise(text);
    const isComplete = isCompleteBlock(text, sentences);
    const score = scoreBlock(block, text, sentences);

    return {
      id: `norm-${block.id}`,
      sourceId: block.id,
      kind: block.kind,
      pageNumber: block.pageNumber,
      text,
      sentences,
      blockIndex: block.blockIndex,
      bbox: block.bbox,
      isComplete,
      isLikelyNoise: isNoise,
      score,
    };
  });
}
