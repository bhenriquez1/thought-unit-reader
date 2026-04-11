import type { NormalizedPageBlock, RawPageBlock } from "./types";
import {
  cleanBlockText,
  extractCompleteSentences,
  isLikelyNoiseText,
} from "./textCleanup";

function isCompleteBlock(text: string, sentences: string[]): boolean {
  const t = cleanBlockText(text);
  if (!t || sentences.length === 0) return false;
  if (t.length < 20) return false;
  if (/[.?!:]$/.test(t)) return true;
  // Headings and form labels often lack terminal punctuation but are still usable
  if (t.length > 80) return true;
  return false;
}

function scoreBlock(block: RawPageBlock, text: string, sentences: string[]): number {
  let score = 0;
  if (!isLikelyNoiseText(text)) score += 2;
  if (text.length >= 40)        score += 2;
  if (text.length >= 100)       score += 1;
  if (sentences.length >= 1)    score += 1;
  if (block.kind === "heading")    score += 2;
  if (block.kind === "caption")    score += 1;
  if (block.kind === "form_field") score += 2;
  if (block.kind === "table_row")  score += 1;
  return score;
}

export function normalizePageBlocks(blocks: RawPageBlock[]): NormalizedPageBlock[] {
  return blocks.map((block) => {
    const text      = cleanBlockText(block.text);
    // extractCompleteSentences repairs broken sequences, splits, deduplicates
    const sentences = extractCompleteSentences(text);
    const isNoise   = isLikelyNoiseText(text);
    const isComplete = isCompleteBlock(text, sentences);
    const score     = scoreBlock(block, text, sentences);

    return {
      id:           `norm-${block.id}`,
      sourceId:     block.id,
      kind:         block.kind,
      pageNumber:   block.pageNumber,
      text,
      sentences,
      blockIndex:   block.blockIndex,
      bbox:         block.bbox,
      isComplete,
      isLikelyNoise: isNoise,
      score,
    };
  });
}
