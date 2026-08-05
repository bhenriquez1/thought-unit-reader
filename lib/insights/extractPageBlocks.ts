// lib/insights/extractPageBlocks.ts
// Structured, typed decomposition of a page's raw extracted text — sent to
// pages/api/page-annotation-plan.ts INSTEAD of one flattened paragraph blob,
// so headings and tables are visible to the model as what they are, not just
// buried lines in a wall of text. Pure, deterministic, no AI: every block is
// a verbatim slice of pageText (never rewritten), tagged with a type and its
// reading-order position.
//
// Deliberately conservative heuristics — a heading/table/list mistagged as a
// plain paragraph loses nothing (the model still reads the text), whereas an
// over-eager tagger risks making some real content unreachable if a
// downstream consumer ever filters by type. None currently do; type is
// presentation-only context for the model.

export type PageBlockType =
  | "heading"
  | "paragraph"
  | "list"
  | "table"
  | "caption"
  | "equation"
  | "figure-label";

export interface PageBlock {
  blockId: string;
  type: PageBlockType;
  /** Verbatim text of this block, exactly as it appears in pageText. */
  text: string;
  /** 0-based position in the page's reading order. */
  readingOrder: number;
}

const NUMBERED_LINE_RE = /^\s*(?:\d+[.)]|[-*•])\s+\S/;
const FIGURE_LABEL_ONLY_RE = /^(Figure|Fig\.?|Table|Box)\s*\d+(?:\.\d+)?[:.]?\s*$/i;
const FIGURE_CAPTION_RE = /^(Figure|Fig\.?|Table|Box)\s*\d+(?:\.\d+)?[:.]?\s+\S/i;
const EQUATION_RE = /^[^a-zA-Z]*[A-Za-z0-9_ ]{1,40}[=≈≤≥±][^a-zA-Z]*[A-Za-z0-9_ ()+\-*/^.,≈≤≥±]{1,60}$/;

/** Two-or-more-space column gaps on most lines of a block ⇒ tabular layout. */
function looksLikeTable(lines: string[]): boolean {
  if (lines.length < 2) return false;
  const columnar = lines.filter(l => /\S {2,}\S/.test(l));
  return columnar.length >= Math.max(2, Math.ceil(lines.length * 0.6));
}

function looksLikeList(lines: string[]): boolean {
  if (lines.length < 2) return false;
  const matching = lines.filter(l => NUMBERED_LINE_RE.test(l));
  return matching.length >= Math.ceil(lines.length * 0.6);
}

function looksLikeHeading(block: string, isFirstBlock: boolean): boolean {
  if (block.includes("\n")) return false;
  const trimmed = block.trim();
  if (trimmed.length < 3 || trimmed.length > 90) return false;
  if (/[.!?;:]$/.test(trimmed)) return false; // headings don't end mid-sentence
  const words = trimmed.split(/\s+/);
  if (words.length > 12) return false;
  if (isFirstBlock) return true;
  // Title Case or ALL CAPS reads as a heading; a normal sentence fragment does not.
  const titleCaseWords = words.filter(w => /^[A-Z0-9]/.test(w));
  return titleCaseWords.length / words.length >= 0.6;
}

/**
 * Split raw page text into typed, ordered blocks. Paragraph breaks (blank
 * lines) are the primary boundary; each resulting chunk is classified once.
 */
export function extractPageBlocks(pageText: string): PageBlock[] {
  if (!pageText || !pageText.trim()) return [];

  const rawBlocks = pageText.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  const blocks: PageBlock[] = [];

  rawBlocks.forEach((raw, i) => {
    const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);

    let type: PageBlockType = "paragraph";
    if (FIGURE_LABEL_ONLY_RE.test(raw)) {
      type = "figure-label";
    } else if (FIGURE_CAPTION_RE.test(raw)) {
      type = "caption";
    } else if (lines.length === 1 && EQUATION_RE.test(raw)) {
      type = "equation";
    } else if (looksLikeTable(lines)) {
      type = "table";
    } else if (looksLikeList(lines)) {
      type = "list";
    } else if (looksLikeHeading(raw, i === 0)) {
      type = "heading";
    }

    blocks.push({ blockId: `block-${i}`, type, text: raw, readingOrder: i });
  });

  return blocks;
}
