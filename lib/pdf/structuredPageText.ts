// lib/pdf/structuredPageText.ts
// Geometry-based page text reconstruction — shared by SmartPDFViewer (live grounding/
// synthesis input) and pdfjs-handler (whole-book diagnostics).
//
// Problem: pdf.js's getTextContent() returns text "items" whose chunking depends on
// how the source PDF's content stream happens to emit text runs — some PDFs emit
// per-paragraph runs, others per-line, others nearly per-word. A flat `.join(" ")`
// of item.str values discards the one signal that is consistent across every PDF:
// each item's position on the page (item.transform[4]/[5] = x/y).
//
// This reconstructs lines from y-proximity, then classifies the gap between
// consecutive lines as either a line-wrap within the same paragraph (joined with a
// space, with hyphenation merged) or a paragraph/section break (rendered as "\n\n"),
// based on the gap relative to the page's typical single-line spacing.
//
// Two-column detection: if items cluster into two horizontal bands with a gap of
// COLUMN_GAP_MIN_PTS or more between them, each column is processed independently
// (left column fully before right column). This prevents row-interleaved text on
// multi-column pages, which caused sentence jumps and PDF word-rect misses.

export type PdfTextItem = {
  str?: string;
  transform?: number[];
  /** 0-based index of this item in the page's textContent.items array. */
  itemIndex?: number;
};

// ── StructuredPageBridge — paragraph→item-index mapping ──────────────────────

/**
 * Maps one paragraph in the structured text output back to the PDF.js item
 * indexes that produced it, and records the paragraph's char span in the
 * structured text so callers can look it up by ReaderAnchor char offsets.
 */
export interface ParagraphMapping {
  /** Start character offset of this paragraph in the structured text output. */
  startChar: number;
  /** End character offset (exclusive) of this paragraph in the structured text output. */
  endChar: number;
  /** PDF.js item indexes (positions in textContent.items) that contributed to this paragraph. */
  itemIndexes: number[];
}

/**
 * Provenance bridge produced alongside the structured text.
 * Lets downstream consumers (buildCanonicalUnits) map paragraph char offsets
 * back to the original PDF.js item indexes for bounding-box retrieval.
 */
export interface StructuredPageBridge {
  /** One entry per paragraph in the structured text, in reading order. */
  paragraphMappings: ParagraphMapping[];
}

// ── StructuredPageText contract ──────────────────────────────────────────────

/** Bump when the column-detection or paragraph-gap algorithm changes. */
export const STRUCTURE_VERSION = 1;
/** Bump when buildStructuredPageText's paragraph boundary logic changes. */
export const PARAGRAPH_ALGORITHM_VERSION = 1;

/**
 * Immutable extraction contract produced once per page.
 * If extraction logic changes, bump the relevant version and regenerate;
 * never mutate an existing record in place.
 */
export interface StructuredPageText {
  readonly text: string;
  readonly structureVersion: number;
  readonly paragraphAlgorithmVersion: number;
  readonly createdAt: number;
}

/**
 * Wrap an already-built page text string in the versioned contract.
 * Call once per page immediately after buildStructuredPageText().
 */
export function makeStructuredPageText(text: string): StructuredPageText {
  return Object.freeze({
    text,
    structureVersion: STRUCTURE_VERSION,
    paragraphAlgorithmVersion: PARAGRAPH_ALGORITHM_VERSION,
    createdAt: Date.now(),
  });
}

// Items within this many PDF-space units of vertical position are treated as the
// same visual line (matches the tolerance already used for sort-order grouping).
const Y_TOLERANCE = 3;

// A line gap larger than this multiple of the page's median line gap is treated as
// a paragraph/section break rather than a wrapped line within the same paragraph.
const PARAGRAPH_GAP_MULTIPLIER = 1.4;

