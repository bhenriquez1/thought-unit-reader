import type { RawPageBlock, RawPageBlockKind } from "./types";

function isBlank(text: string): boolean {
  return !text || !text.trim();
}

function normalizeLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function looksLikeHeading(text: string): boolean {
  const t = normalizeLine(text);
  if (!t || t.length > 140) return false;
  if (/^(chapter|section|part|appendix|unit|module)\b/i.test(t)) return true;
  // ALL-CAPS short line (4+ chars) with no sentence punctuation
  if (/^[A-Z][A-Z0-9\s,:()/-]{3,}$/.test(t) && !/[.!?]$/.test(t)) return true;
  return false;
}

function looksLikeListItem(text: string): boolean {
  return /^(\d+[\.\)]|[A-Za-z][\.\)]|[-•*◦])\s+/.test(text.trim());
}

function looksLikeFormField(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/_{3,}/.test(t)) return true;
  if (/\[\s*\]/.test(t)) return true;  // checkbox
  if (/:\s*$/.test(t) && t.length < 80) return true;
  if (/^\d+\.\s+.{5,}\?/.test(t)) return true;  // numbered question
  return false;
}

function looksLikeTableRow(text: string): boolean {
  const t = normalizeLine(text);
  if (!t || t.length > 300) return false;
  // Multiple columns separated by 2+ spaces
  if (/\s{2,}/.test(text) && t.length < 220) return true;
  // Pipe-separated
  if (/\|\s/.test(t)) return true;
  return false;
}

function looksLikeCaption(text: string): boolean {
  return /^(fig\.?|figure|table|box|diagram|chart)\s*\d+/i.test(text.trim());
}

function classifyBlockKind(text: string): RawPageBlockKind {
  if (looksLikeCaption(text))    return "caption";
  if (looksLikeHeading(text))    return "heading";
  if (looksLikeFormField(text))  return "form_field";
  if (looksLikeListItem(text))   return "list_item";
  if (looksLikeTableRow(text))   return "table_row";
  return "paragraph";
}

// ---------------------------------------------------------------------------
// Splitting strategies
// ---------------------------------------------------------------------------

function splitByBlankLines(pageText: string): string[] {
  return pageText
    .split(/\n\s*\n/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

/**
 * Dense-text heuristic: merge wrapped lines into logical blocks by detecting
 * sentence boundaries and structural cues (headings, list items, form fields).
 */
function splitDenseText(pageText: string): string[] {
  const lines = pageText
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .filter((line) => line.trim().length > 0);

  const blocks: string[] = [];
  let current: string[] = [];

  const flush = () => {
    if (!current.length) return;
    const text = current.join(" ").replace(/\s+/g, " ").trim();
    if (text) blocks.push(text);
    current = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const isStructural =
      looksLikeHeading(trimmed) ||
      looksLikeCaption(trimmed) ||
      looksLikeListItem(trimmed) ||
      looksLikeFormField(trimmed);

    if (isStructural) {
      flush();
      blocks.push(trimmed);
      continue;
    }

    const endsSentence = /[.!?:"")]$/.test(trimmed);
    current.push(trimmed);

    // Start a new block after a sentence-ending line of >= 2 accumulated lines
    if (endsSentence && current.length >= 2) {
      flush();
    }
  }

  flush();
  return blocks;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function segmentPageBlocks(
  pageText: string,
  layoutBlocks?: RawPageBlock[],
): RawPageBlock[] {
  if (!pageText && !layoutBlocks?.length) return [];

  // If the caller already has structured layout blocks, normalize and return them.
  if (layoutBlocks?.length) {
    return layoutBlocks
      .filter((block) => !isBlank(block.text))
      .map((block, index) => ({
        ...block,
        blockIndex: index,
        rawText: block.rawText ?? block.text,
        text: normalizeLine(block.text),
        kind: block.kind ?? classifyBlockKind(block.text),
      }));
  }

  const byBlankLines = splitByBlankLines(pageText);
  // Prefer blank-line splitting (> 1 paragraph found); fall back to dense heuristic.
  const sourceParagraphs =
    byBlankLines.length > 1 ? byBlankLines : splitDenseText(pageText);

  return sourceParagraphs
    .filter((text) => !isBlank(text))
    .map((text, index) => ({
      id: `raw-block-${index}`,
      kind: classifyBlockKind(text),
      pageNumber: 0,
      text: normalizeLine(text),
      rawText: text,
      blockIndex: index,
    }));
}