// Column detection thresholds.
// The horizontal X-start range of all items on a single-column page is typically
// narrow (<150 PDF units). A two-column page spans both columns, so xSpan is much
// larger. A gap of COLUMN_GAP_MIN_PTS between consecutive sorted X-starts in the
// middle of the page signals a column gutter.
const COLUMN_MIN_X_SPAN = 150;
const COLUMN_GAP_MIN_PTS = 40;

/**
 * Detects a two-column layout by looking for a large horizontal gap in item
 * X-start positions. Returns the midpoint of the gap (the column boundary) or
 * null if the page appears to be single-column.
 */
function detectColumnSplit(items: PdfTextItem[]): number | null {
  if (items.length < 10) return null;

  const xs = items.map(it => it.transform?.[4] ?? 0).sort((a, b) => a - b);
  const xMin = xs[0];
  const xMax = xs[xs.length - 1];
  const xSpan = xMax - xMin;
  if (xSpan < COLUMN_MIN_X_SPAN) return null;

  let maxGap = 0;
  let gapMid = -1;
  for (let i = 1; i < xs.length; i++) {
    const gap = xs[i] - xs[i - 1];
    if (gap > maxGap) { maxGap = gap; gapMid = (xs[i] + xs[i - 1]) / 2; }
  }

  if (maxGap < COLUMN_GAP_MIN_PTS) return null;

  // The boundary must fall in the middle 50% of the X span (not at the edges),
  // otherwise it is a margin/indent gap, not a column gutter.
  const relPos = (gapMid - xMin) / xSpan;
  return relPos >= 0.25 && relPos <= 0.75 ? gapMid : null;
}

// ── Shared reading-order sequencing ──────────────────────────────────────────
//
// The SAME column-detection + sort logic that decides paragraph text order
// here is also what lib/page-intelligence/textLayerIndex.ts's
// buildPageTextIndex() must use to build its token index — otherwise the two
// registries built from the SAME raw PDF.js items (one used to build/verify
// a highlight quote, the other used to LOCATE that quote's geometry) can
// disagree on ordering on a real two-column page, since PDF.js's own item
// array order depends on the source PDF's content stream and is not
// guaranteed to already be in left-column-then-right-column reading order.
// orderItemsForReading() is the ONE place this ordering decision is made;
// buildColumnFull() below and buildPageTextIndex() both consume its output
// instead of independently re-deriving (or, previously in
// buildPageTextIndex's case, never deriving) reading order.

export interface OrderedReadingItems<T> {
  /** All non-empty items, reordered into final reading order: column 1
   *  (left, or the whole page when no split is detected) fully before
   *  column 2, each column sorted top-to-bottom then left-to-right. */
  items: T[];
  /** `items.slice(0, columnBoundary)` is column 1; `items.slice(columnBoundary)`
   *  is column 2. Equals `items.length` when no column split was detected
   *  (the whole page is one column). */
  columnBoundary: number;
  /** True when a two-column layout was detected. */
  hasColumnSplit: boolean;
}

function sortReadingOrder<T extends { transform?: number[] }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const ay = a.transform?.[5] ?? 0;
    const by = b.transform?.[5] ?? 0;
    const yDiff = by - ay;
    if (Math.abs(yDiff) > Y_TOLERANCE) return yDiff;
    return (a.transform?.[4] ?? 0) - (b.transform?.[4] ?? 0);
  });
}

/**
 * Filters out empty items and reorders the rest into final reading order —
 * column split (if any) detected the same way buildStructuredPageText
 * always has, each column sorted top-to-bottom then left-to-right. Does NOT
 * do any text assembly (line grouping, paragraph breaks, hyphenation) —
 * just decides visitation order, so every consumer that needs "the same
 * order the reader would read this page in" gets it from one place.
 */
export function orderItemsForReading<T extends { str?: string; transform?: number[] }>(
  items: T[],
): OrderedReadingItems<T> {
  const filtered = items.filter(it => typeof it.str === "string" && it.str.trim().length > 0);
  if (filtered.length === 0) return { items: [], columnBoundary: 0, hasColumnSplit: false };

  const columnSplit = detectColumnSplit(filtered);
  if (columnSplit === null) {
    const sorted = sortReadingOrder(filtered);
    return { items: sorted, columnBoundary: sorted.length, hasColumnSplit: false };
  }

  const left  = sortReadingOrder(filtered.filter(it => (it.transform?.[4] ?? 0) <  columnSplit));
  const right = sortReadingOrder(filtered.filter(it => (it.transform?.[4] ?? 0) >= columnSplit));
  return { items: [...left, ...right], columnBoundary: left.length, hasColumnSplit: true };
}

// Internal result type for the full column builder.
interface ColumnResult {
  text: string;
  /** Item indexes grouped by paragraph, in reading order. */
  paragraphItems: number[][];
}

/**
 * Reconstruct reading-order text from items in one column (or the full page),
 * ALREADY sorted into reading order by orderItemsForReading — this function
 * only does line grouping, paragraph-break detection, and hyphenation
 * merging; it does not sort.
 * Returns both the text and a per-paragraph record of which PDF.js item indexes
 * contributed — used by buildStructuredPageTextFull() to assemble the bridge.
 */
function buildColumnFull(sorted: PdfTextItem[]): ColumnResult {
  const lines: { y: number; text: string; itemIdxs: number[] }[] = [];
  for (const item of sorted) {
    const y = item.transform?.[5] ?? 0;
    const str = item.str ?? "";
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - y) <= Y_TOLERANCE) {
      last.text += (last.text.endsWith(" ") || str.startsWith(" ") ? "" : " ") + str;
      if (item.itemIndex !== undefined) last.itemIdxs.push(item.itemIndex);
    } else {
      lines.push({ y, text: str, itemIdxs: item.itemIndex !== undefined ? [item.itemIndex] : [] });
    }
  }

  for (const line of lines) line.text = line.text.replace(/\s+/g, " ").trim();
  const nonEmpty = lines.filter(l => l.text.length > 0);

  if (nonEmpty.length === 0) return { text: "", paragraphItems: [] };
  if (nonEmpty.length === 1) {
    return { text: nonEmpty[0].text.trim(), paragraphItems: [nonEmpty[0].itemIdxs] };
  }

  // Median gap between consecutive line baselines ≈ single-line spacing on this page.
  const gaps: number[] = [];
  for (let i = 1; i < nonEmpty.length; i++) gaps.push(Math.abs(nonEmpty[i - 1].y - nonEmpty[i].y));
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)] || 0;

  let out = nonEmpty[0].text;
  const paragraphItems: number[][] = [];
  let currentItems: number[] = [...nonEmpty[0].itemIdxs];

  for (let i = 1; i < nonEmpty.length; i++) {
    const gap = gaps[i - 1];
    const prevText = nonEmpty[i - 1].text;
    const nextText = nonEmpty[i].text;

    if (medianGap > 0 && gap > medianGap * PARAGRAPH_GAP_MULTIPLIER) {
      paragraphItems.push(currentItems);
      currentItems = [...nonEmpty[i].itemIdxs];
      out += "\n\n" + nextText;
      continue;
    }

    // Merge hyphenated words split across a line wrap: "...exam-" + "ple" -> "...example"
    if (/[A-Za-z]-$/.test(prevText) && /^[a-z]/.test(nextText)) {
      currentItems = [...currentItems, ...nonEmpty[i].itemIdxs];
      out = out.slice(0, -1) + nextText;
      continue;
    }

    currentItems = [...currentItems, ...nonEmpty[i].itemIdxs];
    out += " " + nextText;
  }
  paragraphItems.push(currentItems);

  return { text: out.replace(/[ \t]+/g, " ").trim(), paragraphItems };
}

/**
 * Reconstruct reading-order text from a set of items that all belong to the same
 * column (or the full page when no column split is detected). Sorts items top-to-
 * bottom then left-to-right, groups into lines by Y proximity, and classifies
 * line gaps as wrapped lines vs. paragraph breaks.
 */
function buildColumn(items: PdfTextItem[]): string {
  return buildColumnFull(items).text;
}

/**
 * Reconstruct a page's text using item geometry to recover line and paragraph
 * structure that a flat `.join(" ")` discards. When a two-column layout is
 * detected, each column is processed independently so the entire left column
 * appears before the right column in the output — matching visual reading order
 * and preventing sentence-order jumps in Current Page speech playback.
 */
export function buildStructuredPageText(items: PdfTextItem[]): string {
  const { items: ordered, columnBoundary, hasColumnSplit } = orderItemsForReading(items);
  if (ordered.length === 0) return "";

  if (hasColumnSplit) {
    // Two-column layout: process each column independently then concatenate.
    // Full-width items (chapter headings, captions) typically start near the
    // left margin and fall into the "left" group, appearing first — correct.
    const left  = ordered.slice(0, columnBoundary);
    const right = ordered.slice(columnBoundary);
    const leftText  = buildColumn(left).trim();
    const rightText = buildColumn(right).trim();
    return [leftText, rightText].filter(Boolean).join("\n\n").replace(/[ \t]+/g, " ").trim();
  }

  return buildColumn(ordered).replace(/[ \t]+/g, " ").trim();
}

// ── Bridge computation helpers ────────────────────────────────────────────────

/**
 * Given the assembled structured text and the per-paragraph item-index arrays
 * (in reading order), compute ParagraphMapping entries whose char offsets match
 * what extractParagraphs() produces when splitting the same text on /\n\s*\n/.
 */
function buildBridgeFromText(text: string, allParagraphItems: number[][]): StructuredPageBridge {
  if (!text || allParagraphItems.length === 0) return { paragraphMappings: [] };

  const paragraphMappings: ParagraphMapping[] = [];
  const sep = "\n\n";
  const parts = text.split(sep);
  let offset = 0;
  let paraIdx = 0;

  for (const part of parts) {
    if (part.trim().length > 0) {
      paragraphMappings.push({
        startChar: offset,
        endChar: offset + part.length,
        itemIndexes: allParagraphItems[paraIdx] ?? [],
      });
    }
    offset += part.length + sep.length;
    paraIdx++;
  }

  return { paragraphMappings };
}

/**
 * Like buildStructuredPageText() but also returns a StructuredPageBridge that
 * maps each paragraph's char offsets back to the PDF.js item indexes that
 * produced it. The text output is byte-for-byte identical to buildStructuredPageText().
 *
 * Requires items to have itemIndex populated (done by pdfjs-handler before calling).
 * If itemIndex is absent on all items the bridge will still be produced but with
 * empty itemIndexes arrays — callers treat that as a "fuzzy" grounding.
 */
export function buildStructuredPageTextFull(items: PdfTextItem[]): { text: string; bridge: StructuredPageBridge } {
  const { items: ordered, columnBoundary, hasColumnSplit } = orderItemsForReading(items);
  if (ordered.length === 0) return { text: "", bridge: { paragraphMappings: [] } };

  let text: string;
  let allParagraphItems: number[][];

  if (hasColumnSplit) {
    const left  = ordered.slice(0, columnBoundary);
    const right = ordered.slice(columnBoundary);
    const leftResult  = buildColumnFull(left);
    const rightResult = buildColumnFull(right);
    const leftText  = leftResult.text.trim();
    const rightText = rightResult.text.trim();
    text = [leftText, rightText].filter(Boolean).join("\n\n").replace(/[ \t]+/g, " ").trim();
    allParagraphItems = [...leftResult.paragraphItems, ...rightResult.paragraphItems];
  } else {
    const result = buildColumnFull(ordered);
    text = result.text.replace(/[ \t]+/g, " ").trim();
    allParagraphItems = result.paragraphItems;
  }

  return { text, bridge: buildBridgeFromText(text, allParagraphItems) };
}
